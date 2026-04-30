import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFinancialModelAnalysis, type TradingSignal } from '@/lib/news/tradingSignal';
import { applyModelImpact, DEFAULT_BASE_MODEL, runDCF, type DCFInputs } from '@/lib/finance/dcfEngine';
import { fetchHistoricalFinancials } from '@/lib/data/historicalFinancials';
import { computeDirectionalAccuracy } from '@/lib/forecasting/accuracy';
import { computeForecastAttribution, type ForecastAttribution } from '@/lib/forecasting/attribution';
import { computeAdjustedConfidence, computeForecastConfidence } from '@/lib/forecasting/confidence';
import { getForecastHistory, saveForecastRecord, type ForecastDirection } from '@/lib/forecasting/history';
import { forecastSeries } from '@/lib/forecasting/timesfm';
import { buildGrowthPathFromForecast } from '@/lib/valuation/forecastBridge';

const requestSchema = z.object({
  event: z.string().min(1),
  context: z.string().optional(),
  ticker: z.string().optional(),
  use_ai_forecast: z.boolean().optional(),
  base_model: z
    .object({
      growth: z.number(),
      revenueGrowth: z.number().optional(),
      revenueGrowthPath: z.array(z.number()).optional(),
      margin: z.number(),
      discountRate: z.number(),
    })
    .optional(),
});

type ModelDeltas = {
  growth_delta: number;
  margin_delta: number;
  discount_rate_delta: number;
  primary_driver: 'growth' | 'margin' | 'discount_rate';
};

type ScenarioCase = {
  probability: number;
  expected_direction: 'up' | 'neutral' | 'down';
  magnitude: number;
};

type EventKind = 'rates' | 'inflation' | 'company_specific';
type ConfidenceBand = 'low' | 'medium' | 'high';

type ForecastEnrichment = {
  model: DCFInputs;
  growthPath: number[];
  confidence: number;
  baseConfidence: number;
  accuracy: number;
  accuracySampleSize: number;
  confidenceBand: ConfidenceBand;
  attribution: ForecastAttribution;
  source: 'timesfm' | 'flat_fallback';
  warning?: string;
};

const DEFAULT_MACRO_SERIES = [4.5, 4.6, 4.7, 4.65, 4.55, 4.5];
const DEFAULT_ATTRIBUTION: ForecastAttribution = {
  delta: [],
  primaryDriver: 'mixed',
  explanation: 'Forecast attribution unavailable; using baseline assumptions',
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 4): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function normalizePrimaryDriver(value: unknown): ModelDeltas['primary_driver'] {
  return value === 'margin' || value === 'discount_rate' || value === 'growth' ? value : 'growth';
}

function inferFallbackDeltas(content: string): ModelDeltas {
  const text = content.toLowerCase();
  const positive = /\b(beat|beats|strong|accelerat|upgrade|easing|rate cut|cuts rates|approval|record|surge)\b/.test(text);
  const negative = /\b(miss|weak|slowdown|tariff|sanction|war|conflict|risk|higher yield|higher rates|inflation|default|probe|ban)\b/.test(text);
  const direction = positive && !negative ? 1 : -1;

  if (/\b(rate|yield|inflation|fed|central bank|credit|liquidity|war|conflict|sanction|geopolitical)\b/.test(text)) {
    return {
      growth_delta: 0,
      margin_delta: 0,
      discount_rate_delta: direction > 0 ? -0.003 : 0.004,
      primary_driver: 'discount_rate',
    };
  }

  if (/\b(margin|cost|wage|tariff|input|supply|pricing|freight)\b/.test(text)) {
    return {
      growth_delta: 0,
      margin_delta: direction > 0 ? 0.003 : -0.003,
      discount_rate_delta: 0,
      primary_driver: 'margin',
    };
  }

  return {
    growth_delta: direction > 0 ? 0.005 : -0.005,
    margin_delta: 0,
    discount_rate_delta: 0,
    primary_driver: 'growth',
  };
}

function normalizeDeltas(analysis: TradingSignal | null, content: string): ModelDeltas {
  const fallback = inferFallbackDeltas(content);
  const impact = analysis?.model_impact;
  if (!impact) return fallback;

  return {
    growth_delta: round(clamp(impact.growth_delta, -0.05, 0.05)),
    margin_delta: round(clamp(impact.margin_delta, -0.03, 0.03)),
    discount_rate_delta: round(clamp(impact.discount_rate_delta, -0.03, 0.03)),
    primary_driver: normalizePrimaryDriver(impact.primary_driver),
  };
}

