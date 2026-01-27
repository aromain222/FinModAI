/**
 * Caching layer for Stock Move Explainer
 * Stores raw series/news/events + derived moves/catalysts
 */

import { getCache, setCache } from '@/lib/cache/memory';
import type { PriceBar, NewsItem, EventItem, MoveWithCatalysts } from './types';

export type CachedRawData = {
  priceSeries: PriceBar[];
  news: NewsItem[];
  events: EventItem[];
  priceProvider: string;
  newsProvider: string;
  eventsProvider: string;
  fetchedAt: number;
};

export type CachedResult = {
  moves: MoveWithCatalysts[];
  priceSeries: Array<{ date: string; close: number }>;
  warnings: string[];
  priceProvider: string;
  newsProvider: string;
  eventsProvider: string;
};

/**
 * Generate cache key for raw data
 */
function getRawCacheKey(
  ticker: string,
  start: string,
  end: string,
  interval: 'daily' | 'weekly'
): string {
  return `stocks:raw:${ticker}:${start}:${end}:${interval}`;
}

/**
 * Generate cache key for derived result
 */
export function getResultCacheKey(
  ticker: string,
  start: string,
  end: string,
  interval: 'daily' | 'weekly',
  topN: number,
  includeBenchmark: boolean,
  benchmarkTicker?: string,
  includeAI?: boolean
): string {
  const base = `stocks:result:${ticker}:${start}:${end}:${interval}:${topN}`;
  const benchmark = includeBenchmark ? `:benchmark:${benchmarkTicker || 'auto'}` : ':no-benchmark';
  const ai = includeAI ? ':ai' : ':no-ai';
  return base + benchmark + ai;
}

/**
 * Get cache TTL based on date range
 */
export function getCacheTTL(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  // <=30d => 1h, else 24h
  return daysDiff <= 30 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

/**
 * Get cached raw data
 */
export function getCachedRawData(
  ticker: string,
  start: string,
  end: string,
  interval: 'daily' | 'weekly'
): { value: CachedRawData; stale: boolean } | null {
  const key = getRawCacheKey(ticker, start, end, interval);
  return getCache<CachedRawData>(key);
}

/**
 * Cache raw data
 */
export function cacheRawData(
  ticker: string,
  start: string,
  end: string,
  interval: 'daily' | 'weekly',
  data: CachedRawData,
  ttlMs: number
): void {
  const key = getRawCacheKey(ticker, start, end, interval);
  setCache(key, data, ttlMs);
}

/**
 * Get cached result
 */
export function getCachedResult(cacheKey: string): { value: CachedResult; stale: boolean } | null {
  return getCache<CachedResult>(cacheKey);
}

/**
 * Cache result
 */
export function cacheResult(cacheKey: string, result: CachedResult, ttlMs: number): void {
  setCache(cacheKey, result, ttlMs);
}

