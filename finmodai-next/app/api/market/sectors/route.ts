import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDemoTickerRows } from '@/lib/data/providers/demoProvider';
import { fetchDailySeries } from '@/lib/marketData/fetchDailySeries';
import { rangeToWindow, type MarketTimeframe } from '@/lib/marketData/stooqTimeframe';

export const dynamic = 'force-dynamic';

const timeframeSchema = z.enum(['1W', '1M', '3M', '1Y', 'YTD', '5Y', 'MAX']);

type SectorRow = {
  sector: string;
  ticker: string;
  returnPct: number;
};

type SectorsSuccess = {
  ok: true;
  period: MarketTimeframe;
  rising: SectorRow[];
  falling: SectorRow[];
  partialData?: { excludedTickers: number };
};

type SectorsError = {
  ok: false;
  error: {
    code: 'INVALID_INPUT' | 'PROVIDER_ERROR';
    message: string;
  };
};

function toResponse(payload: SectorsSuccess | SectorsError, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=3600',
    },
  });
}

export async function GET(req: NextRequest) {
  const timeframeRaw = req.nextUrl.searchParams.get('tf') || req.nextUrl.searchParams.get('range') || '1M';
  const timeframeResult = timeframeSchema.safeParse(timeframeRaw.toUpperCase());
  if (!timeframeResult.success) {
    return toResponse(
      {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'tf/range must be one of: 1W,1M,3M,1Y,YTD,5Y,MAX',
        },
      },
      400
    );
  }

  const timeframe = timeframeResult.data;

  try {
    const rows = await getDemoTickerRows();
    const universe = rows
      .filter((row) => row.sector && row.sector.trim().length > 0)
      .slice(0, 80);

    const window = rangeToWindow(timeframe);

    const tickerReturns = await Promise.all(
      universe.map(async (row) => {
        try {
          const series = await fetchDailySeries({
            symbol: row.ticker,
            rangePoints: window.sliceCount,
            start: window.fromIso,
            end: window.toIso,
          });
          const candles = series.points
            .map((point) => ({ t: new Date(point.date).getTime(), c: Number(point.close) }))
            .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.c));

          if (candles.length < Math.max(2, window.minPoints) || !series.ok) return null;
          const firstClose = candles[0]?.c;
          const lastClose = candles[candles.length - 1]?.c;
          if (!Number.isFinite(firstClose) || firstClose <= 0 || !Number.isFinite(lastClose)) return null;

          const returnPct = ((lastClose - firstClose) / firstClose) * 100;
          if (!Number.isFinite(returnPct)) return null;

          return {
            ticker: row.ticker,
            sector: row.sector as string,
            returnPct,
          };
        } catch {
          return null;
        }
      })
    );

    const valid = tickerReturns.filter(
      (item): item is { ticker: string; sector: string; returnPct: number } => item !== null
    );
    if (valid.length === 0) {
      return toResponse(
        {
          ok: false,
          error: {
            code: 'PROVIDER_ERROR',
            message: 'Temporarily unavailable',
          },
        },
        200
      );
    }

    const grouped = new Map<string, { sum: number; count: number; ticker: string }>();
    for (const item of valid) {
      const current = grouped.get(item.sector);
      if (!current) {
        grouped.set(item.sector, { sum: item.returnPct, count: 1, ticker: item.ticker });
      } else {
        grouped.set(item.sector, {
          sum: current.sum + item.returnPct,
          count: current.count + 1,
          ticker: current.ticker,
        });
      }
    }

    const sectorRows: SectorRow[] = Array.from(grouped.entries()).map(([sector, acc]) => ({
      sector,
      ticker: acc.ticker,
      returnPct: acc.sum / Math.max(acc.count, 1),
    }));

    const rising = sectorRows
      .filter((item) => item.returnPct > 0)
      .sort((a, b) => b.returnPct - a.returnPct)
      .slice(0, 10);
    const falling = sectorRows
      .filter((item) => item.returnPct < 0)
      .sort((a, b) => a.returnPct - b.returnPct)
      .slice(0, 10);

    return toResponse({
      ok: true,
      period: timeframe,
      rising,
      falling,
      partialData: {
        excludedTickers: universe.length - valid.length,
      },
    });
  } catch (error) {
    return toResponse(
      {
        ok: false,
        error: {
          code: 'PROVIDER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to compute sectors',
        },
      },
      500
    );
  }
}