function scenarioDirection(magnitude: number): ScenarioCase['expected_direction'] {
  if (magnitude > 0.005) return 'up';
  if (magnitude < -0.005) return 'down';
  return 'neutral';
}

function normalizeScenarios(
  analysis: TradingSignal | null,
  valuationChange: number
): Record<'bull' | 'base' | 'bear', ScenarioCase> {
  const raw = analysis?.scenarios;
  const fallback = {
    bull: round(Math.max(valuationChange * 1.5, valuationChange + 0.03)),
    base: round(valuationChange),
    bear: round(Math.min(valuationChange * 1.5, valuationChange - 0.03)),
  };

  const bullMagnitude = raw?.bull?.impact ?? fallback.bull;
  const baseMagnitude = raw?.base?.impact ?? fallback.base;
  const bearMagnitude = raw?.bear?.impact ?? fallback.bear;
  const bullProbability = raw?.bull?.probability ?? 0.25;
  const baseProbability = raw?.base?.probability ?? 0.5;
  const bearProbability = raw?.bear?.probability ?? 0.25;
  const totalProbability = bullProbability + baseProbability + bearProbability || 1;
  const normalizedBullProbability = round(bullProbability / totalProbability, 2);
  const normalizedBearProbability = round(bearProbability / totalProbability, 2);
  const normalizedBaseProbability = round(1 - normalizedBullProbability - normalizedBearProbability, 2);

  return {
    bull: {
      probability: normalizedBullProbability,
      expected_direction: scenarioDirection(bullMagnitude),
      magnitude: round(bullMagnitude),
    },
    base: {
      probability: normalizedBaseProbability,
      expected_direction: scenarioDirection(baseMagnitude),
      magnitude: round(baseMagnitude),
    },
    bear: {
      probability: normalizedBearProbability,
      expected_direction: scenarioDirection(bearMagnitude),
      magnitude: round(bearMagnitude),
    },
  };
}

function buildSignal(
  analysis: TradingSignal | null,
  valuationChange: number,
  primaryDriver: ModelDeltas['primary_driver'],
  forecastConfidence: number | null,
) {
  const confidence = clamp(forecastConfidence ?? analysis?.confidence ?? 0.45, 0, 1);
  const derivedPosition =
    Math.abs(valuationChange) < 0.01 || confidence < 0.35
      ? 'NEUTRAL'
      : valuationChange > 0
        ? 'LONG'
        : 'SHORT';
  const position = analysis?.signal?.position ?? derivedPosition;
  const conviction = round(Math.min(0.9, Math.max(0.15, analysis?.signal?.conviction ?? confidence * Math.min(1, Math.abs(valuationChange) * 8))));
  const baseSizePct = Math.min(10, Math.max(1, analysis?.signal?.size_pct ?? conviction * 10));
  const sizePct =
    position === 'NEUTRAL'
      ? 0
      : round(Math.min(10, baseSizePct * confidence), 1);

  return {
    position,
    conviction,
    size_pct: sizePct,
    primary_driver: analysis?.signal?.primary_driver || primaryDriver,
  };
}

function normalizeBaseModel(baseModel: DCFInputs): DCFInputs {
  return {
    growth: baseModel.growth,
    revenueGrowth: baseModel.revenueGrowth,
    revenueGrowthPath: baseModel.revenueGrowthPath,
    margin: baseModel.margin,
    discountRate: baseModel.discountRate,
    terminalGrowth: baseModel.terminalGrowth,
  };
}

