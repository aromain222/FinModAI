import type { CachedEntry, ProviderResult } from './types';

const cache = new Map<string, CachedEntry<any>>();

export function getCached<T>(key: string): ProviderResult<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { ...entry.value, cached: true };
}

export function setCached<T>(key: string, value: ProviderResult<T>, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type FetchWithRetryParams = {
  provider: string;
  url: string;
  options?: RequestInit;
  cacheKey?: string;
  ttlMs?: number;
  maxRetries?: number;
};

export async function fetchJsonWithRetry<T = any>({
  provider,
  url,
  options,
  cacheKey,
  ttlMs = 15 * 60 * 1000,
  maxRetries = 2,
}: FetchWithRetryParams): Promise<ProviderResult<T>> {
  if (cacheKey) {
    const cached = getCached<T>(cacheKey);
    if (cached) return cached;
  }

  let attempt = 0;
  const start = Date.now();

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 && attempt < maxRetries) {
        const backoffMs = 500 * Math.pow(2, attempt);
        await sleep(backoffMs);
        attempt += 1;
        continue;
      }

      const text = await response.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const result: ProviderResult<T> = {
          ok: false,
          error: {
            provider,
            message: (json && (json.error || json.message)) || response.statusText || 'Request failed',
            status: response.status,
          },
          raw: json,
          latencyMs,
        };
        if (cacheKey) setCached(cacheKey, result, ttlMs);
        return result;
      }

      const result: ProviderResult<T> = { ok: true, data: json as T, raw: json, latencyMs };
      if (cacheKey) setCached(cacheKey, result, ttlMs);
      return result;
    } catch (error: any) {
      const latencyMs = Date.now() - start;
      const result: ProviderResult<T> = {
        ok: false,
        error: {
          provider,
          message: error?.message || 'Unknown error',
        },
        raw: error,
        latencyMs,
      };
      if (cacheKey) setCached(cacheKey, result, ttlMs);
      return result;
    }
  }

  return {
    ok: false,
    error: {
      provider,
      message: 'Rate limited',
      status: 429,
      code: 'rate_limited',
    },
  };
}
