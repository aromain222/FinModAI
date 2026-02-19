import apiCache, { TTL } from '@/lib/apiCache';
import { createClient } from '@supabase/supabase-js';
import type { MarketFetchProvider, MarketFetchResult, MarketOHLCPoint } from './providers/types';
import { fetchDailyCloses as fetchPolygon } from './providers/polygon';
import { fetchDailyCloses as fetchFmp } from './providers/fmp';
import { fetchDailyCloses as fetchTwelve } from './providers/twelve';
import { fetchDailyCloses as fetchMarketstack } from './providers/marketstack';
import { fetchDailyCloses as fetchFastTrack } from './providers/fasttrack';
import { fetchDailyCloses as fetchStooq } from './providers/stooq';

type FetchOptions = {
  symbol: string;
  rangePoints: number;
  start: string;
  end: string;
  // Optional hint for upstream callers; we always pass a concrete limit into providers.
  limit?: number;
};

type SeriesSource = 'cache' | 'live' | 'none';

export type SeriesQuality = {
  repeatedValuePct: number;
  maxGapDays: number;
  missingPct: number;
  warnings: string[];
};

const VALID_BOUNDS: Record<string, { min: number; max: number }> = {
  SPY: { min: 300, max: 1000 },
  VIX: { min: 8, max: 80 },
};

const PROVIDER_ORDER: Record<string, MarketFetchProvider[]> = {
  SPY: ['polygon', 'twelve', 'marketstack', 'fmp', 'fasttrack', 'stooq'],
  VIX: ['polygon', 'twelve', 'marketstack', 'fmp', 'fasttrack', 'stooq'],
};

const DAY_MS = 24 * 60 * 60 * 1000;

function countTradingDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function normalizePoints(points: MarketOHLCPoint[]): MarketOHLCPoint[] {
  const dedup = new Map<string, MarketOHLCPoint>();
  for (const point of points) {
    if (!point?.date) continue;
    const date = new Date(point.date);
    if (Number.isNaN(date.getTime())) continue;
    const close = point.close;
    if (close === null || close === undefined || !Number.isFinite(close)) continue;
    dedup.set(date.toISOString(), { date: date.toISOString(), close });
  }
  return Array.from(dedup.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

function withinBounds(symbol: string, value: number): boolean {
  const bounds = VALID_BOUNDS[symbol];
  if (!bounds) return true;
  return value >= bounds.min && value <= bounds.max;
}

export function assessDailySeriesQuality(
  points: MarketOHLCPoint[],
  startIso?: string,
  endIso?: string
): SeriesQuality {
  const values = points.map((p) => p.close).filter((v): v is number => Number.isFinite(v));
  let repeats = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] === values[i - 1]) repeats += 1;
  }
  const repeatedValuePct = values.length > 1 ? repeats / (values.length - 1) : 0;

  let maxGapDays = 0;
  for (let i = 1; i < points.length; i += 1) {
    const gapDays = Math.round(
      (new Date(points[i].date).getTime() - new Date(points[i - 1].date).getTime()) / DAY_MS
    );
    maxGapDays = Math.max(maxGapDays, gapDays);
  }

  let missingPct = 0;
  if (startIso && endIso) {
    const expected = countTradingDaysBetween(startIso, endIso);
    if (expected > 0) {
      missingPct = Math.max(0, expected - points.length) / expected;
    }
  }

  return { repeatedValuePct, maxGapDays, missingPct, warnings: [] };
}

function logRejected(provider: MarketFetchProvider, reason: string, points: MarketOHLCPoint[], quality: SeriesQuality) {
  if (process.env.NODE_ENV !== 'development') return;
  console.warn('[marketData] provider rejected', {
    provider,
    reason,
    points: points.length,
    first: points[0]?.date,
    last: points[points.length - 1]?.date,
    repeatedValuePct: quality.repeatedValuePct,
    maxGapDays: quality.maxGapDays,
  });
}

async function fetchFromProvider(
  provider: MarketFetchProvider,
  opts: FetchOptions
): Promise<MarketFetchResult> {
  const providerOpts = {
    symbol: opts.symbol,
    start: opts.start,
    end: opts.end,
    // Some provider adapters typed `limit` as required even if they don't use it.
    limit: opts.limit ?? Math.max(opts.rangePoints, 260),
  };
  switch (provider) {
    case 'polygon':
      return fetchPolygon(providerOpts);
    case 'twelve':
      return fetchTwelve(providerOpts);
    case 'marketstack':
      return fetchMarketstack(providerOpts);
    case 'fmp':
      return fetchFmp(providerOpts);
    case 'fasttrack':
      return fetchFastTrack(providerOpts);
    case 'stooq':
      return fetchStooq(providerOpts);
    default:
      return { provider, points: [], warnings: ['Unsupported provider'] };
  }
}

