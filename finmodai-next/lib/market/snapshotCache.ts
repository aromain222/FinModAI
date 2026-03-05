/**
 * Live snapshot cache with stale-while-revalidate semantics.
 * NOT demo data — this caches real FMP responses to avoid rate limits.
 */

export type Freshness = 'fresh' | 'stale';

export type CachedSnapshot<T> = {
  data: T;
  asOf: string;
  freshness: Freshness;
  reason?: string;
};

type Entry<T> = {
  data: T;
  asOf: string;
  storedAt: number;
  ttlMs: number;
};

const store = new Map<string, Entry<unknown>>();

export const CACHE_TTL = {
  QUOTES: 120_000,
  CHART_INTRADAY: 60_000,
  CHART_DAILY: 600_000,
  CHART_LONG: 3_600_000,
  MOVERS: 300_000,
  SECTORS: 600_000,
} as const;

export function chartTtl(range: string): number {
  const upper = range.toUpperCase();
  if (upper === '1D' || upper === '5D') return CACHE_TTL.CHART_INTRADAY;
  if (upper === '1W' || upper === '1M') return CACHE_TTL.CHART_DAILY;
  return CACHE_TTL.CHART_LONG;
}

export function cacheKey(provider: string, endpoint: string, params: string): string {
  return `${provider}:${endpoint}:${params}`;
}

export function getCached<T>(key: string): CachedSnapshot<T> | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;

  const age = Date.now() - entry.storedAt;
  const staleThreshold = entry.ttlMs * 3;

  if (age > staleThreshold) {
    store.delete(key);
    return null;
  }

  return {
    data: entry.data,
    asOf: entry.asOf,
    freshness: age <= entry.ttlMs ? 'fresh' : 'stale',
    reason: age > entry.ttlMs ? 'cached_snapshot' : undefined,
  };
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, {
    data,
    asOf: new Date().toISOString(),
    storedAt: Date.now(),
    ttlMs,
  });
}

export function isFresh(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  return Date.now() - entry.storedAt <= entry.ttlMs;
}

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now - entry.storedAt > entry.ttlMs * 3) {
        store.delete(key);
      }
    }
  }, 5 * 60_000);
}
