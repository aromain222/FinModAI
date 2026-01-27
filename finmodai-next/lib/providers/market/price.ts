import { fetchWithTimeout } from '@/lib/providers/utils';
import { fetchStooqDailyCSV } from '@/lib/providers/market/stooq';

export type MarketPriceSource = 'finnhub' | 'polygon' | 'fmp' | 'alphavantage' | 'stooq' | 'unavailable';

export type MarketPriceSnapshot = {
  marketPrice: number | null;
  source: MarketPriceSource;
  asOf: string;
  warnings: string[];
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isValidPrice = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

type AttemptResult = {
  price: number | null;
  source: MarketPriceSource;
  asOf?: string;
  warning?: string;
};

async function tryFinnhub(ticker: string): Promise<AttemptResult> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return { price: null, source: 'finnhub' };
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`;
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
    if (!res.ok) return { price: null, source: 'finnhub', warning: `finnhub_http_${res.status}` };
    const json = await res.json().catch(() => null);
    const price = parseNumber(json?.c);
    if (!isValidPrice(price)) return { price: null, source: 'finnhub', warning: 'finnhub_no_price' };
    return { price, source: 'finnhub', asOf: new Date().toISOString() };
  } catch (error) {
    return { price: null, source: 'finnhub', warning: 'finnhub_failed' };
  }
}

async function tryPolygon(ticker: string): Promise<AttemptResult> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return { price: null, source: 'polygon' };
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apiKey=${apiKey}`;
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
    if (!res.ok) return { price: null, source: 'polygon', warning: `polygon_http_${res.status}` };
    const json = await res.json().catch(() => null);
    const result = Array.isArray(json?.results) ? json.results[0] : null;
    const price = parseNumber(result?.c);
    if (!isValidPrice(price)) return { price: null, source: 'polygon', warning: 'polygon_no_price' };
    const asOf =
      typeof result?.t === 'number' && Number.isFinite(result.t)
        ? new Date(result.t).toISOString()
        : new Date().toISOString();
    return { price, source: 'polygon', asOf };
  } catch {
    return { price: null, source: 'polygon', warning: 'polygon_failed' };
  }
}

async function tryFmp(ticker: string): Promise<AttemptResult> {
  const apiKey = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
  if (!apiKey) return { price: null, source: 'fmp' };
  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(ticker)}?apikey=${apiKey}`;
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
    if (!res.ok) return { price: null, source: 'fmp', warning: `fmp_http_${res.status}` };
    const json = await res.json().catch(() => null);
    const first = Array.isArray(json) ? json[0] : null;
    const price = parseNumber(first?.price);
    if (!isValidPrice(price)) return { price: null, source: 'fmp', warning: 'fmp_no_price' };
    return { price, source: 'fmp', asOf: new Date().toISOString() };
  } catch {
    return { price: null, source: 'fmp', warning: 'fmp_failed' };
  }
}

async function tryAlphaVantage(ticker: string): Promise<AttemptResult> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return { price: null, source: 'alphavantage' };
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
    if (!res.ok) return { price: null, source: 'alphavantage', warning: `alphavantage_http_${res.status}` };
    const json = await res.json().catch(() => null);
    const quote = json?.['Global Quote'];
    const price = parseNumber(quote?.['05. price']);
    if (!isValidPrice(price)) return { price: null, source: 'alphavantage', warning: 'alphavantage_no_price' };
    return { price, source: 'alphavantage', asOf: new Date().toISOString() };
  } catch {
    return { price: null, source: 'alphavantage', warning: 'alphavantage_failed' };
  }
}

async function tryStooq(ticker: string, traceId: string): Promise<AttemptResult> {
  try {
    const points = await fetchStooqDailyCSV(ticker, traceId, 3000);
    if (!points.length) return { price: null, source: 'stooq', warning: 'stooq_no_data' };
    const last = points[points.length - 1];
    if (!isValidPrice(last?.close ?? null)) return { price: null, source: 'stooq', warning: 'stooq_no_price' };
    return { price: last.close, source: 'stooq', asOf: last.t };
  } catch {
    return { price: null, source: 'stooq', warning: 'stooq_failed' };
  }
}

export async function fetchLatestMarketPrice(params: { ticker: string; traceId: string }): Promise<MarketPriceSnapshot> {
  const ticker = params.ticker.trim().toUpperCase();
  const asOfNow = new Date().toISOString();
  if (!ticker) {
    return { marketPrice: null, source: 'unavailable', asOf: asOfNow, warnings: ['ticker_missing'] };
  }

  const [finnhub, polygon, fmp, alphavantage, stooq] = await Promise.all([
    tryFinnhub(ticker),
    tryPolygon(ticker),
    tryFmp(ticker),
    tryAlphaVantage(ticker),
    tryStooq(ticker, params.traceId),
  ]);

  const attempts = [finnhub, polygon, fmp, alphavantage, stooq];
  const warnings = attempts.map((a) => a.warning).filter((w): w is string => typeof w === 'string');

  const picked = attempts.find((attempt) => isValidPrice(attempt.price));
  if (!picked || !isValidPrice(picked.price)) {
    return { marketPrice: null, source: 'unavailable', asOf: asOfNow, warnings };
  }

  return {
    marketPrice: picked.price,
    source: picked.source,
    asOf: picked.asOf ?? asOfNow,
    warnings,
  };
}

