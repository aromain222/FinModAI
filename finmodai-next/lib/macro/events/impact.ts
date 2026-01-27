/**
 * Macro Events Market Impact
 * Deterministic calculation of observed market moves for events
 */

import type { MacroEventCategory } from './types';
import { getMarketSeries } from '@/lib/market/provider';
import { fetchFredSeries } from '@/lib/providers/macro/fred';
import { getCache, setCache } from '@/lib/cache/memory';

export type ObservedMetric = {
  label: string;
  value: string;
  note?: string;
};

/**
 * Calculate percentage change from points array
 * Returns change in percentage points (e.g., +0.6 for +0.6%)
 */
function calculatePctChange(points: Array<{ t: string; close: number }>): number | null {
  if (!points || points.length < 2) return null;

  const first = points[0]?.close;
  const last = points[points.length - 1]?.close;

  if (
    first == null ||
    last == null ||
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    first <= 0
  ) {
    return null;
  }

  const pct = ((last - first) / first) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/**
 * Calculate yield change in basis points from FRED series
 * Returns change in bps (e.g., +6 for +6 bps)
 */
function calculateYieldChangeBps(points: Array<{ date: string; value: number }>): number | null {
  if (!points || points.length < 2) return null;

  const first = points[points.length - 1]?.value; // Oldest (end of array due to desc sort)
  const last = points[0]?.value; // Most recent (start of array)

  if (
    first == null ||
    last == null ||
    !Number.isFinite(first) ||
    !Number.isFinite(last)
  ) {
    return null;
  }

  // Convert to basis points (1% = 100 bps)
  const bps = (last - first) * 100;
  return Number.isFinite(bps) ? bps : null;
}

/**
 * Fetch market series with caching
 */
async function fetchMarketDataCached(ticker: string, range: '1D' | '1W'): Promise<Array<{ t: string; close: number }> | null> {
  const cacheKey = `impact:market:${ticker}:${range}`;
  const ttlMs = range === '1D' ? 60 * 1000 : 5 * 60 * 1000; // 1min for 1D, 5min for 1W

  const cached = getCache<Array<{ t: string; close: number }>>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  try {
    const series = await getMarketSeries({ ticker, range, traceId: 'macro-impact' });
    const points = series.points
      .filter((p) => p.close != null && Number.isFinite(p.close))
      .map((p) => ({ t: p.t, close: p.close! }));

    if (points.length >= 2) {
      setCache(cacheKey, points, ttlMs);
      return points;
    }
    return null;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[impact] Failed to fetch market data for ${ticker} (${range}):`, error);
    }
    return null;
  }
}

/**
 * Fetch FRED yield series with caching
 */
async function fetchYieldDataCached(seriesId: string, days: number): Promise<Array<{ date: string; value: number }> | null> {
  const cacheKey = `impact:fred:${seriesId}:${days}d`;
  const ttlMs = 5 * 60 * 1000; // 5min cache

  const cached = getCache<Array<{ date: string; value: number }>>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  try {
    // Fetch enough points to cover the window
    // FRED data is daily, so for 1D we need ~2-3 days, for 1W we need ~10 days
    const limit = days + 5; // Extra buffer for weekends/holidays
    const points = await fetchFredSeries(seriesId, limit);

    // fetchFredSeries returns Array<{ date: string, value: number }> (nulls filtered out)
    if (points && points.length >= 2) {
      // Filter to the requested window
      // Points are sorted desc (most recent first) from FRED API
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0]!;

      // Filter to window and sort ascending (oldest first) for calculation
      const filtered = (points as Array<{ date: string; value: number }>)
        .filter((p) => p.date && p.date >= cutoffStr)
        .sort((a, b) => (a.date > b.date ? 1 : -1)); // Sort ascending (oldest first) for pct change calculation

      if (filtered.length >= 2) {
        setCache(cacheKey, filtered, ttlMs);
        return filtered;
      }
    }
    return null;
  } catch (error) {
    // Handle NOT_CONFIGURED errors gracefully (no FRED API key)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'NOT_CONFIGURED') {
      return null;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[impact] Failed to fetch FRED data for ${seriesId}:`, error);
    }
    return null;
  }
}

/**
 * Format percentage change
 */
function formatPct(pct: number | null, decimals: number = 1): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}

/**
 * Format basis points change
 */
function formatBps(bps: number | null): string {
  if (bps == null || !Number.isFinite(bps)) return '—';
  const sign = bps >= 0 ? '+' : '';
  return `${sign}${Math.round(bps)} bps`;
}

/**
 * Generate observed market impact metrics for a macro event
 * Fetches 1D and 1W returns for SPY, QQQ, yields, DXY, WTI, Gold
 */
