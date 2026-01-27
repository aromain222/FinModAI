/**
 * In-Memory Cache with TTL
 * Simple cache implementation for dev (can be upgraded to Redis later)
 */

type CacheEntry<T> = {
  value: T;
  expires: number;
};

const cache = new Map<string, CacheEntry<any>>();

/**
 * Get cached value if not expired
 * @param key Cache key
 * @returns Cached value or null if not found/expired
 */
export function get<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.expires) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

/**
 * Set cache value with TTL
 * @param key Cache key
 * @param value Value to cache
 * @param ttlMs Time to live in milliseconds
 */
export function set<T>(key: string, value: T, ttlMs: number): void {
  const expires = Date.now() + ttlMs;
  cache.set(key, { value, expires });

  // Cleanup expired entries periodically (every 1000 operations)
  if (cache.size % 1000 === 0) {
    const now = Date.now();
    for (const [k, entry] of cache.entries()) {
      if (now > entry.expires) {
        cache.delete(k);
      }
    }
  }
}

/**
 * Delete cache entry
 * @param key Cache key
 */
export function del(key: string): void {
  cache.delete(key);
}

/**
 * Clear all cache entries
 */
export function clear(): void {
  cache.clear();
}

/**
 * Get cache stats (for instrumentation)
 */
export function stats(): { size: number; keys: string[] } {
  const now = Date.now();
  // Clean expired entries before returning stats
  for (const [k, entry] of cache.entries()) {
    if (now > entry.expires) {
      cache.delete(k);
    }
  }
  return { size: cache.size, keys: Array.from(cache.keys()) };
}

/**
 * Generate cache key for market data
 * @param ticker Stock ticker
 * @param range Time range
 * @param source Data source
 */
export function marketCacheKey(ticker: string, range: string, source: string): string {
  return `market:${ticker}:${range}:${source}`;
}

