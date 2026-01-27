import { notConfigured, providerFailure } from '@/lib/providers/errors';
import { keysPresent, getEnvOrNull } from '@/lib/env/server';
import { fetchWithTimeout, toErrorText } from '@/lib/providers/utils';
import type { MacroMetric, MacroResult } from '@/lib/providers/types';

export type FredPoint = { value: number; date: string };
export type FredSeriesPoint = { date: string; value: number };

const parseValue = (value: string) => {
  if (!value || value === '.') return null;
  const num = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
};

export async function fetchFredLatest(seriesId: string): Promise<FredPoint | null> {
  const apiKey = getEnvOrNull('FRED_API_KEY');
  if (!apiKey) throw notConfigured('fred');
  // FRED occasionally returns a most-recent observation with "." (missing) for the current period.
  // For demo readiness we scan a small window and take the most recent numeric value.
  const limit = 10;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(
    seriesId
  )}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetchWithTimeout(url, { cache: 'no-store' }, 8000);
  if (!res.ok) throw providerFailure('fred', `HTTP ${res.status}`, res.status);
  const json = await res.json();
  const observations = Array.isArray(json?.observations) ? json.observations : [];
  for (const obs of observations) {
    if (!obs || obs.value === '.') continue;
    const value = parseValue(obs.value);
    if (value == null) continue;
    const date = typeof obs.date === 'string' ? obs.date : '';
    if (!date) continue;
    return { value, date };
  }
  return null;
}

export const fetchFredSeries = async (seriesId: string, limit: number) => {
  const apiKey = getEnvOrNull('FRED_API_KEY');
  if (!apiKey) throw notConfigured('fred');
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(
    seriesId
  )}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetchWithTimeout(url, { cache: 'no-store' }, 8000);
  if (!res.ok) throw providerFailure('fred', `HTTP ${res.status}`, res.status);
  const json = await res.json();
  const observations = Array.isArray(json?.observations) ? json.observations : [];
  return observations
    .map((obs: any) => ({ date: obs.date, value: parseValue(obs.value) }))
    .filter((obs: { date: string; value: number | null }) => obs.value != null);
};

/**
 * Simplified FRED latest fetch for macro cards
 * Returns null if no API key (caller can decide how to handle)
 * This is a simpler version that returns seriesId in the result
 */
export async function fetchFredLatestForCards(
  seriesId: string,
  traceId?: string
): Promise<{ seriesId: string; date: string; value: number } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    // No key -> caller can decide how to handle
    return null;
  }

  const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
  const url =
    `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json&sort_order=desc&limit=5`;

  const res = await fetch(url, {
    headers: traceId ? { 'x-trace-id': traceId } : undefined,
    cache: 'no-store', // Use no-store for server-side, cache layer handles TTL
  });

  if (!res.ok) return null;

  const json: any = await res.json();
  const obs: any[] = Array.isArray(json?.observations) ? json.observations : [];
  for (const o of obs) {
    const val = parseValue(String(o?.value ?? ''));
    const date = String(o?.date ?? '');
    if (val !== null && date) {
      return { seriesId, date, value: val };
    }
  }
  return null;
}

const metric = (params: {
  seriesId: string;
  source: string;
  status: MacroMetric['status'];
  value: number | null;
  unit: string;
  date: string | null;
  error?: string;
}): MacroMetric => ({
  seriesId: params.seriesId,
  source: params.source,
  status: params.status,
  value: params.value,
  unit: params.unit,
  date: params.date,
  error: params.error,
});

const latestDate = (metrics: MacroMetric[]) => {
  const timestamps = metrics
    .map((m) => (m.date ? Date.parse(m.date) : NaN))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
};

