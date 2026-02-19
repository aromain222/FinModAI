/**
 * API Cache - In-memory TTL cache for API responses
 * 
 * Reduces API calls and improves performance
 * Cache keys: `ltm-financials:{ticker}`, `quote:{ticker}`, etc.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

class APICache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private hits: number = 0;
  private misses: number = 0;

  /**
   * Get cached value if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      // Expired
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  /**
   * Set cache value with TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Clear specific key or all cache
   */
  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
      this.hits = 0;
      this.misses = 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: hitRate.toFixed(2) + '%',
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

// Singleton instance
const apiCache = new APICache();

// Auto-cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => apiCache.cleanup(), 5 * 60 * 1000);
}

export default apiCache;

// TTL constants (in milliseconds)
export const TTL = {
  FIVE_MINUTES: 5 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  SIX_HOURS: 6 * 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
};

// Cache key builders
export const cacheKeys = {
  ltmFinancials: (ticker: string) => `ltm-financials:${ticker.toUpperCase()}`,
  quote: (ticker: string) => `quote:${ticker.toUpperCase()}`,
  stooqPrices: (ticker: string, days: number) => `stooq-prices:${ticker.toUpperCase()}:${days}`,
  macroSnapshot: (range: string) => `macro-snapshot:${range}`,
  scrapedData: (url: string) => `scraped:${url}`,
  nasdaqData: (ticker: string) => `nasdaq:${ticker.toUpperCase()}`,
  historicalFinancials: (ticker: string, years: number) => `historical-financials:${ticker.toUpperCase()}:${years}`,
  consensusEstimates: (ticker: string) => `consensus-estimates:${ticker.toUpperCase()}`,
  peerComps: (ticker: string, sector: string) => `peer-comps:${ticker.toUpperCase()}:${sector}`,
  workingCapital: (ticker: string) => `working-capital:${ticker.toUpperCase()}`,
};
