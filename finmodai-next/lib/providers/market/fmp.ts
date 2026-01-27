import { MarketIndexSeries } from '@/lib/schemas/market';
import { notConfigured, providerFailure } from '@/lib/providers/errors';
import { toDateRange } from '@/lib/providers/market/seriesUtils';
import { fetchWithTimeout } from '@/lib/providers/utils';

export async function fetchFmpSeries(params: {
  symbol: string;
  range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
  traceId: string;
}): Promise<{ data: MarketIndexSeries; provider: string }> {
  const apiKey = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
  if (!apiKey) throw notConfigured('fmp');

  const { from, to, interval } = toDateRange(params.range);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(
    params.symbol
  )}?from=${fromStr}&to=${toStr}&serietype=line&apikey=${apiKey}`;
  const res = await fetchWithTimeout(url, { cache: 'no-store' }, 4000);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 300);
    throw providerFailure('fmp', snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`, res.status);
  }
  const json = await res.json().catch(() => null);
  const historical = Array.isArray(json?.historical) ? json.historical : [];
  const points = historical
    .map((row: any) => ({
      t: new Date(row.date).toISOString(),
      v: Number(row.close),
    }))
    .reverse();

  return {
    data: {
      symbol: params.symbol,
      points,
      interval,
    },
    provider: 'fmp',
  };
}
