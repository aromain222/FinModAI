import { NextRequest, NextResponse } from 'next/server';
import { fetchDailySeries, type SeriesQuality } from '@/lib/marketData/fetchDailySeries';
import { getDemoTickers } from '@/lib/data/providers/demoProvider';

type TimeRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'MAX';

export type StockMove = {
  ticker: string;
  name?: string;
  returnPct: number;
  lastPrice?: number;
  sparkline?: number[];
  asOf: string;
  provider: string;
  quality?: { level: 'high' | 'medium' | 'low'; warnings?: string[] };
};

export type StockBreadth = {
  range: TimeRange;
  asOf: string;
  rising: StockMove[];
  falling: StockMove[];
  warnings?: string[];
};

const MAX_WATCHLIST = 50;

function getPeriodDates(period: TimeRange): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  switch (period) {
    case '1D':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '1W':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '1M':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '3M':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '6M':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '1Y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case 'MAX':
      startDate.setFullYear(startDate.getFullYear() - 10);
      break;
    case 'YTD':
      startDate.setMonth(0, 1);
      break;
  }
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

function countTradingDaysBetween(start: Date, end: Date): number {
  if (start > end) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function qualityLevel(quality: SeriesQuality, warnings: string[]): 'high' | 'medium' | 'low' {
  const repeatedValuePct = quality?.repeatedValuePct ?? 0;
  const maxGapDays = quality?.maxGapDays ?? 0;
  const missingPct = quality?.missingPct ?? 0;
  if (repeatedValuePct > 0.8 || maxGapDays > 7 || missingPct > 0.2) return 'low';
  if (warnings.length > 0) return 'medium';
  return 'high';
}

export async function GET(req: NextRequest) {
  const rangeParam = (req.nextUrl.searchParams.get('period') ||
    req.nextUrl.searchParams.get('range') ||
    '1M') as TimeRange;
  const range: TimeRange = ['1D','1W','1M','3M','6M','1Y','YTD','MAX'].includes(rangeParam)
    ? rangeParam
    : '1M';

  const { startDate, endDate } = getPeriodDates(range);
  const startIso = startDate.toISOString().split('T')[0];
  const endIso = endDate.toISOString().split('T')[0];
  const rangePoints = Math.max(5, countTradingDaysBetween(startDate, endDate));

  const warnings: string[] = [];
  let watchlist: string[] = [];

  try {
    watchlist = (await getDemoTickers()).slice(0, MAX_WATCHLIST);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load demo tickers.';
    warnings.push(message);
  }

  if (watchlist.length === 0) {
    return NextResponse.json(
      {
        range,
        asOf: endIso,
        rising: [],
        falling: [],
        warnings: warnings.length > 0 ? warnings : ['No demo tickers found in demo_company_snapshots.'],
      } satisfies StockBreadth,
      { status: 200 }
    );
  }

  const moves = await Promise.all(
    watchlist.map(async (ticker) => {
      try {
        const fetch = await fetchDailySeries({
          symbol: ticker,
          rangePoints,
          start: startIso,
          end: endIso,
        });
        if (!fetch.points || fetch.points.length < 3) return null;
        const inWindow = fetch.points.filter((p) => p.date >= startIso && p.date <= endIso);
        if (inWindow.length < 2) return null;
        const startPoint = inWindow[0];
        const endPoint = inWindow[inWindow.length - 1];
        const startClose = startPoint?.close ?? null;
        const endClose = endPoint?.close ?? null;
        if (!startClose || !endClose || startClose <= 0 || endClose <= 0) return null;
        const returnPct = ((endClose / startClose) - 1) * 100;
        if (!Number.isFinite(returnPct) || Math.abs(returnPct) > 100) return null;
        const qualityWarnings = [...(fetch.warnings || []), ...((fetch.quality as any)?.warnings || [])];
        const sparkline = fetch.points
          .slice(-12)
          .map((p) => (typeof p.close === 'number' && isFinite(p.close) ? p.close : null))
          .filter((v): v is number => v !== null);
        return {
          ticker,
          returnPct,
          lastPrice: endClose,
          sparkline,
          asOf: endPoint.date,
          provider: fetch.provider,
          quality: {
            level: qualityLevel(fetch.quality, qualityWarnings),
            warnings: qualityWarnings,
          },
        } as StockMove;
      } catch (err) {
        return null;
      }
    })
  );

  const filtered = moves.filter((m): m is StockMove => Boolean(m));
  const rising = filtered.filter((m) => m.returnPct > 0).sort((a, b) => b.returnPct - a.returnPct).slice(0, 10);
  const falling = filtered.filter((m) => m.returnPct < 0).sort((a, b) => a.returnPct - b.returnPct).slice(0, 10);

  if (filtered.length < 5) warnings.push('Limited stock breadth: insufficient market data returned by providers.');
  if (rising.length === 0) warnings.push('No stocks with positive returns in this window.');
  if (falling.length === 0) warnings.push('No stocks with negative returns in this window.');

  const payload: StockBreadth = {
    range,
    asOf: endIso,
    rising,
    falling,
    warnings,
  };

  return NextResponse.json(payload, { status: 200 });
}
