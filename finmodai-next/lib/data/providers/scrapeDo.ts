import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export async function fetchScrapeDoStatus(ticker: string): Promise<ProviderResult<{ ok: boolean }>> {
  const apiKey = serverEnv.SCRAPE_DO_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'scrape_do', message: 'SCRAPE_DO_API_KEY missing' } };
  }
  const url = `https://api.scrape.do/?token=${apiKey}&url=${encodeURIComponent('https://example.com')}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'scrape_do',
    url,
    cacheKey: `scrape_do:status:${ticker}`,
    ttlMs: 5 * 60 * 1000,
  });
  if (!res.ok) return res;
  return { ok: true, data: { ok: true }, raw: res.data, latencyMs: res.latencyMs };
}
