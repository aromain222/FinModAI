import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export type MarketstackQuote = {
  price: number | null;
  asOf: string | null;
};

export async function fetchMarketstackQuote(ticker: string): Promise<ProviderResult<MarketstackQuote>> {
  const apiKey = serverEnv.MARKETSTACK_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'marketstack', message: 'MARKETSTACK_API_KEY missing' } };
  }

  const url = `https://api.marketstack.com/v1/eod?access_key=${apiKey}&symbols=${encodeURIComponent(
    ticker
  )}&limit=1`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'marketstack',
    url,
    cacheKey: `marketstack:quote:${ticker}`,
  });
  if (!res.ok) return res;

  const first = res.data?.data?.[0];
  const price = typeof first?.close === 'number' ? first.close : null;
  const asOf = first?.date ? new Date(first.date).toISOString() : null;
  return { ok: true, data: { price, asOf }, raw: res.data, latencyMs: res.latencyMs };
}
