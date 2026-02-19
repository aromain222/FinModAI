import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getMacroSnapshot } from '@/lib/macroData';
import { marketSnapshotSchema } from '@/lib/chat/schemas';

export const dynamic = 'force-dynamic';

const stockMoveSchema = z.object({
  ticker: z.string(),
  returnPct: z.number(),
  lastPrice: z.number().optional(),
});

const stockBreadthSchema = z.object({
  rising: z.array(stockMoveSchema),
  falling: z.array(stockMoveSchema),
});

const performancePointSchema = z.object({
  value: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
});

const performancePayloadSchema = z.object({
  points: z.array(performancePointSchema),
});

type SnapshotSeries = Record<string, { points?: Array<{ value: number | null }> } | undefined>;

type DemoFallbackPayload = {
  candles: Array<Record<string, unknown>>;
  breadth: Record<string, unknown>;
  movers: { gainers: Array<Record<string, unknown>>; losers: Array<Record<string, unknown>> };
  sectors: { rising: Array<Record<string, unknown>>; falling: Array<Record<string, unknown>> };
  ratesFx: Record<string, unknown>;
  vol: Record<string, unknown>;
  provider: 'demo-fallback';
};

type DemoSnapshotRow = {
  as_of?: string | null;
  payload?: Record<string, unknown> | null;
};

type DemoCandleRow = {
  t?: string | number | null;
  date?: string | null;
  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
  volume?: number | string | null;
};

