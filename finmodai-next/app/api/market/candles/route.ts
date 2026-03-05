import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getHistoricalChart, type Candle as FmpCandle } from '@/lib/providers/fmp';
import {
  getCached,
  setCache,
  cacheKey,
  isFresh,
  chartTtl,
  type Freshness,
} from '@/lib/market/snapshotCache';

export const dynamic = 'force-dynamic';

const timeframeSchema = z.enum(['1D', '5D', '1W', '1M', '3M', '6M', '1Y', 'YTD', '5Y', 'MAX']);
type Timeframe = z.infer<typeof timeframeSchema>;

type OhlcvCandle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

type CandlesSuccess = {
  ok: true;
  symbol: string;
  timeframe: Timeframe;
  provider: string;
  freshness: Freshness;
  asOf: string;
  reason?: string;
  candles: OhlcvCandle[];
};

type CandlesError = {
  ok: false;
  error: {
    code: 'INVALID_INPUT' | 'NO_DATA' | 'LIVE_UNAVAILABLE';
    message: string;
    symbol?: string;
    timeframe?: Timeframe;
  };
};

function jsonResponse(payload: CandlesSuccess | CandlesError, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=600' },
  });
}

function fmpCandlesToOhlcv(candles: FmpCandle[]): OhlcvCandle[] {
  return candles
    .map((c) => {
      const t = new Date(c.date).getTime();
      if (!Number.isFinite(t) || !Number.isFinite(c.close)) return null;
      return {
        t,
        o: Number.isFinite(c.open) ? c.open : c.close,
        h: Number.isFinite(c.high) ? c.high : c.close,
        l: Number.isFinite(c.low) ? c.low : c.close,
        c: c.close,
        v: Number.isFinite(c.volume) ? c.volume : null,
      };
    })
    .filter((c): c is OhlcvCandle => c !== null)
    .sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------ */
/*  Demo fallback (only when ?provider=demo or DEMO_MODE=true)         */
/* ------------------------------------------------------------------ */

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchDemoCandles(symbol: string, timeframe: Timeframe): Promise<OhlcvCandle[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const tf = ['1D', '5D', '6M'].includes(timeframe) ? '1M' : timeframe;

  const { data, error } = await supabase
    .from('demo_market_candles')
    .select('t,date,open,high,low,close,volume')
    .eq('symbol', symbol)
    .eq('timeframe', tf)
    .order('t', { ascending: true });

  if (error || !Array.isArray(data)) return [];

  return data
    .map((row: any) => {
      const t =
        typeof row.t === 'number' ? row.t
        : typeof row.t === 'string' ? Number(row.t)
        : row.date ? new Date(row.date).getTime()
        : NaN;
      const c = Number(row.close);
      if (!Number.isFinite(t) || !Number.isFinite(c)) return null;
      return {
        t,
        o: Number.isFinite(Number(row.open)) ? Number(row.open) : c,
        h: Number.isFinite(Number(row.high)) ? Number(row.high) : c,
        l: Number.isFinite(Number(row.low)) ? Number(row.low) : c,
        c,
        v: Number.isFinite(Number(row.volume)) ? Number(row.volume) : null,
      };
    })
    .filter((c): c is OhlcvCandle => c !== null);
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') || 'SPY').trim().toUpperCase();
  const timeframeParam =
    request.nextUrl.searchParams.get('timeframe') ||
    request.nextUrl.searchParams.get('tf') ||
    request.nextUrl.searchParams.get('range') ||
    '1M';
  const timeframeResult = timeframeSchema.safeParse(timeframeParam.toUpperCase());

  if (!timeframeResult.success) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'timeframe must be one of: 1D,5D,1W,1M,3M,6M,1Y,YTD,5Y,MAX',
          symbol,
        },
      },
      400
    );
  }

  const timeframe = timeframeResult.data;

  const providerParam = request.nextUrl.searchParams.get('provider');
  const forceDemo = providerParam === 'demo';

  if (forceDemo) {
    const candles = await fetchDemoCandles(symbol, timeframe);
    if (candles.length < 2) {
      return jsonResponse({
        ok: false,
        error: { code: 'NO_DATA', message: 'No demo candles for this timeframe', symbol, timeframe },
      });
    }
    return jsonResponse({
      ok: true,
      symbol,
      timeframe,
      provider: 'demo',
      freshness: 'fresh',
      asOf: new Date().toISOString(),
      candles,
    });
  }

  const key = cacheKey('fmp', 'candles', `${symbol}:${timeframe}`);
  const ttl = chartTtl(timeframe);
  const cached = getCached<OhlcvCandle[]>(key);

  if (cached && isFresh(key)) {
    return jsonResponse({
      ok: true,
      symbol,
      timeframe,
      provider: 'fmp',
      freshness: 'fresh',
      asOf: cached.asOf,
      candles: cached.data,
    });
  }

  const result = await getHistoricalChart(symbol, timeframe);

  if (result.ok && result.data.length >= 2) {
    const candles = fmpCandlesToOhlcv(result.data);
    setCache(key, candles, ttl);
    return jsonResponse({
      ok: true,
      symbol,
      timeframe,
      provider: 'fmp',
      freshness: 'fresh',
      asOf: new Date().toISOString(),
      candles,
    });
  }

  if (cached) {
    return jsonResponse({
      ok: true,
      symbol,
      timeframe,
      provider: 'fmp',
      freshness: 'stale',
      asOf: cached.asOf,
      reason: result.ok ? 'insufficient_data' : result.error.message,
      candles: cached.data,
    });
  }

  return jsonResponse({
    ok: false,
    error: {
      code: 'LIVE_UNAVAILABLE',
      message: 'Live chart data temporarily unavailable',
      symbol,
      timeframe,
    },
  });
}
