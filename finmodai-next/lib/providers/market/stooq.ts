import { providerFailure } from '@/lib/providers/errors';
import { toErrorText } from '@/lib/providers/utils';
import type { MarketChartResult, MarketPoint } from '@/lib/providers/types';

export type StooqPoint = {
  t: string;
  close: number;
};

type Range = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | '5Y';

const rangeLimits: Record<Range, number> = {
  '1D': 3,
  '1W': 8,
  '1M': 35,
  '3M': 110,
  'YTD': 400, // YTD = year to date, use same limit as 1Y
  '1Y': 400,
  '5Y': 2000,
};

const toStooqSymbol = (symbol: string) => {
  const trimmed = symbol.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper === '^GSPC' || upper === 'SPX') return 'spx.us';
  if (upper.endsWith('.US')) return upper.toLowerCase();
  if (upper.includes('.')) return upper.toLowerCase();
  return `${upper.toLowerCase()}.us`;
};

export function filterByRange(points: StooqPoint[], range: Range) {
  // Handle YTD - filter to only include points from the start of the current year
  if (range === 'YTD') {
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(`${currentYear}-01-01T00:00:00Z`).getTime();
    return points.filter(p => {
      const pointTime = new Date(p.t).getTime();
      return pointTime >= yearStart;
    });
  }
  
  const limit = rangeLimits[range];
  if (!limit || points.length <= limit) return points;
  return points.slice(points.length - limit);
}

export async function fetchStooqDailyCSV(symbol: string, traceId: string, timeoutMs = 6000): Promise<StooqPoint[]> {
  const stooqSymbol = toStooqSymbol(symbol);
  if (!stooqSymbol) throw providerFailure('stooq', 'Missing symbol');

  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) {
      throw providerFailure('stooq', `HTTP ${res.status}`, res.status);
    }

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length <= 1) return [];

    const points: StooqPoint[] = [];
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const [date, , , , close] = line.split(',');
      if (!date || !close) continue;
      const closeValue = Number(close);
      if (!Number.isFinite(closeValue)) continue;
      const isoDate = new Date(`${date}T00:00:00Z`);
      if (Number.isNaN(isoDate.getTime())) continue;
      points.push({ t: isoDate.toISOString(), close: closeValue });
    }

    return points.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw providerFailure('stooq', 'Timeout');
    }
    if (error?.name === 'ProviderError') throw error;
    throw providerFailure('stooq', error?.message || `Failed to fetch Stooq data for ${symbol} (${traceId})`);
  } finally {
    clearTimeout(timeout);
  }
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
  try {
    const points = filterByRange(await fetchStooqDailyCSV(params.symbol, params.traceId), params.range).map((point) => ({
      t: point.t,
      close: point.close,
    }));
    if (!points.length) {
      return {
        status: 'error',
        source: 'Stooq',
        asOf: new Date().toISOString(),
        data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
        errors: ['Stooq returned no data'],
      };
    }
    return {
      status: 'ok',
      source: 'Stooq',
      asOf: points[points.length - 1]?.t ?? new Date().toISOString(),
      data: { symbol: params.symbol, range: params.range, points, changePct: computeChangePct(points) },
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'Stooq',
      asOf: new Date().toISOString(),
      data: { symbol: params.symbol, range: params.range, points: [], changePct: null },
      errors: [toErrorText(error)],
    };
  }
}
