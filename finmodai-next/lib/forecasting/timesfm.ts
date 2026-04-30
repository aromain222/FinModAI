import type { ForecastAttribution } from '@/lib/forecasting/attribution';

export type ForecastSeriesInput = {
  series: number[];
  horizon: number;
};

export type ForecastSeries = {
  forecast: number[];
  confidence?: number[];
  source: 'timesfm' | 'flat_fallback';
  warning?: string;
};

export type ForecastResponse = {
  ticker: string;
  type: 'revenue' | 'macro';
  historical: number[];
  forecast: number[];
  confidence: number;
  modelConfidence?: number[];
  attribution: ForecastAttribution;
  source: ForecastSeries['source'];
  cached: boolean;
  warning?: string;
};

type TimesFmApiResponse = {
  forecast?: unknown;
  confidence?: unknown;
};

const MAX_HORIZON = 20;
const TIMESFM_TIMEOUT_MS = 2000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSeries(series: number[]): number[] {
  return series.filter((value) => Number.isFinite(value));
}

function flatProjection(series: number[], horizon: number, warning: string): ForecastSeries {
  const last = series.at(-1) ?? 0;
  return {
    forecast: Array.from({ length: horizon }, () => last),
    confidence: Array.from({ length: horizon }, () => 0.25),
    source: 'flat_fallback',
    warning,
  };
}

function validateForecast(rawForecast: unknown, rawConfidence: unknown, lastActual: number, horizon: number): ForecastSeries | null {
  if (!Array.isArray(rawForecast)) return null;
  const forecast = rawForecast
    .slice(0, horizon)
    .map((value) => (isFiniteNumber(value) ? value : null))
    .filter((value): value is number => value !== null);

  if (forecast.length !== horizon) return null;

  const lowerBound = lastActual * 0.2;
  const upperBound = lastActual * 5;
  const sanitized = forecast.map((value, index) => {
    const previous = index === 0 ? lastActual : forecast[index - 1];
    const maxStepUp = previous * 1.4;
    const maxStepDown = previous * 0.6;
    return Number(clamp(value, Math.max(0, lowerBound, maxStepDown), Math.max(upperBound, maxStepUp)).toFixed(4));
  });

  const confidence = Array.isArray(rawConfidence)
    ? rawConfidence
        .slice(0, horizon)
        .map((value) => (isFiniteNumber(value) ? clamp(value, 0, 1) : null))
        .filter((value): value is number => value !== null)
    : undefined;

  return {
    forecast: sanitized,
    confidence: confidence && confidence.length === horizon ? confidence : undefined,
    source: 'timesfm',
  };
}

function endpointUrl(): string | null {
  const explicit = process.env.TIMESFM_FORECAST_URL?.trim();
  if (explicit) return explicit;
  const backend = process.env.PYTHON_BACKEND_URL?.trim();
  return backend ? `${backend.replace(/\/+$/, '')}/api/v1/timesfm/series` : null;
}

export async function forecastSeries(input: ForecastSeriesInput): Promise<ForecastSeries> {
  const series = normalizeSeries(input.series);
  const horizon = Math.min(MAX_HORIZON, Math.max(1, Math.round(input.horizon)));

  if (series.length === 0) {
    return flatProjection([0], horizon, 'Forecast input series was empty.');
  }

  const lastActual = series.at(-1);
  if (!isFiniteNumber(lastActual)) {
    return flatProjection(series, horizon, 'Forecast input series did not include a valid latest value.');
  }

  const url = endpointUrl();
  if (!url) {
    return flatProjection(series, horizon, 'TimesFM endpoint is not configured.');
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series, horizon }),
      signal: AbortSignal.timeout(TIMESFM_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) {
      return flatProjection(series, horizon, `TimesFM endpoint returned ${response.status}.`);
    }

    const data = (await response.json()) as TimesFmApiResponse;
    const validated = validateForecast(data.forecast, data.confidence, lastActual, horizon);
    return validated ?? flatProjection(series, horizon, 'TimesFM response failed validation.');
  } catch (error) {
    return flatProjection(
      series,
      horizon,
      error instanceof Error ? `TimesFM request failed: ${error.message}` : 'TimesFM request failed.',
    );
  }
}
