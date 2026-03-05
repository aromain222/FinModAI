import { NextRequest, NextResponse } from 'next/server';
import { getBatchQuotes, type Quote } from '@/lib/providers/fmp';
import {
  getCached,
  setCache,
  cacheKey,
  isFresh,
  CACHE_TTL,
  type Freshness,
} from '@/lib/market/snapshotCache';

export const dynamic = 'force-dynamic';

const DEFAULT_SYMBOLS = [
  'SPY', '^GSPC', '^VIX',
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA',
  'BTCUSD', 'ETHUSD',
];

type QuotesPayload = {
  provider: 'fmp';
  asOf: string;
  freshness: Freshness;
  reason?: string;
  quotes: Quote[];
  error?: string;
};

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols');
  const symbols = symbolsParam
    ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_SYMBOLS;

  const key = cacheKey('fmp', 'quotes', symbols.join(','));

  const cached = getCached<Quote[]>(key);
  if (cached && isFresh(key)) {
    return NextResponse.json({
      provider: 'fmp',
      asOf: cached.asOf,
      freshness: 'fresh' as Freshness,
      quotes: cached.data,
    } satisfies QuotesPayload);
  }

  const result = await getBatchQuotes(symbols);

  if (result.ok) {
    setCache(key, result.data, CACHE_TTL.QUOTES);
    return NextResponse.json({
      provider: 'fmp',
      asOf: new Date().toISOString(),
      freshness: 'fresh' as Freshness,
      quotes: result.data,
    } satisfies QuotesPayload);
  }

  if (cached) {
    return NextResponse.json({
      provider: 'fmp',
      asOf: cached.asOf,
      freshness: 'stale' as Freshness,
      reason: result.error.code === 'RATE_LIMIT' ? 'rate_limit' : result.error.message,
      quotes: cached.data,
    } satisfies QuotesPayload);
  }

  return NextResponse.json(
    {
      provider: 'fmp' as const,
      asOf: new Date().toISOString(),
      freshness: 'stale' as Freshness,
      reason: 'LIVE_UNAVAILABLE',
      quotes: [],
      error: 'LIVE_UNAVAILABLE',
    } satisfies QuotesPayload,
    { status: 200 }
  );
}
