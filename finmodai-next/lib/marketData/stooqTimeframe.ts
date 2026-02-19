export type MarketTimeframe = '1W' | '1M' | '3M' | '1Y' | 'YTD' | '5Y' | 'MAX';

export const TIMEFRAME_ROW_COUNT: Record<MarketTimeframe, number> = {
  '1W': 10,
  '1M': 22,
  '3M': 66,
  'YTD': 252,
  '1Y': 252,
  '5Y': 1260,
  'MAX': Number.MAX_SAFE_INTEGER,
};

export const TIMEFRAME_MIN_POINTS: Record<MarketTimeframe, number> = {
  '1W': 6,
  '1M': 12,
  '3M': 24,
  'YTD': 40,
  '1Y': 80,
  '5Y': 220,
  'MAX': 120,
};

export function rangeToWindow(range: MarketTimeframe): {
  range: MarketTimeframe;
  fromIso: string;
  toIso: string;
  lookbackDays: number;
  minPoints: number;
  sliceCount: number;
} {
  const now = new Date();
  const toIso = now.toISOString().slice(0, 10);
  const lookbackDays =
    range === '1W' ? 7 :
    range === '1M' ? 30 :
    range === '3M' ? 90 :
    range === '1Y' ? 365 :
    range === '5Y' ? 1825 :
    range === 'YTD' ? Math.max(1, Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (24 * 60 * 60 * 1000))) :
    3650;

  const from =
    range === 'YTD'
      ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
      : new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return {
    range,
    fromIso: from.toISOString().slice(0, 10),
    toIso,
    lookbackDays,
    minPoints: TIMEFRAME_MIN_POINTS[range],
    sliceCount: TIMEFRAME_ROW_COUNT[range],
  };
}

export function timeframeFetchStart(timeframe: MarketTimeframe): string {
  return rangeToWindow(timeframe).fromIso;
}

export function sliceRowsByTimeframe<T>(rows: T[], timeframe: MarketTimeframe): T[] {
  const count = TIMEFRAME_ROW_COUNT[timeframe];
  if (!Number.isFinite(count) || count >= rows.length) return rows;
  return rows.slice(-count);
}
