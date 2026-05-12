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

async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const joined = symbols.map(s => encodeURIComponent(s)).join('%2C');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketChange,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,shortName`;

  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 CapitalBase/1.0' },
    signal: AbortSignal.timeout(8_000),
  });

  const result = new Map<string, StockQuote>();
  if (!res.ok) return result;

  let body: unknown;
  try { body = await res.json(); } catch { return result; }

  const quotes =
    (body as { quoteResponse?: { result?: unknown[] } })?.quoteResponse?.result;
  if (!Array.isArray(quotes)) return result;

  for (const q of quotes) {
    if (!q || typeof q !== 'object') continue;
    const item = q as Record<string, unknown>;
    const sym = typeof item.symbol === 'string' ? item.symbol.toUpperCase() : null;
    if (!sym) continue;
    result.set(sym, {
      ticker: sym,
      price:      typeof item.regularMarketPrice === 'number' ? item.regularMarketPrice : null,
      changePct:  typeof item.regularMarketChangePercent === 'number' ? item.regularMarketChangePercent : null,
      changeAbs:  typeof item.regularMarketChange === 'number' ? item.regularMarketChange : null,
      volume:     typeof item.regularMarketVolume === 'number' ? item.regularMarketVolume : null,
      marketCap:  typeof item.marketCap === 'number' ? item.marketCap : null,
      high52w:    typeof item.fiftyTwoWeekHigh === 'number' ? item.fiftyTwoWeekHigh : null,
      low52w:     typeof item.fiftyTwoWeekLow === 'number' ? item.fiftyTwoWeekLow : null,
      name:       typeof item.shortName === 'string' ? item.shortName : null,
    });
  }

  return result;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 50);

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'symbols required' }, { status: 400 });
  }

  // Yahoo max ~10 symbols per request reliably — batch if needed
  const BATCH = 10;
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += BATCH) {
    batches.push(symbols.slice(i, i + BATCH));
  }

  const results = new Map<string, StockQuote>();
  await Promise.allSettled(
    batches.map(batch =>
      fetchYahooQuotes(batch).then(map => {
        map.forEach((v, k) => results.set(k, v));
      }),
    ),
  );

  const quotes: StockQuote[] = symbols.map(sym => results.get(sym) ?? {
    ticker: sym, price: null, changePct: null, changeAbs: null,
    volume: null, marketCap: null, high52w: null, low52w: null, name: null,
  });

  return NextResponse.json({ quotes }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
