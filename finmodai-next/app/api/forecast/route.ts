import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { fetchHistoricalFinancials } from '@/lib/data/historicalFinancials';
import { computeDirectionalAccuracy } from '@/lib/forecasting/accuracy';
import { computeForecastAttribution, type ForecastAttribution } from '@/lib/forecasting/attribution';
import { computeAdjustedConfidence, computeForecastConfidence } from '@/lib/forecasting/confidence';
import { getForecastHistory, saveForecastRecord, type ForecastDirection } from '@/lib/forecasting/history';
import { forecastSeries, type ForecastResponse } from '@/lib/forecasting/timesfm';
import { runForecast, type BaseAssumptions, type ScenarioAssumptions } from '@/lib/scenarioEngine';
import { buildGrowthPathFromForecast } from '@/lib/valuation/forecastBridge';

type ForecastLayerRequest = {
  ticker: string;
  type: 'revenue' | 'macro';
  horizon?: number;
};

type LegacyForecastRequest = {
  baseAssumptions?: BaseAssumptions;
  ticker?: string;
  periods?: number;
  frequency?: 'quarterly' | 'yearly';
};

type FredObservation = {
  value?: string;
};

type FredResponse = {
  observations?: FredObservation[];
};

const forecastCache = new Map<string, { expiresAt: number; value: ForecastResponse }>();
const FORECAST_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_ATTRIBUTION: ForecastAttribution = {
  delta: [],
  primaryDriver: 'mixed',
  explanation: 'Forecast attribution unavailable; using baseline assumptions',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isForecastLayerRequest(value: unknown): value is ForecastLayerRequest {
  return (
    isRecord(value) &&
    typeof value.ticker === 'string' &&
    value.ticker.trim().length > 0 &&
    (value.type === 'revenue' || value.type === 'macro')
  );
}

function isBaseAssumptions(value: unknown): value is BaseAssumptions {
  return (
    isRecord(value) &&
    typeof value.ticker === 'string' &&
    typeof value.revenue === 'number' &&
    typeof value.revenueGrowth === 'number' &&
    typeof value.ebitdaMargin === 'number'
  );
}

function parseLegacyForecastRequest(value: unknown): LegacyForecastRequest {
  if (!isRecord(value)) return {};
  return {
    baseAssumptions: isBaseAssumptions(value.baseAssumptions) ? value.baseAssumptions : undefined,
    ticker: typeof value.ticker === 'string' ? value.ticker : undefined,
    periods: typeof value.periods === 'number' ? value.periods : undefined,
    frequency: value.frequency === 'yearly' ? 'yearly' : 'quarterly',
  };
}

function cacheKey(request: ForecastLayerRequest): string {
  return `${request.type}:${request.ticker.trim().toUpperCase()}:${request.horizon ?? 'default'}`;
}

function getCachedForecast(key: string): ForecastResponse | null {
  const cached = forecastCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    forecastCache.delete(key);
    return null;
  }
  return { ...cached.value, cached: true };
}

function setCachedForecast(key: string, value: ForecastResponse): void {
  forecastCache.set(key, {
    expiresAt: Date.now() + FORECAST_CACHE_TTL_MS,
    value: { ...value, cached: false },
  });
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function normalizeRevenueHistory(values: number[]): number[] {
  return values
    .filter((value) => Number.isFinite(value) && value > 0)
    .reverse();
}

async function fetchRevenueHistory(ticker: string): Promise<number[]> {
  const historical = await fetchHistoricalFinancials(ticker, 6).catch(() => null);
  const revenue = historical ? normalizeRevenueHistory(historical.revenue) : [];
  if (revenue.length >= 2) return revenue;
  return [100, 105, 110, 116, 122];
}

async function fetchMacroHistory(): Promise<number[]> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) return [4.5, 4.6, 4.7, 4.65, 4.55, 4.5];

  try {
    const url = new URL('https://api.stlouisfed.org/fred/series/observations');
    url.searchParams.set('series_id', 'DGS10');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', '24');
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return [4.5, 4.6, 4.7, 4.65, 4.55, 4.5];
    const data = (await response.json()) as FredResponse;
    const values = (data.observations ?? [])
      .map((observation) => Number(observation.value))
      .filter((value) => Number.isFinite(value))
      .reverse();
    return values.length >= 2 ? values : [4.5, 4.6, 4.7, 4.65, 4.55, 4.5];
  } catch {
    return [4.5, 4.6, 4.7, 4.65, 4.55, 4.5];
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
  const growth = historicalGrowth(values);
  const latestGrowth = growth.at(-1) ?? 0;
  return Array.from({ length: horizon }, () => latestGrowth);
}

