/**
 * POST /api/rank
 *
 * Scores and ranks a list of tickers for 1–3 month investment opportunity.
 *
 * Body: { tickers: string[]; horizonWeeks?: number }
 * Response: { stocks: RankedStock[]; scoredAt: string; horizonWeeks: number }
 *
 * Tickers are processed in bounded concurrent batches by the scoring engine.
 * Any single-ticker failure degrades to mock data — the full list always returns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scoreMultiple } from '@/lib/ranking/score';
import { mockFallback } from '@/lib/ranking/mock';
import { readCache } from '@/lib/ranking/rankCache';
import { WATCHLIST } from '@/lib/ranking/watchlist';
import {
  attachClassification,
  buildRankUniverse,
  DEFAULT_RANK_UNIVERSE_SIZE,
  MAX_RANK_UNIVERSE_SIZE,
} from '@/lib/ranking/universe';
import type { RankedStock, RankResponse } from '@/lib/ranking/types';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const MAX_TICKERS = MAX_RANK_UNIVERSE_SIZE;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LIVE_FALLBACK_LIMIT = 240;
const RANK_CACHE_TTL_MS = 30_000;
const rankCache = new Map<string, { expiresAt: number; response: RankResponse }>();

function fullUniverseWithFallback(
  cached: RankedStock[],
  horizonWeeks: number,
  universe: readonly string[] = WATCHLIST,
): RankedStock[] {
  const byTicker = new Map(cached.map(stock => [stock.ticker.toUpperCase(), stock]));
  const filled = universe.map(ticker => byTicker.get(ticker) ?? mockFallback(ticker, horizonWeeks));
  return filled.sort((a, b) => b.score - a.score);
}

// ── Request schema ─────────────────────────────────────────────────────────

const rankRequestSchema = z.object({
  tickers: z
    .array(z.string().min(1).max(10).regex(/^[A-Za-z.]{1,10}$/, 'Invalid ticker format'))
    .min(1)
    .max(MAX_TICKERS)
    .default([...WATCHLIST]),
  horizonWeeks: z.number().int().min(1).max(26).default(6),
});

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = rankRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { tickers, horizonWeeks } = parsed.data;
  const origin = new URL(req.url).origin;
  const normalizedTickers = tickers.map((ticker) => ticker.toUpperCase().replace(/-/g, '.'));
  const cacheKey = `${horizonWeeks}:${normalizedTickers.join(',')}`;
  const cached = rankCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.response, {
      headers: {
        'Cache-Control': 'private, max-age=30',
        'X-Ticker-Count': String(cached.response.stocks.length),
        'X-Rank-Cache': 'hit',
      },
    });
  }

  let stocks;
  try {
    stocks = await scoreMultiple(normalizedTickers, origin, horizonWeeks);
  } catch (err) {
    // Full engine failure — return mock data for every ticker so the UI
    // always has something to render rather than a blank state.
    console.error('[rank] scoreMultiple failed, returning full mock:', err);
    stocks = normalizedTickers
      .map(t => mockFallback(t, horizonWeeks))
      .sort((a, b) => b.score - a.score);
  }

  const response: RankResponse = {
    stocks,
    scoredAt:    new Date().toISOString(),
    horizonWeeks,
  };
  rankCache.set(cacheKey, { expiresAt: Date.now() + RANK_CACHE_TTL_MS, response });

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'private, max-age=30',
      'X-Ticker-Count': String(stocks.length),
      'X-Rank-Cache': 'miss',
    },
  });
}

// ── GET: serve from Supabase cache, fall back to live scoring ─────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const tickerParam  = searchParams.get('tickers');
  const horizonParam = searchParams.get('horizonWeeks');
  const limitParam   = searchParams.get('limit');
  const horizonWeeks = horizonParam ? parseInt(horizonParam, 10) : 6;
  const requestedLimit = limitParam ? parseInt(limitParam, 10) : DEFAULT_RANK_UNIVERSE_SIZE;
  const universe = tickerParam
    ? {
        tickers: tickerParam.split(',').map(t => t.trim().toUpperCase().replace(/-/g, '.')).filter(Boolean),
        metaByTicker: new Map(),
        source: 'watchlist' as const,
      }
    : await buildRankUniverse(requestedLimit);

  // Try Supabase cache first and fill any stale/missing names with deterministic
  // fallback rows so the opportunity board can display the full 2,000-3,000 stock universe.
  try {
    const cached = await readCache(CACHE_MAX_AGE_MS);
    if (cached.length > 0) {
      const stocks = attachClassification(
        fullUniverseWithFallback(cached, horizonWeeks, universe.tickers),
        universe.metaByTicker,
      );
      const response: RankResponse = {
        stocks,
        scoredAt: cached[0]?.meta.scoredAt ?? new Date().toISOString(),
        horizonWeeks,
      };
      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'private, max-age=60',
          'X-Ticker-Count': String(stocks.length),
          'X-Rank-Source': cached.length >= universe.tickers.length ? 'supabase-cache' : 'supabase-cache-plus-fallback',
          'X-Universe-Source': universe.source,
          'X-Cached-Ticker-Count': String(cached.length),
        },
      });
    }
  } catch {
    // Supabase unavailable — fall through to live scoring
  }

  // Cold start or Supabase unavailable: score top tickers live
  const tickers = universe.tickers;

  const liveTickers = tickers.slice(0, tickerParam ? Math.min(tickers.length, MAX_TICKERS) : LIVE_FALLBACK_LIMIT);
  const fallbackTickers = tickers.slice(liveTickers.length);

  let liveStocks;
  try {
    liveStocks = await scoreMultiple(liveTickers, new URL(req.url).origin, horizonWeeks);
  } catch (err) {
    console.error('[rank] live GET fallback failed:', err);
    liveStocks = liveTickers.map(ticker => mockFallback(ticker, horizonWeeks));
  }

  const fallbackStocks = fallbackTickers.map(ticker => mockFallback(ticker, horizonWeeks));
  const stocks = attachClassification(
    [...liveStocks, ...fallbackStocks].sort((a, b) => b.score - a.score),
    universe.metaByTicker,
  );
  const response: RankResponse = {
    stocks,
    scoredAt: new Date().toISOString(),
    horizonWeeks,
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'private, max-age=30',
      'X-Ticker-Count': String(stocks.length),
      'X-Rank-Source': fallbackTickers.length > 0 ? 'live-plus-fallback' : 'live',
      'X-Universe-Source': universe.source,
      'X-Live-Ticker-Count': String(liveStocks.length),
    },
  });
}
