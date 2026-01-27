import { MarketIndexSeries } from '@/lib/schemas/market';
import { notConfigured, providerFailure } from '@/lib/providers/errors';
import { toDateRange } from '@/lib/providers/market/seriesUtils';
import { fetchWithTimeout } from '@/lib/providers/utils';
import { ENV } from '@/lib/env/server';

const BASE_URL = ENV.MARKETSTACK_BASE_URL || 'https://api.marketstack.com/v1';

const toISODate = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

export async function fetchMarketstackSeries(params: {
  symbol: string;
  range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
  traceId: string;
}): Promise<{ data: MarketIndexSeries; provider: string }> {
  const apiKey = ENV.MARKETSTACK_API_KEY;
  if (!apiKey) throw notConfigured('marketstack');

  const { from, to, interval } = toDateRange(params.range);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  const url = `${BASE_URL}/eod?${new URLSearchParams({
    access_key: apiKey,
    symbols: params.symbol,
    date_from: fromStr,
    date_to: toStr,
    sort: 'DESC',
    limit: '1000',
  }).toString()}`;

  const res = await fetchWithTimeout(
    url,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
    4000
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw providerFailure('marketstack', body || `HTTP ${res.status}`, res.status);
  }

  const json = await res.json().catch(() => null);
  const rows = Array.isArray((json as any)?.data) ? (json as any).data : [];
  const points = rows
    .map((row: any) => {
      const close = Number(row?.adj_close ?? row?.close);
      const t = toISODate(row?.date);
      if (!t || !Number.isFinite(close)) return null;
      return { t, v: close };
    })
    .filter((item): item is { t: string; v: number } => Boolean(item))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

  if (!points.length) {
    throw providerFailure('marketstack', 'No data returned');
  }

  return {
    data: { symbol: params.symbol, points, interval },
    provider: 'marketstack',
  };
}
