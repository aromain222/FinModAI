import {
  getFmpQuote,
  getPolygonQuote,
  getFinnhubQuote,
  getAlphaQuote,
  getFmpProfile,
} from '@/lib/providers/marketFacts';
import type { FactCandidate } from '@/lib/enrich/validate';

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

const parseNumber = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const shareCandidate = (value: number | null, source: string): FactCandidate | null => {
  if (!value || !Number.isFinite(value)) return null;
  return { value, source, confidence: source === 'fmp' ? 0.8 : 0.7, unit: 'shares' };
};

const priceCandidate = (value: number | null, source: string): FactCandidate | null => {
  if (!value || !Number.isFinite(value)) return null;
  return { value, source, confidence: source === 'polygon' ? 0.8 : 0.7, unit: 'usd' };
};

async function tryFmpShares(ticker: string): Promise<FactCandidate | null> {
  const apiKey = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://financialmodelingprep.com/api/v3/enterprise-values/${encodeURIComponent(
      ticker
    )}?limit=1&apikey=${apiKey}`;
    const res = await withTimeout(fetch(url, { cache: 'no-store' }));
    if (!res.ok) return null;
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const shares = parseNumber(first?.numberOfShares);
    return shareCandidate(shares, 'fmp');
  } catch {
    return null;
  }
}

async function tryPolygonShares(ticker: string): Promise<FactCandidate | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${apiKey}`;
    const res = await withTimeout(fetch(url, { cache: 'no-store' }));
    if (!res.ok) return null;
    const json = await res.json();
    const shares =
      parseNumber(json?.results?.share_class_shares_outstanding) ||
      parseNumber(json?.results?.weighted_shares_outstanding);
    return shareCandidate(shares, 'polygon');
  } catch {
    return null;
  }
}

async function tryFinnhubShares(ticker: string): Promise<FactCandidate | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(
      ticker
    )}&metric=all&token=${apiKey}`;
    const res = await withTimeout(fetch(url, { cache: 'no-store' }));
    if (!res.ok) return null;
    const json = await res.json();
    const shares = parseNumber(json?.metric?.sharesOutstanding ?? json?.metric?.shareOutstanding);
    if (!shares) return null;
    // Finnhub returns millions
    return { value: shares, source: 'finnhub', confidence: 0.7, unit: 'millions' };
  } catch {
    return null;
  }
}

async function tryAlphaShares(ticker: string): Promise<FactCandidate | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(
      ticker
    )}&apikey=${apiKey}`;
    const res = await withTimeout(fetch(url, { cache: 'no-store' }));
    if (!res.ok) return null;
    const json = await res.json();
    const shares = parseNumber(json?.SharesOutstanding);
    return shareCandidate(shares, 'alphavantage');
  } catch {
    return null;
  }
}

export async function getMarketCandidates(ticker: string) {
  const [fmpShares, polygonShares, finnhubShares, alphaShares] = await Promise.all([
    tryFmpShares(ticker),
    tryPolygonShares(ticker),
    tryFinnhubShares(ticker),
    tryAlphaShares(ticker),
  ]);

  const [polygonQuote, fmpQuote, finnhubQuote, alphaQuote, profile] = await Promise.all([
    getPolygonQuote(ticker),
    getFmpQuote(ticker),
    getFinnhubQuote(ticker),
    getAlphaQuote(ticker),
    getFmpProfile(ticker),
  ]);

  const shareCandidates = [fmpShares, polygonShares, finnhubShares, alphaShares].filter(
    Boolean
  ) as FactCandidate[];

  const priceCandidates = [
    priceCandidate(polygonQuote?.price ?? null, 'polygon'),
    priceCandidate(fmpQuote?.price ?? null, 'fmp'),
    priceCandidate(finnhubQuote?.price ?? null, 'finnhub'),
    priceCandidate(alphaQuote?.price ?? null, 'alphavantage'),
  ].filter(Boolean) as FactCandidate[];

  const marketCapCandidates = [
    fmpQuote?.marketCap
      ? ({ value: fmpQuote.marketCap, source: 'fmp', confidence: 0.7, unit: 'usd' } as FactCandidate)
      : null,
  ].filter(Boolean) as FactCandidate[];

  return {
    shareCandidates,
    priceCandidates,
    marketCapCandidates,
    companyName: profile?.companyName ?? fmpQuote?.companyName ?? null,
  };
}
