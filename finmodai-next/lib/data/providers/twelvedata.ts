import { getTwelveDataKey } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export type TwelveDataQuote = {
  price: number | null;
  asOf: string | null;
};

export async function fetchTwelveDataQuote(ticker: string): Promise<ProviderResult<TwelveDataQuote>> {
  const apiKey = getTwelveDataKey();
  if (!apiKey) {
    return { ok: false, error: { provider: 'twelvedata', message: 'TWELVEDATA_API_KEY missing' } };
  }

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    ticker
  )}&interval=1day&outputsize=1&apikey=${apiKey}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'twelvedata',
    url,
    cacheKey: `twelvedata:quote:${ticker}`,
  });
  if (!res.ok) return res;

  const first = res.data?.values?.[0];
  const price = first?.close ? Number(first.close) : null;
  const asOf = first?.datetime ? new Date(first.datetime).toISOString() : null;
  return { ok: true, data: { price, asOf }, raw: res.data, latencyMs: res.latencyMs };
}
