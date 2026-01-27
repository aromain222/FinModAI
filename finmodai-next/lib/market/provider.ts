/**
 * Unified Market Data Provider
 * Orchestrates multiple data sources with fallback chain:
 * Priority: Polygon (if key) > Finnhub (if key) > Stooq > yfinance (last resort, never blocks)
 * 
 * Caching:
 * - 1D/1W: 2 minutes
 * - 1M: 10 minutes
 * - 1Y/5Y: 60 minutes
 */

import { ENV, keysPresent } from '@/lib/env/server';
import { getCache, setCache } from '@/lib/cache/memory';
import { fetchStooqDailyCSV, filterByRange } from '@/lib/providers/market/stooq';
import { fetchDatabentoMarket } from '@/lib/macro/providers/databento';
import { fetchMarketstackSeries } from '@/lib/providers/market/marketstack';
import { fetchPolygonSeries } from '@/lib/providers/market/polygon';
import { fetchFinnhubSeries } from '@/lib/providers/market/finnhub';
import { fetchFmpSeries } from '@/lib/providers/market/fmp';
import { fetchYFinancePrices, type YFinanceRange } from './yfinance';
import { ProviderError } from '@/lib/providers/errors';

export type MarketRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';

export type MarketPoint = {
  t: string; // ISO timestamp
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
};

export type MarketSeries = {
  ticker: string;
  source: 'polygon' | 'fmp' | 'marketstack' | 'databento' | 'stooq' | 'yfinance' | 'fallback';
  lastUpdatedISO: string;
  points: MarketPoint[];
  stats: {
    startClose: number | null;
    endClose: number | null;
    pctChange: number | null;
  };
};

/**
 * Convert yfinance points to MarketPoint format
 */
function normalizeYFinancePoints(yfPoints: Array<{ t: string; c: number | null; o?: number | null; h?: number | null; l?: number | null; v?: number | null }>): MarketPoint[] {
  return yfPoints
    .filter((p) => p.c !== null && p.c !== undefined && Number.isFinite(p.c))
    .map((p) => ({
      t: p.t,
      close: p.c!,
      open: p.o ?? undefined,
      high: p.h ?? undefined,
      low: p.l ?? undefined,
      volume: p.v ?? undefined,
    }));
}

/**
 * Validate points array has at least 2 valid closes
 */
function isValidPoints(points: MarketPoint[]): boolean {
  if (points.length < 2) return false;
  const validCloses = points.filter((p) => Number.isFinite(p.close) && p.close > 0);
  return validCloses.length >= 2;
}

const isDatabentoRange = (range: MarketRange): range is '1D' | '1W' | '1M' =>
  range === '1D' || range === '1W' || range === '1M';

const isMarketstackRange = (range: MarketRange): range is '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' => range !== '6M';

/**
 * Compute stats from points
 */
function computeStats(points: MarketPoint[]): MarketSeries['stats'] {
  if (points.length < 2) {
    return { startClose: null, endClose: null, pctChange: null };
  }
  
  const first = points[0]?.close;
  const last = points[points.length - 1]?.close;
  
  if (!first || !last || !Number.isFinite(first) || !Number.isFinite(last)) {
    return { startClose: first ?? null, endClose: last ?? null, pctChange: null };
  }
  
  const pctChange = ((last - first) / first) * 100;
  return {
    startClose: first,
    endClose: last,
    pctChange: Number.isFinite(pctChange) ? pctChange : null,
  };
}

const ETF_TICKERS = new Set([
  'SPY',
  'QQQ',
  'DIA',
  'IWM',
  'XLF',
  'XLK',
  'XLV',
  'XLE',
  'XLI',
  'XLP',
  'XLY',
  'XLB',
  'XLRE',
  'XLU',
  'XLC',
]);

const rangePointLimits: Partial<Record<MarketRange, number>> = {
  '1D': 220,
  '1W': 220,
  '1M': 80,
  '3M': 160,
  '6M': 260,
  '1Y': 520,
  '5Y': 2000,
};

function trimPoints(points: MarketPoint[], range: MarketRange): MarketPoint[] {
  const limit = rangePointLimits[range];
  if (!limit || points.length <= limit) return points;
  return points.slice(points.length - limit);
}

const isDatabentoMarketConfigured = () => Boolean(ENV.DATABENTO_API_KEY && ENV.DATABENTO_EQUITIES_DATASET);

// Cache TTL by range
const CACHE_TTL_BY_RANGE: Record<MarketRange, number> = {
  '1D': 2 * 60 * 1000,      // 2 minutes
  '1W': 2 * 60 * 1000,      // 2 minutes
  '1M': 10 * 60 * 1000,     // 10 minutes
  '3M': 10 * 60 * 1000,     // 10 minutes
  '6M': 10 * 60 * 1000,     // 10 minutes
  '1Y': 60 * 60 * 1000,     // 60 minutes
  '5Y': 60 * 60 * 1000,     // 60 minutes
};

const isRetryable = (error: unknown) => {
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (!(error instanceof ProviderError)) return false;
  if (error.code === 'NOT_CONFIGURED') return false;
  if (error.code === 'TIMEOUT') return true;
  const status = error.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  return false;
};

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isRetryable(error)) return await fn();
    throw error;
  }
}

const yfinanceFallbackLogged = new Set<string>();

/**
 * Get market series with provider fallback chain and caching
 * Priority: Polygon (if key) > Finnhub (if key) > Stooq > yfinance (last resort, never blocks)
 */