export async function generateObservedImpact(
  eventTime: string | null,
  category: MacroEventCategory
): Promise<ObservedMetric[]> {
  const observed: ObservedMetric[] = [];

  // Fetch all market data in parallel
  const [
    spy1D,
    spy1W,
    qqq1D,
    qqq1W,
    yield2y1D,
    yield2y1W,
    yield10y1D,
    yield10y1W,
    dxy1D,
    dxy1W,
    wti1D,
    wti1W,
    gold1D,
    gold1W,
  ] = await Promise.all([
    fetchMarketDataCached('SPY', '1D'),
    fetchMarketDataCached('SPY', '1W'),
    fetchMarketDataCached('QQQ', '1D'),
    fetchMarketDataCached('QQQ', '1W'),
    fetchYieldDataCached('DGS2', 1), // 2Y Treasury
    fetchYieldDataCached('DGS2', 7),
    fetchYieldDataCached('DGS10', 1), // 10Y Treasury
    fetchYieldDataCached('DGS10', 7),
    fetchMarketDataCached('DX-Y.NYB', '1D').catch(() => null), // DXY
    fetchMarketDataCached('DX-Y.NYB', '1W').catch(() => null),
    fetchMarketDataCached('CL=F', '1D').catch(() => null), // WTI crude oil
    fetchMarketDataCached('CL=F', '1W').catch(() => null),
    fetchMarketDataCached('GC=F', '1D').catch(() => null), // Gold futures
    fetchMarketDataCached('GC=F', '1W').catch(() => null),
  ]);

  // SPY 1D
  const spy1DChange = spy1D ? calculatePctChange(spy1D) : null;
  observed.push({
    label: 'SPY (1D)',
    value: formatPct(spy1DChange),
    note: spy1DChange != null ? 'broad market' : 'data unavailable',
  });

  // QQQ 1D
  const qqq1DChange = qqq1D ? calculatePctChange(qqq1D) : null;
  observed.push({
    label: 'QQQ (1D)',
    value: formatPct(qqq1DChange),
    note: qqq1DChange != null ? 'tech' : 'data unavailable',
  });

  // 2Y Yield 1D
  const yield2y1DChange = yield2y1D ? calculateYieldChangeBps(yield2y1D) : null;
  observed.push({
    label: '2Y (1D)',
    value: formatBps(yield2y1DChange),
    note: yield2y1DChange != null ? 'rates' : 'data unavailable',
  });

  // 10Y Yield 1D
  const yield10y1DChange = yield10y1D ? calculateYieldChangeBps(yield10y1D) : null;
  observed.push({
    label: '10Y (1D)',
    value: formatBps(yield10y1DChange),
    note: yield10y1DChange != null ? 'rates' : 'data unavailable',
  });

  // SPY 1W
  const spy1WChange = spy1W ? calculatePctChange(spy1W) : null;
  observed.push({
    label: 'SPY (1W)',
    value: formatPct(spy1WChange),
    note: spy1WChange != null ? 'broad market' : 'data unavailable',
  });

  // QQQ 1W
  const qqq1WChange = qqq1W ? calculatePctChange(qqq1W) : null;
  observed.push({
    label: 'QQQ (1W)',
    value: formatPct(qqq1WChange),
    note: qqq1WChange != null ? 'tech' : 'data unavailable',
  });

  // 2Y Yield 1W
  const yield2y1WChange = yield2y1W ? calculateYieldChangeBps(yield2y1W) : null;
  observed.push({
    label: '2Y (1W)',
    value: formatBps(yield2y1WChange),
    note: yield2y1WChange != null ? 'rates' : 'data unavailable',
  });

  // 10Y Yield 1W
  const yield10y1WChange = yield10y1W ? calculateYieldChangeBps(yield10y1W) : null;
  observed.push({
    label: '10Y (1W)',
    value: formatBps(yield10y1WChange),
    note: yield10y1WChange != null ? 'rates' : 'data unavailable',
  });

  // DXY 1D (optional - may not be available)
  if (dxy1D) {
    const dxy1DChange = calculatePctChange(dxy1D);
    observed.push({
      label: 'DXY (1D)',
      value: formatPct(dxy1DChange),
      note: dxy1DChange != null ? 'dollar' : 'data unavailable',
    });
  } else {
    observed.push({
      label: 'DXY (1D)',
      value: '—',
      note: 'data unavailable',
    });
  }

  // WTI Oil 1D (optional)
  if (wti1D) {
    const wti1DChange = calculatePctChange(wti1D);
    observed.push({
      label: 'WTI (1D)',
      value: formatPct(wti1DChange),
      note: wti1DChange != null ? 'energy' : 'data unavailable',
    });
  } else {
    observed.push({
      label: 'WTI (1D)',
      value: '—',
      note: 'data unavailable',
    });
  }

  // Gold 1D (optional)
  if (gold1D) {
    const gold1DChange = calculatePctChange(gold1D);
    observed.push({
      label: 'Gold (1D)',
      value: formatPct(gold1DChange),
      note: gold1DChange != null ? 'commodities' : 'data unavailable',
    });
  } else {
    observed.push({
      label: 'Gold (1D)',
      value: '—',
      note: 'data unavailable',
    });
  }

  return observed;
}

