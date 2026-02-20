import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDemoTickerRows } from '@/lib/data/providers/demoProvider';
import { fetchDailySeries } from '@/lib/marketData/fetchDailySeries';
import { rangeToWindow, type MarketTimeframe } from '@/lib/marketData/stooqTimeframe';

export const dynamic = 'force-dynamic';

const timeframeSchema = z.enum(['1W', '1M', '3M', '1Y', 'YTD', '5Y', 'MAX']);

type StockMove = {
  ticker: string;
  returnPct: number;
  lastPrice?: number;
};

type MoversSuccess = {
  ok: true;
  range: MarketTimeframe;
  asOf: string;
  rising: StockMove[];
  falling: StockMove[];
  partialData?: { excludedTickers: number };
};

type MoversError = {
  ok: false;
  error: {
    code: 'INVALID_INPUT' | 'PROVIDER_ERROR';
    message: string;
  };
};

function toResponse(payload: MoversSuccess | MoversError, status = 200) {
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
    const tickers = rows.map((row) => row.ticker).slice(0, 50);
    const window = rangeToWindow(timeframe);

    const returns = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const series = await fetchDailySeries({
            symbol: ticker,
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
            ticker,
            returnPct,
            lastPrice: lastClose,
          } satisfies StockMove;
        } catch {
          return null;
        }
      })
    );

    const valid = returns.filter((item) => item != null) as StockMove[];
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
    const rising = valid
      .filter((item) => item.returnPct > 0)
      .sort((a, b) => b.returnPct - a.returnPct)
      .slice(0, 10);
    const falling = valid
      .filter((item) => item.returnPct < 0)
      .sort((a, b) => a.returnPct - b.returnPct)
      .slice(0, 10);

    return toResponse({
      ok: true,
      range: timeframe,
      asOf: window.toIso,
      rising,
      falling,
      partialData: {
        excludedTickers: tickers.length - valid.length,
      },
    });
  } catch (error) {
    return toResponse(
      {
        ok: false,
        error: {
          code: 'PROVIDER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to compute movers',
        },
      },
      500
    );
  }
}
