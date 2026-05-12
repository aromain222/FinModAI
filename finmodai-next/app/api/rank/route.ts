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

  'RBLX', 'PINS', 'SNAP', 'ZM', 'DOCU',
  'FVRR', 'UPWK', 'ETSY', 'EBAY', 'W',
  'CVNA', 'CAR', 'GME', 'AMC', 'CHWY',
  'CAVA', 'SG', 'WING', 'DPZ', 'BROS',
  'CELH', 'MNST', 'KDP', 'TAP', 'STZ',
  'PM', 'MO', 'BTI', 'AI', 'PATH',
  'GTLB', 'CFLT', 'ESTC', 'DT', 'S',
  'PCOR', 'BILL', 'PAYC', 'TOST', 'FOUR',
  'GDDY', 'HUBS', 'APP', 'TTD', 'DOCS',
  'TEM', 'DUOL', 'U', 'TTWO', 'EA',

  'MRNA', 'BNTX', 'BIIB', 'ILMN', 'ALNY',
  'CRSP', 'BEAM', 'NTLA', 'VCYT', 'EXAS',
  'GH', 'NVCR', 'IOVA', 'VKTX', 'RXRX',
  'SDGR', 'WAL', 'FITB', 'KEY', 'RF',
  'TFC', 'HBAN', 'CMA', 'ZION', 'MTB',
  'PLD', 'AMT', 'CCI', 'EQIX', 'O',
  'SPG', 'VICI', 'PSA', 'FCX', 'NEM',
  'GOLD', 'AA', 'NUE', 'STLD', 'CLF',
  'X', 'SCCO', 'ALB', 'LAC', 'HAL',
  'BKR', 'DVN', 'FANG', 'EQT', 'CTRA',
  'WMB', 'KMI', 'ENB', 'TRP', 'NOC',
  'GD', 'HII', 'TDG', 'DAL', 'UAL',
  'AAL', 'LUV', 'FDX', 'UPS', 'CSX',
  'UNP', 'NSC', 'GM', 'F', 'RIVN',
  'NIO', 'LI', 'XPEV',

  // Telecom & Cable
  'T', 'VZ', 'TMUS', 'CHTR', 'CMCSA', 'LBRDK', 'WBD', 'PARA',

  // Healthcare — large-cap pharma & devices
  'JNJ', 'ABT', 'ZTS', 'GEHC', 'BAX', 'BDX', 'WAT', 'A',
  'PODD', 'DXCM', 'INSP', 'IRTC', 'ALGN', 'HOLX', 'IDXX',
  'MTD', 'IQV', 'CRL', 'LH', 'DGX', 'HSIC', 'PDCO',

  // Financials — insurance, alt asset, fintech
  'TRV', 'CB', 'ALL', 'AIG', 'AFL', 'MET', 'PRU', 'HIG',
  'RE', 'CINF', 'RNR', 'ACGL', 'LPLA', 'IBKR', 'MKTX', 'VIRT',
  'WFC', 'STT', 'BK', 'NTRS', 'SIVB',

  // Industrials — automation, defense, logistics
  'ITW', 'IR', 'GRMN', 'ROP', 'FTV', 'AME', 'XYL', 'OTIS',
  'CARR', 'TT', 'AXON', 'LDOS', 'SAIC', 'BAH', 'KTOS', 'HEI',
  'TDY', 'BWA', 'LEA', 'MGA', 'APTV',

  // Materials & Chemicals
  'LIN', 'APD', 'ECL', 'SHW', 'PPG', 'CE', 'EMN', 'IFF',
  'RPM', 'HUN', 'FMC', 'MOS', 'CF', 'NTR',

  // Utilities
  'AEP', 'EXC', 'PCG', 'XEL', 'ES', 'AWK', 'CNP', 'WEC',
  'CMS', 'DTE', 'PPL', 'AES', 'FE', 'D',

  // Consumer — specialty retail, food, beverages
  'FIVE', 'DG', 'DLTR', 'BBWI', 'RL', 'PVH', 'CPRI', 'FL',
  'GPS', 'ANF', 'AEO', 'URBN',
  'QSR', 'TXRH', 'DNUT', 'SHAK', 'DPZ',
  'KHC', 'GIS', 'CPB', 'SJM', 'MKC', 'HSY', 'MDLZ', 'CAG',
  'WBA', 'RAD', 'HLT', 'MAR', 'H', 'IHG',

  // Real Estate — REITs
  'WPC', 'NNN', 'STAG', 'REXR', 'ELS', 'SUI', 'INVH', 'LXP',
  'ARE', 'CBRE', 'JLL', 'CWK',

  // Software / SaaS — additions
  'ZI', 'BRZE', 'NTNX', 'PSTG', 'RAMP', 'CWAN', 'NCNO',
  'MSCI', 'VRSK', 'FDS', 'FICO', 'TYL', 'BLKB', 'MANH',
  'VEEV', 'MEDP', 'PRGS', 'ALRM', 'SPSC',

  // Semiconductors — additional
  'ENTG', 'ONTO', 'ACLS', 'FORM', 'AMBA', 'SWKS', 'QRVO',
  'MCHP', 'MTSI', 'POWI', 'DIOD', 'SITM',

  // International ADRs
  'SAP', 'AZN', 'GSK', 'SNY', 'NVS', 'RHHBY', 'UL', 'BP',
  'SHEL', 'TTE', 'VALE', 'RIO', 'BHP', 'TM', 'HMC', 'SONY',
  'NTES', 'TCEHY', 'GRAB', 'DKNG', 'WIX',
];

const MAX_TICKERS = 500;
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

// ── GET: serve from Supabase cache, fall back to live scoring ─────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Try Supabase cache first (max 4 hours old)
  try {
    const cached = await readCache(4 * 60 * 60 * 1000);
    if (cached.length > 0) {
      const response: RankResponse = {
        stocks: cached,
        scoredAt: cached[0]?.meta.scoredAt ?? new Date().toISOString(),
        horizonWeeks: 6,
      };
      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'private, max-age=60',
          'X-Ticker-Count': String(cached.length),
          'X-Rank-Source': 'supabase-cache',
        },
      });
    }
  } catch {
    // Supabase unavailable — fall through to live scoring
  }

  // Cold start or Supabase unavailable: score top tickers live
  const { searchParams } = req.nextUrl;
  const tickerParam  = searchParams.get('tickers');
  const horizonParam = searchParams.get('horizonWeeks');

  const tickers = tickerParam
    ? tickerParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_WATCHLIST.slice(0, 100); // limit live fallback

  const horizonWeeks = horizonParam ? parseInt(horizonParam, 10) : 6;

  const syntheticBody = JSON.stringify({ tickers, horizonWeeks });
  const syntheticReq  = new NextRequest(req.url, {
    method:  'POST',
    body:    syntheticBody,
    headers: { 'content-type': 'application/json' },
  });

  return POST(syntheticReq);
}
