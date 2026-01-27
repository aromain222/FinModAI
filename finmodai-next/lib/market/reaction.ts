import 'server-only';

import { getCache, setCache } from '@/lib/cache/memory';
import { getMarketSeries } from '@/lib/market/provider';
import type { MarketRange } from '@/lib/market/provider';

export type ReactionRange = '1D' | '1W' | '1M';

export type MarketReaction = {
  symbol: string;
  pctChange: number | null;
  start: string | null;
  end: string | null;
  source: string;
  points: number;
};

const ttlByRange: Record<ReactionRange, number> = {
  '1D': 5 * 60 * 1000,
  '1W': 10 * 60 * 1000,
  '1M': 15 * 60 * 1000,
};

function computePctChange(points: Array<{ t: string; close: number }>): { pct: number | null; start: string | null; end: string | null } {
  if (points.length < 2) return { pct: null, start: points[0]?.t ?? null, end: points[points.length - 1]?.t ?? null };
  const first = points[0]?.close ?? null;
  const last = points[points.length - 1]?.close ?? null;
  if (!first || !last || !Number.isFinite(first) || !Number.isFinite(last)) {
    return { pct: null, start: points[0]?.t ?? null, end: points[points.length - 1]?.t ?? null };
  }
  const pct = ((last - first) / first) * 100;
  return { pct: Number.isFinite(pct) ? pct : null, start: points[0]?.t ?? null, end: points[points.length - 1]?.t ?? null };
}

export async function getReaction(params: { symbol: string; range: ReactionRange; traceId?: string }): Promise<MarketReaction> {
  const symbol = (params.symbol || '').trim().toUpperCase() || 'SPY';
  const range = params.range;
  const cacheKey = `market:reaction:${symbol}:${range}`;
  const ttlMs = ttlByRange[range] ?? ttlByRange['1W'];

  const cached = getCache<MarketReaction>(cacheKey);
  if (cached && !cached.stale) return cached.value;

  const series = await getMarketSeries({ ticker: symbol, range: range as MarketRange, traceId: params.traceId });
  const points = (series.points ?? [])
    .filter((p) => typeof p?.t === 'string' && typeof p?.close === 'number' && Number.isFinite(p.close))
    .map((p) => ({ t: p.t, close: p.close }));

  const computed = computePctChange(points);
  const reaction: MarketReaction = {
    symbol,
    pctChange: computed.pct,
    start: computed.start,
    end: computed.end,
    source: series.source || 'unknown',
    points: points.length,
  };

  setCache(cacheKey, reaction, ttlMs);
  return reaction;
}

