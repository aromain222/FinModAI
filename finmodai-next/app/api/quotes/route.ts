import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type StockQuote = {
  ticker: string;
  price: number | null;
  changePct: number | null;
  changeAbs: number | null;
  volume: number | null;
  marketCap: number | null;
  high52w: number | null;
  low52w: number | null;
  name: string | null;
};

// Yahoo v7 multi-quote requires a rotating crumb cookie that can't be
// maintained across serverless invocations and gets 401 from cloud IPs.
// The v8 chart endpoint works per-ticker without auth.
async function fetchOneQuote(symbol: string): Promise<StockQuote> {
  const nullResult: StockQuote = {
    ticker: symbol, price: null, changePct: null, changeAbs: null,
    volume: null, marketCap: null, high52w: null, low52w: null, name: null,
  };

  let body: unknown;
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return nullResult;
    body = await res.json();
  } catch {
    return nullResult;
  }

  type ChartBody = {
    chart?: {
      result?: Array<{
        meta?: Record<string, unknown>;
        indicators?: {
          quote?: Array<{ volume?: number[] }>;
        };
      }>;
    };
  };

  const result = (body as ChartBody)?.chart?.result?.[0];
  if (!result) return nullResult;

  const meta = (result.meta ?? {}) as Record<string, unknown>;

  const price      = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null;
  const prevClose  = typeof meta.chartPreviousClose === 'number'
    ? meta.chartPreviousClose
    : typeof meta.previousClose === 'number' ? meta.previousClose : null;
  const changeAbs  = price !== null && prevClose !== null ? +(price - prevClose).toFixed(4) : null;
  const changePct  = price !== null && prevClose !== null && prevClose > 0
    ? +((price - prevClose) / prevClose * 100).toFixed(4)
    : null;

  // Volume comes from the indicators array, not meta
  const volArr = result.indicators?.quote?.[0]?.volume;
  const volume = Array.isArray(volArr)
    ? ([...volArr].reverse().find((v: unknown) => typeof v === 'number') ?? null) as number | null
    : null;

  return {
    ticker:    symbol,
    price,
    changePct,
    changeAbs,
    volume,
    marketCap: typeof meta.marketCap === 'number' ? meta.marketCap : null,
    high52w:   typeof meta.fiftyTwoWeekHigh === 'number' ? meta.fiftyTwoWeekHigh : null,
    low52w:    typeof meta.fiftyTwoWeekLow  === 'number' ? meta.fiftyTwoWeekLow  : null,
    name:      typeof meta.longName === 'string' ? meta.longName :
               typeof meta.shortName === 'string' ? meta.shortName : null,
  };
}

export async function GET(req: NextRequest) {
  const raw     = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 50);

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'symbols required' }, { status: 400 });
  }

  const settled = await Promise.allSettled(symbols.map(fetchOneQuote));
  const quotes: StockQuote[] = settled.map((r, i) =>
    r.status === 'fulfilled' ? r.value : {
      ticker: symbols[i]!, price: null, changePct: null, changeAbs: null,
      volume: null, marketCap: null, high52w: null, low52w: null, name: null,
    }
  );

  return NextResponse.json({ quotes }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
