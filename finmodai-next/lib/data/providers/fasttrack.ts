import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export type FasttrackQuote = {
  price: number | null;
  asOf: string | null;
};

export async function fetchFasttrackQuote(ticker: string): Promise<ProviderResult<FasttrackQuote>> {
  const apiKey = serverEnv.FASTRACK_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'fasttrack', message: 'FASTRACK_API_KEY missing' } };
  }
  const baseUrl = serverEnv.FASTTRACK_BASE_URL;
  if (!baseUrl) {
    return {
      ok: false,
      error: { provider: 'fasttrack', message: 'FASTTRACK_BASE_URL missing' },
    };
  }

  const url = `${baseUrl.replace(/\/$/, '')}/eod?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'fasttrack',
    url,
    cacheKey: `fasttrack:quote:${ticker}`,
  });
  if (!res.ok) return res;

  const first = res.data?.data?.[0] || res.data?.[0];
  const price = typeof first?.close === 'number' ? first.close : null;
  const asOf = first?.date ? new Date(first.date).toISOString() : null;
  return { ok: true, data: { price, asOf }, raw: res.data, latencyMs: res.latencyMs };
}
