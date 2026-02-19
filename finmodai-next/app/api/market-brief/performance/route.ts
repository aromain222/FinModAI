import { NextRequest, NextResponse } from 'next/server';
import { fetchDailySeries, assessDailySeriesQuality } from '@/lib/marketData/fetchDailySeries';

type MarketRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'MAX';

const RANGE_POINTS: Record<MarketRange, number> = {
  '1D': 2,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 260,
  'YTD': 260,
  'MAX': 2500,
};

function getWindowStart(range: MarketRange): Date {
  const now = new Date();
  const start = new Date(now);
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
    case '6M':
      start.setMonth(now.getMonth() - 6);
      break;
    case '1Y':
      start.setFullYear(now.getFullYear() - 1);
      break;
    case 'YTD':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'MAX':
      start.setFullYear(now.getFullYear() - 10);
      break;
  }
  return start;
}

type ChartPoint = {
  date: string;
  value: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

type DailyFetchPoint = {
  date: string;
  close: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
};

function buildChartPoints(points: DailyFetchPoint[], range: MarketRange): ChartPoint[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  const sorted = points
    .filter((point) => point && point.date && point.close !== null && Number.isFinite(point.close))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) return [];

  const start = getWindowStart(range).getTime();
  const end = Date.now();
  const inWindow = sorted.filter((point) => {
    const timestamp = new Date(point.date).getTime();
    return timestamp >= start && timestamp <= end;
  });
  const windowed = inWindow.length > 0 ? inWindow : sorted;

  return windowed.map((point, idx) => {
    const previousClose = idx > 0 ? windowed[idx - 1].close : point.close;
    const close = point.close as number;
    const open = point.open ?? previousClose ?? close;
    const high = point.high ?? Math.max(open, close);
    const low = point.low ?? Math.min(open, close);
    return {
      date: point.date,
      value: close,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(point.volume) ? (point.volume as number) : null,
    };
  });
}

function summarizeQuality(points: ChartPoint[], warnings: string[]) {
  const nonNull = points.filter((point) => point.value !== null);
  const repeatedPairs = nonNull.slice(1).filter((point, idx) => point.value === nonNull[idx].value).length;
  const repeatedValuePct = nonNull.length > 1 ? repeatedPairs / (nonNull.length - 1) : 0;

  let maxGapDays = 0;
  for (let i = 1; i < nonNull.length; i += 1) {
    const gapDays = Math.round((new Date(nonNull[i].date).getTime() - new Date(nonNull[i - 1].date).getTime()) / (1000 * 60 * 60 * 24));
    maxGapDays = Math.max(maxGapDays, gapDays);
  }

  const level = repeatedValuePct > 0.8 || maxGapDays > 7 ? 'low' : warnings.length > 0 ? 'medium' : 'high';
  return { level, repeatedValuePct, maxGapDays, warnings };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rangeParam = (searchParams.get('range') || '1M') as MarketRange | '1H';
    const allowed: MarketRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y', 'YTD', 'MAX'];
    const mappedRange = rangeParam === '1H' ? '1D' : rangeParam;
    const range: MarketRange = allowed.includes(mappedRange as MarketRange) ? (mappedRange as MarketRange) : '1M';
    const symbolParam = searchParams.get('symbol');
    const symbol = symbolParam ? symbolParam.trim().toUpperCase() : 'SPY';
    const start = getWindowStart(range).toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];
    const rangePoints = RANGE_POINTS[range] ?? 30;

    const sp500Fetch = await fetchDailySeries({
      symbol,
      rangePoints,
      start,
      end,
    });

    const chartPoints = buildChartPoints(sp500Fetch.points as DailyFetchPoint[], range);
    const quality = assessDailySeriesQuality(sp500Fetch.points, start, end);
    const warnings = [...sp500Fetch.warnings, ...quality.warnings];

    return NextResponse.json({
      points: chartPoints,
      source: sp500Fetch.provider ?? 'Unknown',
      asOf: chartPoints[chartPoints.length - 1]?.date ?? new Date().toISOString(),
      label: symbol === 'SPY' ? 'S&P 500 (proxy: SPY)' : `${symbol} Performance`,
      quality: summarizeQuality(chartPoints, warnings),
    });
  } catch (error: any) {
    console.error('[market-brief/performance] Error:', error);
    return NextResponse.json(
      { ok: false, code: 'performance_fetch_failed', stage: 'fetch', message: error?.message || 'Failed to fetch performance data' },
      { status: 500 }
    );
  }
}
