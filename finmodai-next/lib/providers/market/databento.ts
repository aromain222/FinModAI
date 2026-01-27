import { ENV, keysPresent } from '@/lib/env/server';
import { fetchWithTimeout, toErrorText } from '@/lib/providers/utils';
import type { MarketChartResult, MarketPoint } from '@/lib/providers/types';

type Range = '1D' | '1W' | '1M';

const BASE_URL = ENV.DATABENTO_BASE_URL || 'https://hist.databento.com/v0';
const DATASET = ENV.DATABENTO_EQUITIES_DATASET || 'DBEQ';

const rangeLimits: Record<Range, number> = { '1D': 3, '1W': 8, '1M': 35 };

const computeChangePct = (points: MarketPoint[]) => {
  if (points.length < 2) return null;
  const first = points[0]?.close ?? 0;
  const last = points[points.length - 1]?.close ?? 0;
  if (!first) return null;
  return ((last - first) / first) * 100;
};

const normalizePoints = (rows: any[]): MarketPoint[] =>
  rows
    .map((row) => {
      const t = row.t || row.ts || row.time || row.timestamp;
      const close = row.c ?? row.close ?? row.p;
      const date = typeof t === 'number' ? new Date(t) : new Date(t);
      if (!Number.isFinite(close) || Number.isNaN(date.getTime())) return null;
      return { t: date.toISOString(), close: Number(close) };
    })
    .filter((item): item is MarketPoint => Boolean(item))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

export async function getMarketChart(params: {
  symbol: string;
  range: Range;
  traceId: string;
}): Promise<MarketChartResult> {
  if (!keysPresent.databento) {
    return {
      status: 'missing_key',
      source: 'DataBento',
      asOf: new Date().toISOString(),
      data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
      errors: ['DATABENTO_API_KEY missing'],
    };
  }

  const apiKey = ENV.DATABENTO_API_KEY as string;
  const schema = params.range === '1D' ? 'ohlcv-1m' : 'ohlcv-1d';
  const limit = params.range === '1D' ? '300' : params.range === '1W' ? '80' : '200';

  try {
    const url = `${BASE_URL}/timeseries?${new URLSearchParams({
      dataset: DATASET,
      symbols: params.symbol,
      schema,
      limit,
    }).toString()}`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: { 'X-Api-Key': apiKey },
        cache: 'no-store',
      },
      8000
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        status: 'error',
        source: 'DataBento',
        asOf: new Date().toISOString(),
        data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
        errors: [body || `HTTP ${res.status}`],
      };
    }
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json?.bars) ? json.bars : json?.data?.bars || [];
    const points = normalizePoints(rows);
    const limitCount = rangeLimits[params.range] ?? points.length;
    const trimmed = points.slice(-limitCount);
    if (!trimmed.length) {
      return {
        status: 'error',
        source: 'DataBento',
        asOf: new Date().toISOString(),
        data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
        errors: ['DataBento returned no data'],
      };
    }
    return {
      status: 'ok',
      source: 'DataBento',
      asOf: trimmed[trimmed.length - 1]?.t ?? new Date().toISOString(),
      data: { symbol: params.symbol, range: params.range, points: trimmed, changePct: computeChangePct(trimmed) },
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'DataBento',
      asOf: new Date().toISOString(),
      data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
      errors: [toErrorText(error)],
    };
  }
}