function buildForecastGrowth(historical: number[], forecast: number[], horizon: number): number[] {
  const lastActual = historical.at(-1);
  if (typeof lastActual !== 'number' || !Number.isFinite(lastActual) || lastActual <= 0) {
    return buildBaselineGrowth(historical, horizon);
  }

  const growth = buildGrowthPathFromForecast(forecast, lastActual).slice(0, horizon);
  return growth.length > 0 ? growth : buildBaselineGrowth(historical, horizon);
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

function safeFallbackResponse(request: ForecastLayerRequest, warning: string): ForecastResponse {
  const horizon = request.horizon ?? (request.type === 'revenue' ? 5 : 8);
  const historical = request.type === 'revenue' ? [100, 105, 110, 116, 122] : [4.5, 4.6, 4.7, 4.65, 4.55, 4.5];
  const forecast = Array.from({ length: horizon }, () => historical.at(-1) ?? 0);
  return {
    ticker: request.ticker.trim().toUpperCase(),
    type: request.type,
    historical,
    forecast,
    confidence: 0.5,
    baseConfidence: 0.5,
    accuracy: 0.5,
    accuracySampleSize: 0,
    modelConfidence: Array.from({ length: horizon }, () => 0.25),
    attribution: DEFAULT_ATTRIBUTION,
    source: 'flat_fallback',
    cached: false,
    warning,
  };
}

async function handleForecastLayerRequest(request: ForecastLayerRequest): Promise<NextResponse<ForecastResponse>> {
  const normalizedRequest: ForecastLayerRequest = {
    ticker: request.ticker.trim().toUpperCase(),
    type: request.type,
    horizon: Math.min(20, Math.max(1, Math.round(request.horizon ?? (request.type === 'revenue' ? 5 : 8)))),
  };
  const key = cacheKey(normalizedRequest);
  const cached = getCachedForecast(key);
  if (cached) return NextResponse.json(cached);

  try {
    const horizon = normalizedRequest.horizon ?? 5;
    const historical =
      normalizedRequest.type === 'revenue'
        ? await fetchRevenueHistory(normalizedRequest.ticker)
        : await fetchMacroHistory();
    const result = await forecastSeries({ series: historical, horizon });
    const statisticalConfidence = computeForecastConfidence({
      historical,
      forecast: result.forecast,
    });
    const modelConfidence = averageConfidence(result.confidence);
    const baseConfidence = Number(
      (modelConfidence === null
        ? statisticalConfidence.confidence
        : (statisticalConfidence.confidence + modelConfidence) / 2
      ).toFixed(2),
    );
    const accuracy = await directionalAccuracyForTicker(normalizedRequest.ticker);
    const confidence = computeAdjustedConfidence({
      baseConfidence,
      accuracy: accuracy.accuracy,
    });
    const baselineGrowth = buildBaselineGrowth(historical, horizon);
    const forecastGrowth = buildForecastGrowth(historical, result.forecast, horizon);
    const attribution = computeForecastAttribution({
      baselineGrowth,
      forecastGrowth,
      macroSeries: normalizedRequest.type === 'macro' ? historical : undefined,
    });
    const payload: ForecastResponse = {
      ticker: normalizedRequest.ticker,
      type: normalizedRequest.type,
      historical,
      forecast: result.forecast,
      confidence,
      baseConfidence,
      accuracy: accuracy.accuracy,
      accuracySampleSize: accuracy.sampleSize,
      modelConfidence: result.confidence,
      attribution,
      source: result.source,
      cached: false,
      warning: result.warning,
    };
    void saveForecastRecord({
      id: randomId(),
      ticker: normalizedRequest.ticker,
      forecast: result.forecast,
      predictedDirection: predictedDirection(historical, result.forecast),
      timestamp: Date.now(),
      horizon,
    });
    setCachedForecast(key, payload);
    return NextResponse.json(payload);
  } catch (error) {
    const fallback = safeFallbackResponse(
      normalizedRequest,
      error instanceof Error ? `Forecast request failed: ${error.message}` : 'Forecast request failed.',
    );
    setCachedForecast(key, fallback);
    return NextResponse.json(fallback);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (isForecastLayerRequest(body)) {
    return handleForecastLayerRequest(body);
  }

  const legacy = parseLegacyForecastRequest(body);
  if (!legacy.baseAssumptions) {
    return NextResponse.json({ error: 'baseAssumptions required' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scenario: ScenarioAssumptions = {
    name: `${legacy.frequency === 'quarterly' ? 'Quarterly' : 'Yearly'} Forecast`,
  };

  const forecast = await runForecast(legacy.baseAssumptions, scenario, Number(legacy.periods ?? 4));

  return NextResponse.json(forecast);
}
