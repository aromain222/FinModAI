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
import type { RankResponse } from '@/lib/ranking/types';

export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const maxDuration = 60;

// ── Default watchlist used when no tickers are provided ────────────────────

const DEFAULT_WATCHLIST = [
  'SOFI', 'HOOD', 'COIN', 'PLTR', 'AMD',
  'NVDA', 'TSLA', 'META', 'AMZN', 'GOOGL',
  'MSFT', 'AAPL', 'UBER', 'SHOP', 'SNOW',
  'NFLX', 'ROKU', 'AFRM', 'SQ', 'PYPL',
  'CRWD', 'DDOG', 'NET', 'MDB', 'NOW',
  'ORCL', 'AVGO', 'TSM', 'ASML', 'ARM',
  'MU', 'INTC', 'QCOM', 'SMCI', 'PANW',
  'ZS', 'OKTA', 'TEAM', 'ABNB', 'DASH',
  'BKNG', 'MELI', 'SPOT', 'DIS', 'LLY',
  'NVO', 'JPM', 'GS', 'V', 'MA',

  'CRM', 'ADBE', 'INTU', 'ADSK', 'WDAY',
  'SNPS', 'CDNS', 'ANET', 'DELL', 'HPE',
  'HPQ', 'STX', 'WDC', 'TXN', 'ADI',
  'NXPI', 'MRVL', 'LRCX', 'KLAC', 'AMAT',
  'ON', 'MPWR', 'TER', 'ENPH', 'FSLR',

  'XOM', 'CVX', 'COP', 'SLB', 'EOG',
  'OXY', 'LNG', 'NEE', 'DUK', 'SO',
  'GE', 'HON', 'CAT', 'DE', 'ETN',
  'EMR', 'PH', 'BA', 'LMT', 'RTX',

  'WMT', 'COST', 'TGT', 'HD', 'LOW',
  'NKE', 'SBUX', 'MCD', 'CMG', 'YUM',
  'KO', 'PEP', 'PG', 'CL', 'EL',
  'LULU', 'TJX', 'ULTA', 'RCL', 'CCL',

  'BAC', 'C', 'MS', 'BLK', 'SCHW',
  'AXP', 'COF', 'ALLY', 'DFS', 'KKR',
  'BX', 'APO', 'ICE', 'CME', 'SPGI',
  'MCO', 'BRK.B', 'TROW', 'USB', 'PNC',

  'UNH', 'HUM', 'CI', 'ELV', 'CVS',
  'ABBV', 'MRK', 'PFE', 'BMY', 'GILD',
  'AMGN', 'REGN', 'VRTX', 'ISRG', 'SYK',
  'MDT', 'TMO', 'DHR', 'BSX', 'ZBH',

  'PDD', 'BABA', 'BIDU', 'JD', 'SE',
  'MSTR', 'RIOT', 'MARA', 'UPST', 'LCID',
];

const MAX_TICKERS = 200;
const RANK_CACHE_TTL_MS = 30_000;
const rankCache = new Map<string, { expiresAt: number; response: RankResponse }>();

// ── Request schema ─────────────────────────────────────────────────────────

const rankRequestSchema = z.object({
  tickers: z
    .array(z.string().min(1).max(10).regex(/^[A-Za-z.]{1,10}$/, 'Invalid ticker format'))
    .min(1)
    .max(MAX_TICKERS)
    .default(DEFAULT_WATCHLIST),
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
  const normalizedTickers = tickers.map((ticker) => ticker.toUpperCase());
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

// ── GET convenience: rank the default watchlist ───────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const tickerParam  = searchParams.get('tickers');
  const horizonParam = searchParams.get('horizonWeeks');

  const tickers = tickerParam
    ? tickerParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_WATCHLIST;

  const horizonWeeks = horizonParam ? parseInt(horizonParam, 10) : 6;

  const syntheticBody = JSON.stringify({ tickers, horizonWeeks });
  const syntheticReq  = new NextRequest(req.url, {
    method:  'POST',
    body:    syntheticBody,
    headers: { 'content-type': 'application/json' },
  });

  return POST(syntheticReq);
}
