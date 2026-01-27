import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getCache, setCache } from '@/lib/cache/memory';
import { getMarketSeries, type MarketRange } from '@/lib/market/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  tickers: z.string().optional().default(''),
  range: z.enum(['1D', '1W', '1M']).optional().default('1W'),
});

type MoveDirection = 'up' | 'down' | 'flat' | 'unknown';

type Move = {
  changePct: number | null;
  direction: MoveDirection;
  window: '1D' | '1W' | '1M';
  asOf: string;
  source: string;
};

const MAX_TICKERS = 40;
const PER_TICKER_TIMEOUT_MS = 3500;

const FALLBACK_TICKERS = ['SPY', 'QQQ', 'TLT', 'GLD', 'XLE'] as const;

function hashKey(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `${Math.abs(hash)}`;
}

function directionFromChangePct(changePct: number | null): MoveDirection {
  if (changePct === null || !Number.isFinite(changePct)) return 'unknown';
  if (changePct > 0.3) return 'up';
  if (changePct < -0.3) return 'down';
  return 'flat';
}

const TTL_BY_RANGE_MS: Record<Move['window'], number> = {
  '1D': 2 * 60 * 1000,
  '1W': 2 * 60 * 1000,
  '1M': 5 * 60 * 1000,
};

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();
  const searchParams = request.nextUrl.searchParams;

  const parsed = QuerySchema.safeParse({
    tickers: searchParams.get('tickers') ?? undefined,
    range: searchParams.get('range') ?? undefined,
  });

  const range = parsed.success ? parsed.data.range : '1W';
  const requested = (parsed.success ? parsed.data.tickers : '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  const tickers = Array.from(new Set(requested.length ? requested : [...FALLBACK_TICKERS]))
    .slice(0, MAX_TICKERS)
    .sort((a, b) => a.localeCompare(b));
  const cacheKey = `market:moves:${range}:${hashKey(tickers.join(','))}`;
  const cached = getCache<Record<string, Move>>(cacheKey);
  if (cached && !cached.stale) {
    return NextResponse.json({
      ok: true,
      range,
      moves: cached.value,
      meta: {
        traceId,
        cached: true,
        elapsedMs: Date.now() - startedAt,
        requestedCount: tickers.length,
        returnedCount: Object.keys(cached.value).length,
      },
    });
  }

  const warnings: string[] = [];

  const timeoutAfter = <T,>(ms: number): Promise<T | null> =>
    new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    });

  const settled = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const series = await Promise.race([
        getMarketSeries({ ticker, range: range as MarketRange, traceId }),
        timeoutAfter(PER_TICKER_TIMEOUT_MS),
      ]);
      if (!series) throw new Error('timeout');

      const changePct = typeof series.stats?.pctChange === 'number' && Number.isFinite(series.stats.pctChange) ? series.stats.pctChange : null;
      const move: Move = {
        changePct,
        direction: directionFromChangePct(changePct),
        window: range,
        asOf: series.lastUpdatedISO || new Date().toISOString(),
        source: series.source || 'fallback',
      };
      return { ticker, move };
    })
  );

  const moves: Record<string, Move> = {};
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    const ticker = tickers[i]!;
    if (result.status === 'fulfilled') {
      moves[result.value.ticker] = result.value.move;
      continue;
    }
    warnings.push(`${ticker}_failed:${result.reason instanceof Error ? result.reason.message : 'error'}`);
    moves[ticker] = {
      changePct: null,
      direction: 'unknown',
      window: range,
      asOf: new Date().toISOString(),
      source: 'fallback',
    };
  }

  setCache(cacheKey, moves, TTL_BY_RANGE_MS[range]);

  return NextResponse.json({
    ok: true,
    range,
    moves,
    coverage: `${Object.values(moves).filter((m) => m.changePct !== null).length}/${tickers.length} computed`,
    warnings: Array.from(new Set(warnings)),
    meta: {
      traceId,
      cached: false,
      elapsedMs: Date.now() - startedAt,
      requestedCount: tickers.length,
      returnedCount: Object.keys(moves).length,
    },
  });
}
