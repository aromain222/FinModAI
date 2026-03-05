/**
 * FMP (Financial Modeling Prep) live market data provider.
 * Uses the /stable/ API endpoints (post-Aug 2025 migration).
 * Server-only — never import from client components.
 */

const FMP_BASE = 'https://financialmodelingprep.com/stable';

function getApiKey(): string | null {
  return process.env.FMP_API_KEY || null;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearLow: number;
  yearHigh: number;
  volume: number;
  avgVolume: number;
  open: number;
  previousClose: number;
  marketCap: number;
  timestamp: number;
};

export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FmpError = {
  code: 'NO_KEY' | 'RATE_LIMIT' | 'HTTP_ERROR' | 'PARSE_ERROR' | 'NETWORK_ERROR' | 'PREMIUM_REQUIRED';
  message: string;
  status?: number;
};

export type FmpResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FmpError };

/* ------------------------------------------------------------------ */
/*  Internal fetch with 429 retry                                      */
/* ------------------------------------------------------------------ */

async function fmpFetch(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 429 && attempt < retries) {
      const wait = Math.pow(2, attempt + 1) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error('Exhausted retries');
}

/* ------------------------------------------------------------------ */
/*  Single quote (stable API)                                          */
/* ------------------------------------------------------------------ */

async function fetchSingleQuote(symbol: string, apiKey: string): Promise<Quote | null> {
  const url = `${FMP_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  try {
    const res = await fmpFetch(url, 1);
    if (res.status === 429) return null;
    if (!res.ok) return null;

    const text = await res.text();
    if (text.includes('Premium Query Parameter') || text.includes('Legacy Endpoint')) return null;

    const json = JSON.parse(text);
    if (!Array.isArray(json) || json.length === 0) return null;

    const q = json[0];
    if (!q || typeof q.price !== 'number') return null;

    return {
      symbol: q.symbol ?? symbol,
      name: q.name ?? symbol,
      price: q.price,
      changesPercentage: q.changePercentage ?? q.changesPercentage ?? 0,
      change: q.change ?? 0,
      dayLow: q.dayLow ?? q.price,
      dayHigh: q.dayHigh ?? q.price,
      yearLow: q.yearLow ?? 0,
      yearHigh: q.yearHigh ?? 0,
      volume: q.volume ?? 0,
      avgVolume: q.avgVolume ?? 0,
      open: q.open ?? q.previousClose ?? q.price,
      previousClose: q.previousClose ?? q.price,
      marketCap: q.marketCap ?? 0,
      timestamp: q.timestamp ? q.timestamp * 1000 : Date.now(),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  getBatchQuotes — fetches sequentially, max 3 concurrent            */
/* ------------------------------------------------------------------ */

export async function getBatchQuotes(symbols: string[]): Promise<FmpResult<Quote[]>> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: { code: 'NO_KEY', message: 'FMP_API_KEY not set' } };
  if (symbols.length === 0) return { ok: true, data: [] };

  const normalized = symbols.map((s) => s.trim().toUpperCase());

  const CONCURRENCY = 3;
  const results: (Quote | null)[] = new Array(normalized.length).fill(null);

  for (let i = 0; i < normalized.length; i += CONCURRENCY) {
    const batch = normalized.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((sym) => fetchSingleQuote(sym, apiKey))
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  const quotes = results.filter((q): q is Quote => q !== null);

  if (quotes.length === 0) {
    return { ok: false, error: { code: 'HTTP_ERROR', message: 'No quotes returned from FMP' } };
  }

  return { ok: true, data: quotes };
}

/* ------------------------------------------------------------------ */
/*  getHistoricalChart — uses /stable/historical-price-eod/full        */
/* ------------------------------------------------------------------ */

const RANGE_CONFIG: Record<string, number> = {
  '1D': 2,
  '5D': 7,
  '1W': 10,
  '1M': 35,
  '3M': 100,
  '6M': 200,
  '1Y': 370,
  'YTD': 370,
  '5Y': 1850,
  'MAX': 3700,
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getHistoricalChart(
  symbol: string,
  range: string
): Promise<FmpResult<Candle[]>> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: { code: 'NO_KEY', message: 'FMP_API_KEY not set' } };

  const daysBack = RANGE_CONFIG[range.toUpperCase()] ?? 35;
  const sym = symbol.trim().toUpperCase();
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 86400000);

  const url = `${FMP_BASE}/historical-price-eod/full?symbol=${encodeURIComponent(sym)}&from=${formatDate(from)}&to=${formatDate(to)}&apikey=${apiKey}`;

  try {
    const res = await fmpFetch(url);
    if (res.status === 429) {
      return { ok: false, error: { code: 'RATE_LIMIT', message: 'FMP rate limit exceeded', status: 429 } };
    }
    if (!res.ok) {
      return { ok: false, error: { code: 'HTTP_ERROR', message: `FMP ${res.status}`, status: res.status } };
    }

    const text = await res.text();
    if (text.includes('Premium Query Parameter') || text.includes('Legacy Endpoint')) {
      return { ok: false, error: { code: 'PREMIUM_REQUIRED', message: `Symbol ${sym} requires premium FMP plan` } };
    }

    const json = JSON.parse(text);
    let raw: any[];

    if (Array.isArray(json)) {
      raw = json;
    } else if (Array.isArray(json?.historical)) {
      raw = json.historical;
    } else {
      return { ok: false, error: { code: 'PARSE_ERROR', message: 'Unexpected FMP response shape' } };
    }

    const candles: Candle[] = raw
      .map((item: any) => {
        const close = Number(item.close);
        if (!Number.isFinite(close)) return null;
        return {
          date: item.date ?? new Date(item.timestamp || 0).toISOString(),
          open: Number.isFinite(Number(item.open)) ? Number(item.open) : close,
          high: Number.isFinite(Number(item.high)) ? Number(item.high) : close,
          low: Number.isFinite(Number(item.low)) ? Number(item.low) : close,
          close,
          volume: Number.isFinite(Number(item.volume)) ? Number(item.volume) : 0,
        };
      })
      .filter((c: Candle | null): c is Candle => c !== null)
      .sort((a: Candle, b: Candle) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { ok: true, data: candles };
  } catch (err: any) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: err?.message || 'FMP fetch failed' } };
  }
}

/* ------------------------------------------------------------------ */
/*  Movers: fetch a curated set of major stocks + sort by |change%|    */
/* ------------------------------------------------------------------ */

const MOVERS_UNIVERSE = [
  'AAPL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'GOOGL',
  'JPM', 'V', 'WMT', 'UNH', 'JNJ', 'XOM', 'CVX',
  'BA', 'NFLX', 'INTC', 'AMD', 'COST', 'DIS', 'KO', 'PEP', 'ABBV',
  'SPY', 'BTCUSD', 'ETHUSD',
];

export type MoverQuote = {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
};

export async function getMovers(): Promise<FmpResult<{ rising: MoverQuote[]; falling: MoverQuote[] }>> {
  const result = await getBatchQuotes(MOVERS_UNIVERSE);
  if (!result.ok) return result as FmpResult<{ rising: MoverQuote[]; falling: MoverQuote[] }>;

  const all = result.data.map((q) => ({
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    changesPercentage: q.changesPercentage,
    change: q.change,
  }));

  const rising = all
    .filter((q) => q.changesPercentage > 0)
    .sort((a, b) => b.changesPercentage - a.changesPercentage)
    .slice(0, 10);

  const falling = all
    .filter((q) => q.changesPercentage < 0)
    .sort((a, b) => a.changesPercentage - b.changesPercentage)
    .slice(0, 10);

  return { ok: true, data: { rising, falling } };
}

/* ------------------------------------------------------------------ */
/*  Sector proxies: use one representative stock per GICS sector       */
/* ------------------------------------------------------------------ */

const SECTOR_PROXIES: Array<{ sector: string; symbol: string }> = [
  { sector: 'Technology', symbol: 'AAPL' },
  { sector: 'Financials', symbol: 'JPM' },
  { sector: 'Healthcare', symbol: 'UNH' },
  { sector: 'Consumer Discretionary', symbol: 'AMZN' },
  { sector: 'Consumer Staples', symbol: 'KO' },
  { sector: 'Industrials', symbol: 'BA' },
  { sector: 'Energy', symbol: 'XOM' },
  { sector: 'Communication Services', symbol: 'GOOGL' },
  { sector: 'Crypto', symbol: 'BTCUSD' },
];

export type SectorPerf = {
  sector: string;
  symbol: string;
  changesPercentage: number;
};

export async function getSectorPerformance(): Promise<FmpResult<SectorPerf[]>> {
  const symbols = SECTOR_PROXIES.map((p) => p.symbol);
  const result = await getBatchQuotes(symbols);
  if (!result.ok) return result as FmpResult<SectorPerf[]>;

  const quoteMap = new Map(result.data.map((q) => [q.symbol, q]));

  const sectors: SectorPerf[] = SECTOR_PROXIES
    .map((proxy) => {
      const q = quoteMap.get(proxy.symbol);
      if (!q) return null;
      return {
        sector: proxy.sector,
        symbol: proxy.symbol,
        changesPercentage: q.changesPercentage,
      };
    })
    .filter((s): s is SectorPerf => s !== null);

  if (sectors.length === 0) {
    return { ok: false, error: { code: 'HTTP_ERROR', message: 'No sector data available' } };
  }

  return { ok: true, data: sectors };
}
