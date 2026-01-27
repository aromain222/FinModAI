const withTimeout = async <T>(promise: Promise<T>, ms = 8000): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // @ts-ignore
    return await promise;
  } finally {
    clearTimeout(timer);
  }
};

const parseNum = (v: any): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export async function getFmpQuote(ticker: string) {
  const key = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
  if (!key) return null;
  const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(ticker)}?apikey=${key}`;
  const res = await withTimeout(fetch(url, { cache: 'no-store' }));
  if (!res.ok) return null;
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) return null;
  return {
    price: parseNum(first?.price),
    marketCap: parseNum(first?.marketCap),
    companyName: first?.name || null,
    source: 'fmp' as const,
  };
}

export async function getPolygonQuote(ticker: string) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(
    ticker
  )}/prev?adjusted=true&apiKey=${key}`;
  const res = await withTimeout(fetch(url, { cache: 'no-store' }));
  if (!res.ok) return null;
  const data = await res.json();
  const result = Array.isArray(data?.results) ? data.results[0] : null;
  if (!result) return null;
  return {
    price: parseNum(result?.c),
    marketCap: null,
    source: 'polygon' as const,
  };
}

export async function getFinnhubQuote(ticker: string) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${key}`;
  const res = await withTimeout(fetch(url, { cache: 'no-store' }));
  if (!res.ok) return null;
  const data = await res.json();
  return {
    price: parseNum(data?.c),
    source: 'finnhub' as const,
  };
}

export async function getAlphaQuote(ticker: string) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    ticker
  )}&apikey=${key}`;
  const res = await withTimeout(fetch(url, { cache: 'no-store' }));
  if (!res.ok) return null;
  const data = await res.json();
  const quote = data?.['Global Quote'];
  return {
    price: parseNum(quote?.['05. price']),
    source: 'alphavantage' as const,
  };
}

export async function getFmpProfile(ticker: string) {
  const key = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
  if (!key) return null;
  const url = `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(ticker)}?apikey=${key}`;
  const res = await withTimeout(fetch(url, { cache: 'no-store' }));
  if (!res.ok) return null;
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) return null;
  return { companyName: first.companyName || first.company_name || null, source: 'fmp' as const };
}