function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function averageConfidence(values: number[] | undefined): number | null {
  const finite = values?.filter((value) => Number.isFinite(value) && value >= 0 && value <= 1) ?? [];
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `forecast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function predictedDirection(historical: number[], forecast: number[]): ForecastDirection {
  const lastActual = historical.at(-1);
  const lastForecast = forecast.at(-1);
  if (typeof lastActual !== 'number' || typeof lastForecast !== 'number') return 'down';
  return lastForecast >= lastActual ? 'up' : 'down';
}

async function directionalAccuracyForTicker(ticker: string): Promise<{ accuracy: number; sampleSize: number }> {
  try {
    return computeDirectionalAccuracy(await getForecastHistory(ticker));
  } catch {
    return { accuracy: 0.5, sampleSize: 0 };
  }
}

function historicalGrowth(values: number[]): number[] {
  const growth: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (Number.isFinite(previous) && previous > 0 && Number.isFinite(current)) {
      growth.push(clamp(current / previous - 1, -0.4, 0.4));
    }
  }
  return growth;
}

function buildBaselineGrowth(values: number[], horizon: number): number[] {
  const latestGrowth = historicalGrowth(values).at(-1) ?? 0;
  return Array.from({ length: horizon }, () => latestGrowth);
}

function detectEventKind(content: string): EventKind {
  const text = content.toLowerCase();
  if (/\b(rate|rates|yield|yields|fed|central bank|wacc|treasury)\b/.test(text)) return 'rates';
  if (/\b(inflation|cpi|ppi|prices|price pressure|disinflation)\b/.test(text)) return 'inflation';
  return 'company_specific';
}

function eventDirection(content: string): 1 | -1 {
  const text = content.toLowerCase();
  const positive = /\b(beat|beats|strong|accelerat|upgrade|easing|rate cut|rates down|cuts rates|approval|record|surge|declining rate|lower rates|disinflation)\b/.test(text);
  const negative = /\b(miss|weak|slowdown|tariff|sanction|war|conflict|risk|higher yield|higher rates|rates rise|inflation|default|probe|ban|rising rate)\b/.test(text);
  return positive && !negative ? 1 : -1;
}

function conditionRevenueSeries(revenue: number[], eventKind: EventKind, content: string, deltas: ModelDeltas): number[] {
  if (eventKind !== 'company_specific' || revenue.length === 0) return revenue;
  const direction = eventDirection(content);
  const shock = clamp(deltas.growth_delta !== 0 ? deltas.growth_delta : direction * 0.015, -0.05, 0.05);
  return revenue.map((value, index) => (index === revenue.length - 1 ? Number((value * (1 + shock)).toFixed(4)) : value));
}

function conditionMacroSeries(eventKind: EventKind, content: string): number[] {
  const direction = eventDirection(content);
  const shift = eventKind === 'rates' ? direction * -0.5 : eventKind === 'inflation' ? direction * -0.35 : 0;
  return DEFAULT_MACRO_SERIES.map((value, index) =>
    index === DEFAULT_MACRO_SERIES.length - 1 ? Number((value + shift).toFixed(4)) : value,
  );
}

function macroDiscountRateDelta(eventKind: EventKind, content: string): number {
  if (eventKind !== 'rates' && eventKind !== 'inflation') return 0;
  const baseLast = DEFAULT_MACRO_SERIES.at(-1) ?? 0;
  const conditionedLast = conditionMacroSeries(eventKind, content).at(-1) ?? baseLast;
  return round(clamp((conditionedLast - baseLast) / 100, -0.015, 0.015));
}

async function buildEventConditionedForecast(
  baseModel: DCFInputs,
  ticker: string,
  content: string,
  deltas: ModelDeltas,
): Promise<ForecastEnrichment | null> {
  const historical = await fetchHistoricalFinancials(ticker, 6).catch(() => null);
  const revenue = historical?.revenue
    .filter((value) => Number.isFinite(value) && value > 0)
    .reverse() ?? [];
  const lastActual = revenue.at(-1);
  if (revenue.length < 2 || typeof lastActual !== 'number') return null;

  const eventKind = detectEventKind(content);
  const conditionedRevenue = conditionRevenueSeries(revenue, eventKind, content, deltas);
  const result = await forecastSeries({ series: conditionedRevenue, horizon: 5 });
  const growthPath = buildGrowthPathFromForecast(result.forecast, lastActual).slice(0, 5);
  if (growthPath.length === 0) return null;

  const statisticalConfidence = computeForecastConfidence({
    historical: revenue,
    forecast: result.forecast,
  });
  const modelConfidence = averageConfidence(result.confidence);
  const baseConfidence = round(
    modelConfidence === null
      ? statisticalConfidence.confidence
      : (statisticalConfidence.confidence + modelConfidence) / 2,
    2,
  );
  const accuracy = await directionalAccuracyForTicker(ticker);
  const confidence = computeAdjustedConfidence({
    baseConfidence,
    accuracy: accuracy.accuracy,
  });
  const macroSeries = eventKind === 'company_specific' ? undefined : conditionMacroSeries(eventKind, content);
  const attribution = computeForecastAttribution({
    baselineGrowth: buildBaselineGrowth(revenue, 5),
    forecastGrowth: growthPath,
    macroSeries,
  });
  void saveForecastRecord({
    id: randomId(),
    ticker,
    forecast: result.forecast,
    predictedDirection: predictedDirection(revenue, result.forecast),
    timestamp: Date.now(),
    horizon: 5,
  });

  return {
    model: {
      ...baseModel,
      revenueGrowthPath: growthPath,
    },
    growthPath,
    confidence,
    baseConfidence,
    accuracy: accuracy.accuracy,
    accuracySampleSize: accuracy.sampleSize,
    confidenceBand: confidenceBand(confidence),
    attribution,
    source: result.source,
    warning: result.warning,
  };
}

async function enrichBaseModelWithForecast(
  baseModel: DCFInputs,
  ticker: string | undefined,
  enabled: boolean | undefined,
  content: string,
  deltas: ModelDeltas,
): Promise<ForecastEnrichment | null> {
  if (!enabled || !ticker) return null;

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
  return Promise.race([buildEventConditionedForecast(baseModel, ticker, content, deltas), timeout]).catch(() => null);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing required field: event' }, { status: 400 });
  }

  const { event, context, base_model, ticker, use_ai_forecast } = parsed.data;
  const baseModel = normalizeBaseModel(base_model ?? DEFAULT_BASE_MODEL);

  const content = context ? `${event}. ${context}` : event;

  let analysis: TradingSignal | null = null;
  try {
    analysis = await getFinancialModelAnalysis({
      mode: 'EVENT_ANALYSIS',
      data: { content },
    });
  } catch {
    analysis = null;
  }

  const deltas = normalizeDeltas(analysis, content);
  const forecast = await enrichBaseModelWithForecast(baseModel, ticker, use_ai_forecast, content, deltas);
  const forecastDeltas: ModelDeltas = forecast
    ? {
        growth_delta: 0,
        margin_delta: deltas.margin_delta,
        discount_rate_delta: macroDiscountRateDelta(detectEventKind(content), content) || deltas.discount_rate_delta,
        primary_driver: deltas.primary_driver,
      }
    : deltas;

  const baseVal = runDCF(baseModel).value;
  const updatedModel = applyModelImpact(forecast?.model ?? baseModel, forecastDeltas);
  const newVal = runDCF(updatedModel).value;
  const valuationChange = baseVal > 0 ? (newVal - baseVal) / baseVal : 0;
  const direction =
    valuationChange > 0.005 ? 'bullish' : valuationChange < -0.005 ? 'bearish' : 'neutral';
  const scenarios = normalizeScenarios(analysis, valuationChange);
  const forecastConfidence = forecast?.confidence ?? null;
  const signal = buildSignal(analysis, valuationChange, forecastDeltas.primary_driver, forecastConfidence);
  const confidence = forecastConfidence ?? analysis?.confidence ?? null;
  const band = forecast ? forecast.confidenceBand : confidence === null ? null : confidenceBand(confidence);
  const attribution = forecast?.attribution ?? DEFAULT_ATTRIBUTION;
  const confidenceBreakdown = forecast
    ? {
        model: forecast.baseConfidence,
        accuracy: forecast.accuracy,
        sampleSize: forecast.accuracySampleSize,
      }
    : null;

  return NextResponse.json({
    impact_summary: {
      direction,
      primary_driver: forecastDeltas.primary_driver,
      valuation_change: round(valuationChange),
      base_valuation: round(baseVal, 2),
      new_valuation: round(newVal, 2),
      baseEV: round(baseVal, 2),
      scenarioEV: round(newVal, 2),
      percentChange: round(valuationChange),
      attributionExplanation: attribution.explanation,
      confidence,
      confidence_breakdown: confidenceBreakdown,
    },
    model_changes: {
      growth_delta: forecastDeltas.growth_delta,
      margin_delta: forecastDeltas.margin_delta,
      discount_rate_delta: forecastDeltas.discount_rate_delta,
    },
    scenarios,
    signal: {
      ...signal,
      confidence_band: band,
      confidence_breakdown: confidenceBreakdown,
    },
    attribution: {
      primaryDriver: attribution.primaryDriver,
      explanation: attribution.explanation,
      delta: attribution.delta,
    },
    forecast: forecast
      ? {
          growthPath: forecast.growthPath,
          source: forecast.source,
          warning: forecast.warning,
        }
      : null,
    baseEV: round(baseVal, 2),
    scenarioEV: round(newVal, 2),
    percentChange: round(valuationChange),
    primaryDriver: forecastDeltas.primary_driver,
    attributionExplanation: attribution.explanation,
    confidence,
    confidence_band: band,
    confidence_breakdown: confidenceBreakdown,
    accuracy: forecast?.accuracy ?? null,
    accuracySampleSize: forecast?.accuracySampleSize ?? 0,
  });
}
