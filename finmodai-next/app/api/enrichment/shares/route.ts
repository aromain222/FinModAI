import { NextRequest } from 'next/server';

type ProviderResult = { ok: boolean; sharesMm?: number; source: string; warning?: string };

const withTimeout = async <T>(promise: Promise<T>, ms = 8000): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // @ts-ignore signal optional
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

async function tryFmp(ticker: string): Promise<ProviderResult> {
  const apiKey = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
  if (!apiKey) return { ok: false, source: 'fmp', warning: 'missing api key' };
  try {
    const url = `https://financialmodelingprep.com/api/v3/enterprise-values/${encodeURIComponent(
      ticker
    )}?limit=1&apikey=${apiKey}`;
    const res = await withTimeout(fetch(url, { cache: 'no-store' }));
    if (!res.ok) return { ok: false, source: 'fmp', warning: `http ${res.status}` };
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const shares = parseNumber(first?.numberOfShares);
    if (!shares || shares <= 0) return { ok: false, source: 'fmp', warning: 'no shares' };
    return { ok: true, sharesMm: shares / 1_000_000, source: 'fmp' };
  } catch (e: any) {
    return { ok: false, source: 'fmp', warning: e?.message || 'fmp error' };
  }
}

async function tryPolygon(ticker: string): Promise<ProviderResult> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return { ok: false, source: 'polygon', warning: 'missing api key' };
  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${apiKey}`;
    const res = await withTimeout(fetch(url, { cache: 'no-store' }));
    if (!res.ok) return { ok: false, source: 'polygon', warning: `http ${res.status}` };
    const json = await res.json();
    const shares =
      parseNumber(json?.results?.share_class_shares_outstanding) ||
      parseNumber(json?.results?.weighted_shares_outstanding);
    if (!shares || shares <= 0) return { ok: false, source: 'polygon', warning: 'no shares' };
    return { ok: true, sharesMm: shares / 1_000_000, source: 'polygon' };
  } catch (e: any) {
    return { ok: false, source: 'polygon', warning: e?.message || 'polygon error' };
  }
}

async function tryFinnhub(ticker: string): Promise<ProviderResult> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return { ok: false, source: 'finnhub', warning: 'missing api key' };
  try {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(
      ticker
    )}&metric=all&token=${apiKey}`;
    const res = await withTimeout(fetch(url, { cache: 'no-store' }));
    if (!res.ok) return { ok: false, source: 'finnhub', warning: `http ${res.status}` };
    const json = await res.json();
    const shares = parseNumber(json?.metric?.sharesOutstanding ?? json?.metric?.shareOutstanding);
    if (!shares || shares <= 0) return { ok: false, source: 'finnhub', warning: 'no shares' };
    // Finnhub returns millions already
    return { ok: true, sharesMm: shares, source: 'finnhub' };
  } catch (e: any) {
    return { ok: false, source: 'finnhub', warning: e?.message || 'finnhub error' };
  }
}

async function tryAlpha(ticker: string): Promise<ProviderResult> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return { ok: false, source: 'alpha', warning: 'missing api key' };
  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(
      ticker
    )}&apikey=${apiKey}`;
    const res = await withTimeout(fetch(url, { cache: 'no-store' }));
    if (!res.ok) return { ok: false, source: 'alpha', warning: `http ${res.status}` };
    const json = await res.json();
    const shares = parseNumber(json?.SharesOutstanding);
    if (!shares || shares <= 0) return { ok: false, source: 'alpha', warning: 'no shares' };
    return { ok: true, sharesMm: shares / 1_000_000, source: 'alpha' };
  } catch (e: any) {
    return { ok: false, source: 'alpha', warning: e?.message || 'alpha error' };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker');
  const traceId = crypto.randomUUID();
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'ticker required', traceId }), { status: 400 });
  }

  const chain = [tryFmp, tryPolygon, tryFinnhub, tryAlpha];
  const warnings: string[] = [];
  for (const fn of chain) {
    const result = await fn(ticker);
    if (result.ok && result.sharesMm && Number.isFinite(result.sharesMm) && result.sharesMm > 0) {
      return new Response(JSON.stringify({ ticker, sharesOutstandingMm: result.sharesMm, source: result.source, traceId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (result.warning) warnings.push(`${result.source}: ${result.warning}`);
  }

  return new Response(JSON.stringify({ ticker, sharesOutstandingMm: null, source: 'none', warnings, traceId }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  });
}
