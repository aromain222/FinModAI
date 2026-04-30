import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFinancialModelAnalysis, type TradingSignal } from '@/lib/news/tradingSignal';
import { applyModelImpact, DEFAULT_BASE_MODEL, runDCF, type DCFInputs } from '@/lib/finance/dcfEngine';

const requestSchema = z.object({
  event: z.string().min(1),
  context: z.string().optional(),
  base_model: z
    .object({
      growth: z.number(),
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
  primaryDriver: ModelDeltas['primary_driver']
) {
  const confidence = analysis?.confidence ?? 0.45;
  const derivedPosition =
    Math.abs(valuationChange) < 0.01 || confidence < 0.35
      ? 'NEUTRAL'
      : valuationChange > 0
        ? 'LONG'
        : 'SHORT';
  const position = analysis?.signal?.position ?? derivedPosition;
  const conviction = round(Math.min(0.9, Math.max(0.15, analysis?.signal?.conviction ?? confidence * Math.min(1, Math.abs(valuationChange) * 8))));
  const sizePct =
    position === 'NEUTRAL'
      ? 0
      : round(Math.min(10, Math.max(1, analysis?.signal?.size_pct ?? conviction * 10)), 1);

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
    margin: baseModel.margin,
    discountRate: baseModel.discountRate,
    terminalGrowth: baseModel.terminalGrowth,
  };
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

  const { event, context, base_model } = parsed.data;
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

  const baseVal = runDCF(baseModel).value;
  const updatedModel = applyModelImpact(baseModel, deltas);
  const newVal = runDCF(updatedModel).value;
  const valuationChange = baseVal > 0 ? (newVal - baseVal) / baseVal : 0;
  const direction =
    valuationChange > 0.005 ? 'bullish' : valuationChange < -0.005 ? 'bearish' : 'neutral';
  const scenarios = normalizeScenarios(analysis, valuationChange);
  const signal = buildSignal(analysis, valuationChange, deltas.primary_driver);

  return NextResponse.json({
    impact_summary: {
      direction,
      primary_driver: deltas.primary_driver,
      valuation_change: round(valuationChange),
      base_valuation: round(baseVal, 2),
      new_valuation: round(newVal, 2),
    },
    model_changes: {
      growth_delta: deltas.growth_delta,
      margin_delta: deltas.margin_delta,
      discount_rate_delta: deltas.discount_rate_delta,
    },
    scenarios,
    signal,
    confidence: analysis?.confidence ?? null,
  });
}
