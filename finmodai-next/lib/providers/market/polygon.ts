// lib/providers/market/polygon.ts
import { z } from 'zod';
import { MarketIndexSeries } from '@/lib/schemas/market';
import { notConfigured, providerFailure } from '@/lib/providers/errors';
import { toDateRange } from '@/lib/providers/market/seriesUtils';
import { fetchWithTimeout } from '@/lib/providers/utils';

export type MarketPoint = { t: string; close: number };

// Legacy function for existing code
export async function fetchPolygonSeries(params: {
  symbol: string;
  range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
  traceId: string;
}): Promise<{ data: MarketIndexSeries; provider: string }> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw notConfigured('polygon');

  const { from, to, multiplier, timespan, interval } = toDateRange(params.range);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/aggs/ticker/${params.symbol}/range/${multiplier}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&apiKey=${apiKey}`;
  const res = await fetchWithTimeout(url, { cache: 'no-store' }, 4000);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 300);
    throw providerFailure('polygon', snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`, res.status);
  }
  const json = await res.json().catch(() => null);
  const results = Array.isArray(json?.results) ? json.results : [];
  const points = results.map((r: any) => ({
    t: new Date(r.t).toISOString(),
    v: Number(r.c),
  }));

  return {
    data: {
      symbol: params.symbol,
      points,
      interval,
    },
    provider: 'polygon',
  };
}

const AggsResp = z.object({
  results: z
    .array(
      z.object({
        t: z.number(), // ms epoch
        c: z.number(), // close
      })
    )
    .optional(),
});

type Range = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | '5Y';

function mapRange(range: Range): { multiplier: number; timespan: 'minute' | 'hour' | 'day' } {
  // Keep it simple and reliable:
  // - short ranges => minute/hour
  // - longer => day
  switch (range) {
    case '1D':
      return { multiplier: 15, timespan: 'minute' };
    case '1W':
      return { multiplier: 60, timespan: 'minute' };
    case '1M':
      return { multiplier: 1, timespan: 'hour' };
    case '3M':
    case 'YTD':
    case '1Y':
    case '5Y':
    default:
      return { multiplier: 1, timespan: 'day' };
  }
}

function computeStartEnd(range: Range): { from: string; to: string } {
  const now = new Date();
  const end = now;
  const start = new Date(now);

  const yearStart = new Date(now.getFullYear(), 0, 1);

  switch (range) {
    case '1D':
      start.setDate(now.getDate() - 1);
      break;
    case '1W':
      start.setDate(now.getDate() - 7);
      break;
    case '1M':
      start.setMonth(now.getMonth() - 1);
      break;
    case '3M':
      start.setMonth(now.getMonth() - 3);
      break;
    case 'YTD':
      return { from: yearStart.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    case '1Y':
      start.setFullYear(now.getFullYear() - 1);
      break;
    case '5Y':
      start.setFullYear(now.getFullYear() - 5);
      break;
  }

  // Polygon wants YYYY-MM-DD
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export async function fetchPolygonAggs(
  symbol: string,
  range: Range,
  traceId?: string
): Promise<MarketPoint[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error('POLYGON_API_KEY missing');

  const { multiplier, timespan } = mapRange(range);
  const { from, to } = computeStartEnd(range);

  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
    `/range/${multiplier}/${timespan}/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=50000&apiKey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    headers: traceId ? { 'x-trace-id': traceId } : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polygon aggs failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const parsed = AggsResp.safeParse(json);
  if (!parsed.success) throw new Error('Polygon response shape invalid');

  const rows = parsed.data.results ?? [];
  return rows
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.c))
    .map((r) => ({ t: new Date(r.t).toISOString(), close: r.c }));
}
