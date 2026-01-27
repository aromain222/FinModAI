import { MarketIndexSeries } from '@/lib/schemas/market';
import { notConfigured, providerFailure } from '@/lib/providers/errors';
import { toDateRange } from '@/lib/providers/market/seriesUtils';
import { ENV, keysPresent } from '@/lib/env/server';
import { toErrorText } from '@/lib/providers/utils';
import type { MarketChartResult, MarketPoint } from '@/lib/providers/types';

export async function fetchFinnhubSeries(params: {
  symbol: string;
  range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
  traceId: string;
}): Promise<{ data: MarketIndexSeries; provider: string }> {
  const apiKey = ENV.FINNHUB_API_KEY;
  if (!apiKey) throw notConfigured('finnhub');

  const { from, to, interval } = toDateRange(params.range);
  const fromUnix = Math.floor(from.getTime() / 1000);
  const toUnix = Math.floor(to.getTime() / 1000);

  const resolution = interval === '1d' ? '5' : interval === '1w' ? '30' : interval === '1m' ? 'D' : interval === '3m' ? 'D' : interval === '1y' ? 'W' : 'W';

  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
    params.symbol
  )}&resolution=${resolution}&from=${fromUnix}&to=${toUnix}&token=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw providerFailure('finnhub', `HTTP ${res.status}`, res.status);
  const json = await res.json();
  if (json?.s !== 'ok') throw providerFailure('finnhub', 'No data returned');

  const points = (json?.t || []).map((t: number, idx: number) => ({
    t: new Date(t * 1000).toISOString(),
    v: Number(json?.c?.[idx]),
  }));

  return {
    data: {
      symbol: params.symbol,
      points,
      interval,
    },
    provider: 'finnhub',
  };
}

const computeChangePct = (points: MarketPoint[]) => {
  if (points.length < 2) return null;
  const first = points[0]?.close ?? 0;
  const last = points[points.length - 1]?.close ?? 0;
  if (!first) return null;
  return ((last - first) / first) * 100;
};

export async function getMarketChart(params: {
  symbol: string;
  range: '1D' | '1W' | '1M';
  traceId: string;
}): Promise<MarketChartResult> {
  if (!keysPresent.finnhub) {
    return {
      status: 'missing_key',
      source: 'Finnhub',
      asOf: new Date().toISOString(),
      data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
      errors: ['FINNHUB_API_KEY missing'],
    };
  }

  try {
    const series = await fetchFinnhubSeries({ symbol: params.symbol, range: params.range, traceId: params.traceId });
    const points = series.data.points.map((point) => ({ t: point.t, close: point.v }));
    if (!points.length) {
      return {
        status: 'error',
        source: 'Finnhub',
        asOf: new Date().toISOString(),
        data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
        errors: ['Finnhub returned no data'],
      };
    }
    return {
      status: 'ok',
      source: 'Finnhub',
      asOf: points[points.length - 1]?.t ?? new Date().toISOString(),
      data: { symbol: params.symbol, range: params.range, points, changePct: computeChangePct(points) },
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'Finnhub',
      asOf: new Date().toISOString(),
      data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
      errors: [toErrorText(error)],
    };
  }
}