type CachedSeriesRow = {
  date: string;
  close: number | string | null;
};

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchFromSupabaseCache(opts: FetchOptions): Promise<MarketOHLCPoint[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('market_series_daily')
    .select('date, close')
    .eq('symbol', opts.symbol.toUpperCase())
    .gte('date', opts.start)
    .lte('date', opts.end)
    .order('date', { ascending: true });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[marketData] supabase cache query failed', {
        symbol: opts.symbol,
        start: opts.start,
        end: opts.end,
        message: error.message,
      });
    }
    return null;
  }

  const rows = Array.isArray(data) ? (data as CachedSeriesRow[]) : [];
  if (rows.length <= 10) return null;

  const points: MarketOHLCPoint[] = rows
    .map((row) => {
      const close = typeof row.close === 'number' ? row.close : Number(row.close);
      const date = new Date(row.date).toISOString();
      if (!Number.isFinite(close) || Number.isNaN(new Date(date).getTime())) return null;
      return { date, close };
    })
    .filter((item): item is MarketOHLCPoint => item !== null);

  return points.length > 10 ? points : null;
}

export async function fetchDailySeries(opts: FetchOptions): Promise<{
  ok: boolean;
  source: SeriesSource;
  candles: Array<{ date: string; value: number }>;
  provider: MarketFetchProvider;
  points: MarketOHLCPoint[];
  warnings: string[];
  quality: SeriesQuality;
}> {
  const symbol = opts.symbol.toUpperCase();
  const providers = PROVIDER_ORDER[symbol] || ['polygon', 'twelve', 'marketstack', 'fmp', 'fasttrack', 'stooq'];
  const cacheKey = `market-daily:${symbol}:${opts.start}:${opts.end}`;
  const minPoints = opts.rangePoints <= 5 ? 2 : 3;
  const cachePoints = await fetchFromSupabaseCache(opts);
  if (cachePoints && cachePoints.length > 10) {
    const normalized = normalizePoints(cachePoints).slice(-opts.rangePoints);
    const quality = assessDailySeriesQuality(normalized, opts.start, opts.end);
    return {
      ok: true,
      source: 'cache',
      candles: normalized
        .filter((point) => Number.isFinite(point.close))
        .map((point) => ({ date: point.date, value: point.close as number })),
      provider: 'fallback',
      points: normalized,
      warnings: [],
      quality,
    };
  }

  const cached = apiCache.get<{ provider: MarketFetchProvider; points: MarketOHLCPoint[]; warnings: string[] }>(
    cacheKey
  );
  if (cached) {
    const normalized = normalizePoints(cached.points);
    const sliced = normalized.slice(-opts.rangePoints);
    const quality = assessDailySeriesQuality(normalized, opts.start, opts.end);
    const hasBoundsIssue = normalized.some((p) => !withinBounds(symbol, p.close as number));
    if (
      normalized.length >= minPoints &&
      quality.repeatedValuePct <= 0.8 &&
      !hasBoundsIssue
    ) {
      return {
        ok: true,
        source: 'live',
        candles: sliced
          .filter((point) => Number.isFinite(point.close))
          .map((point) => ({ date: point.date, value: point.close as number })),
        provider: cached.provider,
        points: sliced,
        warnings: cached.warnings,
        quality,
      };
    }
    apiCache.clear(cacheKey);
  }

  for (const provider of providers) {
    const result = await fetchFromProvider(provider, opts);
    const normalized = normalizePoints(result.points);
    const trimmed = normalized.slice(-Math.max(opts.rangePoints, 3));

    const invalidBounds = trimmed.filter((p) => !withinBounds(symbol, p.close as number));
    const valid = trimmed.filter((p) => withinBounds(symbol, p.close as number));
    const quality = assessDailySeriesQuality(valid, opts.start, opts.end);
    const hasIncreasingDates = valid.every(
      (p, idx) => idx === 0 || new Date(p.date).getTime() > new Date(valid[idx - 1].date).getTime()
    );

    const warnings = [...result.warnings];
    if (invalidBounds.length > 0) {
      warnings.push(`Discarded ${invalidBounds.length} out-of-bounds points`);
    }
    if (!hasIncreasingDates) {
      warnings.push('Non-increasing dates detected');
    }
    if (quality.maxGapDays > 7) {
      warnings.push(`Large data gap (${quality.maxGapDays} days)`);
    }

    if (valid.length < minPoints) {
      logRejected(provider, 'too_few_points', valid, quality);
      continue;
    }
    if (!hasIncreasingDates) {
      logRejected(provider, 'non_increasing_dates', valid, quality);
      continue;
    }
    if (quality.repeatedValuePct > 0.8) {
      logRejected(provider, 'repeated_values', valid, quality);
      continue;
    }

    apiCache.set(cacheKey, { provider, points: valid, warnings }, TTL.FIVE_MINUTES);
    const sliced = valid.slice(-opts.rangePoints);
    return {
      ok: true,
      source: 'live',
      candles: sliced
        .filter((point) => Number.isFinite(point.close))
        .map((point) => ({ date: point.date, value: point.close as number })),
      provider,
      points: sliced,
      warnings,
      quality,
    };
  }

  // Exhausted providers: return fallback (uncached unless explicitly exhausted)
  const warnings = ['All providers failed, using fallback'];
  return {
    ok: false,
    source: 'none',
    candles: [],
    provider: 'fallback',
    points: [],
    warnings,
    quality: { repeatedValuePct: 0, maxGapDays: 0, missingPct: 1, warnings },
  };
}