export async function getMarketSeries(params: {
  ticker: string;
  range: MarketRange;
  traceId?: string;
}): Promise<MarketSeries> {
  const { ticker, range, traceId = 'unknown' } = params;
  const normalizedTicker = ticker.trim().toUpperCase();
  const nowISO = new Date().toISOString();
  
  // Check cache first
  const cacheKey = `market:series:${normalizedTicker}:${range}`;
  const ttlMs = CACHE_TTL_BY_RANGE[range] ?? CACHE_TTL_BY_RANGE['1W'];
  const cached = getCache<MarketSeries>(cacheKey);
  if (cached && !cached.stale) {
    return cached.value;
  }

  const isEtf = ETF_TICKERS.has(normalizedTicker);
  const databentoEnabled = isDatabentoMarketConfigured();

  // Provider priority: Polygon (if key) > Finnhub (if key) > Stooq > yfinance (last resort, never blocks)
  
  // 1. Polygon (if key present)
  if (keysPresent.polygon && isMarketstackRange(range)) {
    try {
      const poly = await withRetry(() => fetchPolygonSeries({ symbol: normalizedTicker, range, traceId }));
      const polyPoints = trimPoints(poly.data.points.map((p) => ({ t: p.t, close: p.v })), range);
      if (isValidPoints(polyPoints)) {
        const series: MarketSeries = {
          ticker: normalizedTicker,
          source: 'polygon',
          lastUpdatedISO: polyPoints[polyPoints.length - 1]?.t ?? nowISO,
          points: polyPoints,
          stats: computeStats(polyPoints),
        };
        setCache(cacheKey, series, ttlMs);
        return series;
      }
    } catch {
      // Continue
    }
  }
  
  // 2. Finnhub (if key present)
  if (keysPresent.finnhub && isMarketstackRange(range)) {
    try {
      const finnhub = await withRetry(() => fetchFinnhubSeries({ symbol: normalizedTicker, range, traceId }));
      const finnhubPoints = trimPoints(finnhub.data.points.map((p) => ({ t: p.t, close: p.v })), range);
      if (isValidPoints(finnhubPoints)) {
        const series: MarketSeries = {
          ticker: normalizedTicker,
          source: 'finnhub',
          lastUpdatedISO: finnhubPoints[finnhubPoints.length - 1]?.t ?? nowISO,
          points: finnhubPoints,
          stats: computeStats(finnhubPoints),
        };
        setCache(cacheKey, series, ttlMs);
        return series;
      }
    } catch {
      // Continue
    }
  }

  // 3. Stooq (free, fast)
  try {
    const stooqPoints = trimPoints(
      filterByRange(
        await fetchStooqDailyCSV(normalizedTicker, traceId),
        range as '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y'
      ).map((p) => ({ t: p.t, close: p.close })),
      range
    );
    if (isValidPoints(stooqPoints)) {
      const series: MarketSeries = {
        ticker: normalizedTicker,
        source: 'stooq',
        lastUpdatedISO: stooqPoints[stooqPoints.length - 1]?.t ?? nowISO,
        points: stooqPoints,
        stats: computeStats(stooqPoints),
      };
      setCache(cacheKey, series, ttlMs);
      return series;
    }
  } catch {
    // Continue
  }

  // 4. yfinance (last resort - sandboxed, never blocks)
  // Run with timeout to never block - if it times out, continue to fallback
  const yfPromise = fetchYFinancePrices(normalizedTicker, range as YFinanceRange);
  const yfTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
  
  try {
    const yfData = await Promise.race([yfPromise, yfTimeout]);
    if (yfData && yfData.points && yfData.points.length > 0) {
      const normalized = trimPoints(normalizeYFinancePoints(yfData.points), range);
      if (isValidPoints(normalized)) {
        const logKey = `${normalizedTicker}:${range}`;
        // Always log yfinance usage since it's the last resort
        if (process.env.NODE_ENV !== 'production' && !yfinanceFallbackLogged.has(logKey)) {
          yfinanceFallbackLogged.add(logKey);
          console.warn(`[market:provider] Using yfinance (last resort) for ${normalizedTicker} (${range})`);
        }
        const series: MarketSeries = {
          ticker: normalizedTicker,
          source: 'yfinance',
          lastUpdatedISO: yfData.last?.t || nowISO,
          points: normalized,
          stats: computeStats(normalized),
        };
        setCache(cacheKey, series, ttlMs);
        return series;
      }
    }
  } catch {
    // Continue to fallback - yfinance never blocks
  }

  // Fallback - return empty series
  const fallbackSeries: MarketSeries = {
    ticker: normalizedTicker,
    source: 'fallback',
    lastUpdatedISO: nowISO,
    points: [],
    stats: { startClose: null, endClose: null, pctChange: null },
  };
  
  // Don't cache fallback
  return fallbackSeries;
}

/**
 * Get last price only (helper for quick lookups)
 */
export async function getLastPrice(ticker: string, traceId?: string): Promise<{
  price: number | null;
  source: MarketSeries['source'];
  lastUpdatedISO: string;
}> {
  const series = await getMarketSeries({ ticker, range: '1D', traceId });
  const lastClose = series.points.length > 0 ? series.points[series.points.length - 1]?.close : null;
  return {
    price: lastClose ?? null,
    source: series.source,
    lastUpdatedISO: series.lastUpdatedISO,
  };
}
