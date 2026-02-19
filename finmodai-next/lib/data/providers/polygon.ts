import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export type PolygonQuote = {
  price: number | null;
  asOf: string | null;
};

export async function fetchPolygonQuote(ticker: string): Promise<ProviderResult<PolygonQuote>> {
  const apiKey = serverEnv.POLYGON_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: { provider: 'polygon', message: 'POLYGON_API_KEY missing' },
    };
  }

  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apiKey=${apiKey}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'polygon',
    url,
    cacheKey: `polygon:quote:${ticker}`,
  });
  if (!res.ok) return res;

  const first = res.data?.results?.[0];
  const price = typeof first?.c === 'number' ? first.c : null;
  const asOf = first?.t ? new Date(first.t).toISOString() : null;
  return { ok: true, data: { price, asOf }, raw: res.data, latencyMs: res.latencyMs };
}