function latestFinite(points: Array<{ value: number | null } | undefined> | undefined): number | null {
  if (!points?.length) return null;
  for (let idx = points.length - 1; idx >= 0; idx -= 1) {
    const value = points[idx]?.value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function latestFiniteFromSeries(series: SnapshotSeries, keys: string[]): number | null {
  for (const key of keys) {
    const points = Array.isArray(series?.[key]?.points) ? series[key]?.points ?? [] : [];
    const value = latestFinite(points);
    if (value !== null) return value;
  }
  return null;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function demoFallback(): DemoFallbackPayload {
  return {
    candles: [],
    breadth: {},
    movers: { gainers: [], losers: [] },
    sectors: { rising: [], falling: [] },
    ratesFx: {},
    vol: {},
    provider: 'demo-fallback',
  };
}

function normalizeDemoCandles(rows: DemoCandleRow[] | null): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const timestamp =
        typeof row.t === 'number'
          ? row.t
          : typeof row.t === 'string'
            ? Number(row.t)
            : row.date
              ? new Date(row.date).getTime()
              : NaN;
      const open = row.open == null ? null : Number(row.open);
      const high = row.high == null ? null : Number(row.high);
      const low = row.low == null ? null : Number(row.low);
      const close = row.close == null ? null : Number(row.close);
      const volume = row.volume == null ? null : Number(row.volume);

      if (!Number.isFinite(timestamp) || !Number.isFinite(close)) return null;

      return {
        t: timestamp,
        o: Number.isFinite(open) ? open : close,
        h: Number.isFinite(high) ? high : close,
        l: Number.isFinite(low) ? low : close,
        c: close,
        v: Number.isFinite(volume) ? volume : null,
      };
    })
    .filter((item): item is Record<string, unknown> => item !== null);
}

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.DEMO_MODE === 'true';

  if (isDemoMode) {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        return NextResponse.json(demoFallback(), { status: 200 });
      }

      const timeframe =
        req.nextUrl.searchParams.get('timeframe') ||
        req.nextUrl.searchParams.get('tf') ||
        req.nextUrl.searchParams.get('range') ||
        '1M';

      const [candlesRes, snapshotRes] = await Promise.all([
        supabase
          .from('demo_market_candles')
          .select('t,date,open,high,low,close,volume')
          .eq('symbol', 'SPY')
          .eq('timeframe', timeframe)
          .order('t', { ascending: true }),
        supabase
          .from('demo_market_snapshot')
          .select('as_of,payload')
          .order('as_of', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (candlesRes.error || snapshotRes.error) {
        return NextResponse.json(demoFallback(), { status: 200 });
      }

      const candles = normalizeDemoCandles((candlesRes.data as DemoCandleRow[] | null) ?? null);
      const snapshotRow = (snapshotRes.data as DemoSnapshotRow | null) ?? null;
      const snapshotPayload = snapshotRow?.payload ?? null;

      if (!snapshotPayload || typeof snapshotPayload !== 'object') {
        return NextResponse.json(demoFallback(), { status: 200 });
      }

      return NextResponse.json(
        {
          candles: candles || [],
          ...snapshotPayload,
          provider: 'demo',
        },
        { status: 200 }
      );
    } catch {
      return NextResponse.json(demoFallback(), { status: 200 });
    }
  }

  try {
    const origin = req.nextUrl.origin;
    const warnings: string[] = [];

    const [macroSnapshot, stocksRes, performanceRes] = await Promise.all([
      getMacroSnapshot('1M'),
      fetch(`${origin}/api/market-brief/stocks?period=1D`, { cache: 'no-store' }),
      fetch(`${origin}/api/market-brief/performance?range=1D&symbol=SPY`, { cache: 'no-store' }),
    ]);

    const stocksPayload = stocksRes.ok ? stockBreadthSchema.safeParse(await stocksRes.json()) : null;
    const performancePayload = performanceRes.ok
      ? performancePayloadSchema.safeParse(await performanceRes.json())
      : null;
    if (!stocksRes.ok) warnings.push('movers_unavailable');
    if (!performanceRes.ok) warnings.push('performance_unavailable');
    if (stocksPayload && !stocksPayload.success) warnings.push('movers_parse_unavailable');
    if (performancePayload && !performancePayload.success) warnings.push('performance_parse_unavailable');

    const movers = [
      ...(stocksPayload?.success ? stocksPayload.data.rising : []),
      ...(stocksPayload?.success ? stocksPayload.data.falling : []),
    ]
      .sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct))
      .slice(0, 8)
      .map((move) => ({
        ticker: move.ticker,
        price: move.lastPrice ?? 0,
        changePct: move.returnPct,
      }));

    const sectors = [
      ...(macroSnapshot.sectorBreadth?.rising ?? []).slice(0, 4),
      ...(macroSnapshot.sectorBreadth?.falling ?? []).slice(0, 4),
    ].map((sector) => ({
      name: sector.name,
      changePct: sector.returnPct,
    }));

    const perfPoints = performancePayload?.success ? performancePayload.data.points : [];
    const latestPoint = perfPoints[perfPoints.length - 1];

    const spyPrice = macroSnapshot.metrics.sp500_level ?? latestFiniteFromSeries(macroSnapshot.series, ['sp500']) ?? 0;
    const spyChangePct = macroSnapshot.metrics.sp500_pct ?? 0;
    const spyDayHigh = typeof latestPoint?.high === 'number' ? latestPoint.high : spyPrice;
    const spyDayLow = typeof latestPoint?.low === 'number' ? latestPoint.low : spyPrice;

    const payload = marketSnapshotSchema.parse({
      asOf: macroSnapshot.asOf,
      spy: {
        price: spyPrice,
        changePct: spyChangePct,
        dayHigh: spyDayHigh,
        dayLow: spyDayLow,
      },
      vix: {
        value: macroSnapshot.metrics.vix_level ?? latestFiniteFromSeries(macroSnapshot.series, ['vix']) ?? 0,
        changePct: macroSnapshot.metrics.vix_pct ?? 0,
      },
      rates: {
        us2y: latestFiniteFromSeries(macroSnapshot.series, ['treasury2y', 'us2y']) ?? 0,
        us10y: macroSnapshot.metrics.tenY_level ?? latestFiniteFromSeries(macroSnapshot.series, ['treasury10y']) ?? 0,
      },
      fx: {
        dxy: latestFiniteFromSeries(macroSnapshot.series, ['dxy']) ?? 0,
      },
      commodities: {
        wti: latestFiniteFromSeries(macroSnapshot.series, ['wti', 'oil']) ?? 0,
        gold: latestFiniteFromSeries(macroSnapshot.series, ['gold']) ?? 0,
      },
      topMovers: movers,
      sectors,
    });

    return NextResponse.json({ ...payload, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build market snapshot.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