export async function getMacro(params: { range: string; region: string; traceId: string }): Promise<MacroResult> {
  if (!keysPresent.fred) {
    const missing = metric({
      seriesId: 'FRED_API_KEY',
      source: 'FRED',
      status: 'missing_key',
      value: null,
      unit: '',
      date: null,
      error: 'FRED_API_KEY missing',
    });
    return {
      status: 'missing_key',
      source: 'FRED',
      asOf: new Date().toISOString(),
      data: {
        cpi: missing,
        unemployment: missing,
        fedFunds: missing,
      },
      errors: ['FRED_API_KEY missing'],
      debug: { traceId: params.traceId },
    };
  }

  const errors: string[] = [];

  let cpiMetric: MacroMetric;
  try {
    const series = await fetchFredSeries('CPIAUCSL', 13);
    const latest = series[0];
    const yearAgo = series[12];
    if (latest?.value != null && yearAgo?.value != null) {
      const yoy = ((latest.value / yearAgo.value) - 1) * 100;
      cpiMetric = metric({
        seriesId: 'CPIAUCSL',
        source: 'FRED',
        status: 'ok',
        value: Number(yoy.toFixed(2)),
        unit: '%',
        date: latest.date,
      });
    } else if (latest?.value != null) {
      cpiMetric = metric({
        seriesId: 'CPIAUCSL',
        source: 'FRED',
        status: 'ok',
        value: latest.value,
        unit: 'index',
        date: latest.date,
        error: 'CPI YoY unavailable; showing index level',
      });
      errors.push('CPI YoY unavailable; showing index level');
    } else {
      cpiMetric = metric({
        seriesId: 'CPIAUCSL',
        source: 'FRED',
        status: 'error',
        value: null,
        unit: '%',
        date: null,
        error: 'CPI data unavailable',
      });
      errors.push('CPI data unavailable');
    }
  } catch (error) {
    cpiMetric = metric({
      seriesId: 'CPIAUCSL',
      source: 'FRED',
      status: 'error',
      value: null,
      unit: '%',
      date: null,
      error: toErrorText(error),
    });
    errors.push(toErrorText(error));
  }

  let unemploymentMetric: MacroMetric;
  try {
    const unemployment = await fetchFredLatest('UNRATE');
    if (unemployment?.value != null) {
      unemploymentMetric = metric({
        seriesId: 'UNRATE',
        source: 'FRED',
        status: 'ok',
        value: unemployment.value,
        unit: '%',
        date: unemployment.date,
      });
    } else {
      unemploymentMetric = metric({
        seriesId: 'UNRATE',
        source: 'FRED',
        status: 'error',
        value: null,
        unit: '%',
        date: null,
        error: 'Unemployment data unavailable',
      });
      errors.push('Unemployment data unavailable');
    }
  } catch (error) {
    unemploymentMetric = metric({
      seriesId: 'UNRATE',
      source: 'FRED',
      status: 'error',
      value: null,
      unit: '%',
      date: null,
      error: toErrorText(error),
    });
    errors.push(toErrorText(error));
  }

  let fedFundsMetric: MacroMetric;
  try {
    let fed = await fetchFredLatest('FEDFUNDS');
    let seriesId = 'FEDFUNDS';
    if (!fed) {
      fed = await fetchFredLatest('EFFR');
      seriesId = 'EFFR';
    }
    if (fed?.value != null) {
      fedFundsMetric = metric({
        seriesId,
        source: 'FRED',
        status: 'ok',
        value: fed.value,
        unit: '%',
        date: fed.date,
      });
    } else {
      fedFundsMetric = metric({
        seriesId,
        source: 'FRED',
        status: 'error',
        value: null,
        unit: '%',
        date: null,
        error: 'Fed funds data unavailable',
      });
      errors.push('Fed funds data unavailable');
    }
  } catch (error) {
    fedFundsMetric = metric({
      seriesId: 'FEDFUNDS',
      source: 'FRED',
      status: 'error',
      value: null,
      unit: '%',
      date: null,
      error: toErrorText(error),
    });
    errors.push(toErrorText(error));
  }

  const metrics = [cpiMetric, unemploymentMetric, fedFundsMetric];
  const status = metrics.some((m) => m.status === 'ok') ? 'ok' : errors.length ? 'error' : 'error';

  return {
    status,
    source: 'FRED',
    asOf: latestDate(metrics),
    data: {
      cpi: cpiMetric,
      unemployment: unemploymentMetric,
      fedFunds: fedFundsMetric,
    },
    errors: errors.length ? errors : undefined,
    debug: { traceId: params.traceId },
  };
}
