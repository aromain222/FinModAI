import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { fetchDailySeries } from '@/lib/marketData/fetchDailySeries';
import { rangeToWindow, type MarketTimeframe } from '@/lib/marketData/stooqTimeframe';

export const dynamic = 'force-dynamic';

const timeframeSchema = z.enum(['1W', '1M', '3M', '1Y', 'YTD', '5Y', 'MAX']);

const candleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullable().optional(),
});

type Candle = z.infer<typeof candleSchema>;

type CandlesSuccess = {
  ok: true;
  symbol: string;
  timeframe: MarketTimeframe;
  provider: string;
  source: 'cache' | 'live' | 'none';
  candles: Candle[];
};

type CandlesError = {
  ok: false;
  error: {
    code: 'INVALID_INPUT' | 'NO_DATA' | 'INSUFFICIENT_DATA' | 'PROVIDER_ERROR';
    message: string;
    symbol?: string;
    timeframe?: MarketTimeframe;
  };
};

type DemoRawRow = Record<string, unknown>;

const DEMO_FALLBACKS: Record<MarketTimeframe, MarketTimeframe[]> = {
  '1W': [],
  '1M': ['3M'],
  '3M': ['1Y'],
  '1Y': ['MAX'],
  'YTD': ['1Y', 'MAX'],
  '5Y': ['MAX'],
  'MAX': [],
};

function jsonWithCache(payload: CandlesSuccess | CandlesError, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=3600',
    },
  });
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber > 1e12 ? asNumber : asNumber * 1000;
    const asDate = new Date(value).getTime();
    return Number.isFinite(asDate) ? asDate : null;
  }
  return null;
}

function mapDemoRowToCandle(row: DemoRawRow): Candle | null {
  const t = parseTimestampMs(row.t ?? row.timestamp ?? row.ts ?? row.date ?? row.datetime);
  const close = parseNumber(row.c ?? row.close);
  const open = parseNumber(row.o ?? row.open) ?? close;
  const high = parseNumber(row.h ?? row.high) ?? close;
  const low = parseNumber(row.l ?? row.low) ?? close;
  const volume = parseNumber(row.v ?? row.volume);

  if (t === null || close === null || open === null || high === null || low === null) return null;
  return {
    t,
    o: open,
    h: high,
    l: low,
    c: close,
    v: volume,
  };
}

async function fetchDemoRows(
  symbol: string,
  timeframe: MarketTimeframe
): Promise<{ rows: DemoRawRow[]; usedTimeframe: MarketTimeframe; errorMessage?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { rows: [], usedTimeframe: timeframe, errorMessage: 'Supabase service client not configured' };
  }

  const candidates = [timeframe, ...(DEMO_FALLBACKS[timeframe] ?? [])];
  let lastErrorMessage = '';

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('demo_market_candles')
      .select('*')
      .eq('symbol', symbol)
      .eq('timeframe', candidate)
      .order('t', { ascending: true });

    if (error) {
      lastErrorMessage = error.message;
      continue;
    }

    const rows = Array.isArray(data)
      ? data.filter((row): row is DemoRawRow => Boolean(row && typeof row === 'object'))
      : [];

    if (rows.length > 0) {
      return { rows, usedTimeframe: candidate };
    }
  }

  return {
    rows: [],
    usedTimeframe: timeframe,
    errorMessage: lastErrorMessage || undefined,
  };
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') || 'SPY').trim().toUpperCase();
  const timeframeParam =
    request.nextUrl.searchParams.get('timeframe') || request.nextUrl.searchParams.get('tf') || '1M';
  const timeframeResult = timeframeSchema.safeParse(timeframeParam.toUpperCase());

  if (!timeframeResult.success) {
    return jsonWithCache(
      {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'timeframe must be one of: 1W,1M,3M,1Y,YTD,5Y,MAX',
          symbol,
        },
      },
      400
    );
  }

  const timeframe = timeframeResult.data;
  const isDemoMode = process.env.DEMO_MODE === 'true';

  if (isDemoMode) {
    const demoResult = await fetchDemoRows(symbol, timeframe);
    const candles = demoResult.rows
      .map(mapDemoRowToCandle)
      .filter((item): item is Candle => item !== null)
      .sort((a, b) => a.t - b.t);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[api/market/candles][demo]', {
        symbol,
        timeframe,
        rowsReturned: demoResult.rows.length,
        candlesValid: candles.length,
        usedTimeframe: demoResult.usedTimeframe,
        note:
          demoResult.usedTimeframe !== timeframe
            ? `fallback timeframe used: ${demoResult.usedTimeframe}`
            : undefined,
      });
    }

    if (candles.length < 2) {
      return jsonWithCache(
        {
          ok: false,
          error: {
            code: candles.length === 0 ? 'NO_DATA' : 'INSUFFICIENT_DATA',
            message:
              demoResult.errorMessage && candles.length === 0
                ? `Demo query failed: ${demoResult.errorMessage}`
                : candles.length === 0
                  ? 'No demo candles available for requested timeframe'
                  : 'Insufficient demo candles for requested timeframe',
            symbol,
            timeframe,
          },
        },
        200
      );
    }

    return jsonWithCache({
      ok: true,
      symbol,
      timeframe,
      provider: 'demo',
      source: 'cache',
      candles,
    });
  }

  const window = rangeToWindow(timeframe);

  try {
    const series = await fetchDailySeries({
      symbol,
      rangePoints: window.sliceCount,
      start: window.fromIso,
      end: window.toIso,
    });

    const candles: Candle[] = series.points
      .map((point) => {
        const t = new Date(point.date).getTime();
        const c = Number(point.close);
        if (!Number.isFinite(t) || !Number.isFinite(c)) return null;
        return { t, o: c, h: c, l: c, c, v: null } satisfies Candle;
      })
      .filter((item): item is Candle => item !== null);

    if (candles.length < 2 || !series.ok) {
      return jsonWithCache(
        {
          ok: false,
          error: {
            code: candles.length === 0 ? 'NO_DATA' : 'INSUFFICIENT_DATA',
            message:
              candles.length === 0
                ? 'No data returned for selected range'
                : `Insufficient candles for timeframe (need >= ${Math.max(2, window.minPoints)})`,
            symbol,
            timeframe,
          },
        },
        200
      );
    }

    return jsonWithCache({
      ok: true,
      symbol,
      timeframe,
      provider: series.provider,
      source: series.source,
      candles,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[api/market/candles] provider error', {
        symbol,
        timeframe,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return jsonWithCache(
      {
        ok: false,
        error: {
          code: 'PROVIDER_ERROR',
          message: 'Failed to fetch candles from Stooq',
          symbol,
          timeframe,
        },
      },
      500
    );
  }
}
