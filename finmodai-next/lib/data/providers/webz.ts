import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export async function fetchWebzStatus(ticker: string): Promise<ProviderResult<{ ok: boolean }>> {
  const apiKey = serverEnv.WEBZ_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'webz', message: 'WEBZ_API_KEY missing' } };
  }
  const url = `https://api.webz.io/newsApiLite?token=${apiKey}&q=${encodeURIComponent(ticker)}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'webz',
    url,
    cacheKey: `webz:status:${ticker}`,
    ttlMs: 5 * 60 * 1000,
  });
  if (!res.ok) return res;
  return { ok: true, data: { ok: true }, raw: res.data, latencyMs: res.latencyMs };
}
