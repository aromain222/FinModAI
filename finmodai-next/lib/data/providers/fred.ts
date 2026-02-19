import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export async function fetchFredSeries(seriesId: string): Promise<ProviderResult<{ seriesId: string; latestValue: number | null }>> {
  const apiKey = serverEnv.FRED_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'fred', message: 'FRED_API_KEY missing' } };
  }
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(
    seriesId
  )}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'fred',
    url,
    cacheKey: `fred:${seriesId}`,
    ttlMs: 60 * 60 * 1000,
  });
  if (!res.ok) return res;

  const valueRaw = res.data?.observations?.[0]?.value;
  const latestValue = valueRaw !== undefined ? Number(valueRaw) : null;
  return {
    ok: true,
    data: { seriesId, latestValue: Number.isFinite(latestValue) ? latestValue : null },
    raw: res.data,
    latencyMs: res.latencyMs,
  };
}
