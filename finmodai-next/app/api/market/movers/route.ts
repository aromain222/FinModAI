import { NextRequest, NextResponse } from 'next/server';
import { getMovers, type MoverQuote } from '@/lib/providers/fmp';
import {
  getCached,
  setCache,
  cacheKey,
  isFresh,
  CACHE_TTL,
  type Freshness,
} from '@/lib/market/snapshotCache';

export const dynamic = 'force-dynamic';

type StockMove = {
  ticker: string;
  returnPct: number;
  lastPrice?: number;
  name?: string;
};

type CachedMovers = { rising: StockMove[]; falling: StockMove[] };

type MoversSuccess = {
  ok: true;
  provider: string;
  freshness: Freshness;
  asOf: string;
  reason?: string;
  rising: StockMove[];
  falling: StockMove[];
};

type MoversError = {
  ok: false;
  error: { code: string; message: string };
};

function toResponse(payload: MoversSuccess | MoversError, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
  });
}

function quotesToMoves(quotes: MoverQuote[]): StockMove[] {
  return quotes.map((q) => ({
    ticker: q.symbol,
    returnPct: q.changesPercentage,
    lastPrice: q.price,
    name: q.name,
  }));
}

export async function GET(_req: NextRequest) {
  const key = cacheKey('fmp', 'movers', 'top_stocks');
  const cached = getCached<CachedMovers>(key);

  if (cached && isFresh(key)) {
    return toResponse({
      ok: true,
      provider: 'fmp',
      freshness: 'fresh',
      asOf: cached.asOf,
      ...cached.data,
    });
  }

  const result = await getMovers();

  if (result.ok) {
    const movers: CachedMovers = {
      rising: quotesToMoves(result.data.rising),
      falling: quotesToMoves(result.data.falling),
    };
    setCache(key, movers, CACHE_TTL.MOVERS);
    return toResponse({
      ok: true,
      provider: 'fmp',
      freshness: 'fresh',
      asOf: new Date().toISOString(),
      ...movers,
    });
  }

  if (cached) {
    return toResponse({
      ok: true,
      provider: 'fmp',
      freshness: 'stale',
      asOf: cached.asOf,
      reason: 'rate_limit',
      ...cached.data,
    });
  }

  return toResponse({
    ok: false,
    error: { code: 'LIVE_UNAVAILABLE', message: 'Live movers temporarily unavailable' },
  });
}
