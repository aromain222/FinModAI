import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { fetchHistoricalFinancials } from '@/lib/data/historicalFinancials';
import { forecastSeries, type ForecastResponse } from '@/lib/forecasting/timesfm';
import { runForecast, type BaseAssumptions, type ScenarioAssumptions } from '@/lib/scenarioEngine';

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

async function handleForecastLayerRequest(request: ForecastLayerRequest): Promise<NextResponse<ForecastResponse>> {
  const normalizedRequest: ForecastLayerRequest = {
    ticker: request.ticker.trim().toUpperCase(),
    type: request.type,
    horizon: Math.min(20, Math.max(1, Math.round(request.horizon ?? (request.type === 'revenue' ? 5 : 8)))),
  };
  const key = cacheKey(normalizedRequest);
  const cached = getCachedForecast(key);
  if (cached) return NextResponse.json(cached);

  const historical =
    normalizedRequest.type === 'revenue'
      ? await fetchRevenueHistory(normalizedRequest.ticker)
      : await fetchMacroHistory();
  const result = await forecastSeries({ series: historical, horizon: normalizedRequest.horizon ?? 5 });
  const payload: ForecastResponse = {
    ticker: normalizedRequest.ticker,
    type: normalizedRequest.type,
    historical,
    forecast: result.forecast,
    confidence: result.confidence,
    source: result.source,
    cached: false,
    warning: result.warning,
  };
  setCachedForecast(key, payload);
  return NextResponse.json(payload);
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
