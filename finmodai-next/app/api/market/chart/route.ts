// app/api/market/chart/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cached } from '@/lib/cache';
import { fetchStooqDailyCSV, filterByRange } from '@/lib/providers/market/stooq';
import { fetchPolygonAggs } from '@/lib/providers/market/polygon';
import { fetchTiingoDaily } from '@/lib/providers/market/tiingo';

export const runtime = 'nodejs';

const RangeSchema = z.enum(['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y']);
type Range = z.infer<typeof RangeSchema>;

const QuerySchema = z.object({
  symbol: z.string().optional().default('SPY'),
  range: RangeSchema.optional().default('1Y'),
});

const ttlByRange: Record<Range, number> = {
  '1D': 60 * 1000,
  '1W': 60 * 1000,
  '1M': 3 * 60 * 1000,
  '3M': 10 * 60 * 1000,
  'YTD': 10 * 60 * 1000,
  '1Y': 20 * 60 * 1000,
  '5Y': 60 * 60 * 1000,
};

type CanonicalPoint = { t: string; close: number };

function toCanonical(points: any[]): CanonicalPoint[] {
  return points
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      t: String(p.t ?? p.date ?? p.time ?? ''),
      close: Number(p.close ?? p.c ?? p.value ?? p.v ?? p.price ?? p.adjClose),
    }))
    .filter((p) => p.t && Number.isFinite(p.close) && !Number.isNaN(new Date(p.t).getTime()))
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
}

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const sp = request.nextUrl.searchParams;

  const parsed = QuerySchema.safeParse({
    symbol: sp.get('symbol') ?? undefined,
    range: sp.get('range') ?? undefined,
  });

  const fallbackParams = { symbol: 'SPY', range: '1Y' as Range };
  const { symbol, range } = parsed.success ? parsed.data : fallbackParams;

  const normalizedSymbol = symbol.trim() ? symbol.trim().toUpperCase() : 'SPY';
  const ttlMs = ttlByRange[range] ?? ttlByRange['1Y'];
  const cacheKey = `market-chart:${normalizedSymbol}:${range}`;

  try {
    const { value, stale } = await cached(cacheKey, ttlMs, async () => {
      // 1) Polygon (best for most tickers + ranges)
      try {
        const poly = await fetchPolygonAggs(normalizedSymbol, range, traceId);
        const pts = toCanonical(poly);
        if (pts.length >= 2) {
          return { points: pts, source: 'polygon' as const };
        }
      } catch (e) {
        // fall through
      }

      // 2) Tiingo (good backup)
      try {
        const tii = await fetchTiingoDaily(normalizedSymbol, range, traceId);
        const pts = toCanonical(tii);
        if (pts.length >= 2) {
          return { points: pts, source: 'tiingo' as const };
        }
      } catch (e) {
        // fall through
      }

      // 3) Stooq (last resort)
      const stooqPoints = await fetchStooqDailyCSV(normalizedSymbol, traceId);
      const filtered = filterByRange(stooqPoints, range);
      const pts = toCanonical(filtered);
      return { points: pts, source: 'stooq' as const };
    });

    return NextResponse.json({
      ok: true,
      data: { symbol: normalizedSymbol, range, points: value.points },
      meta: {
        source: value.source,
        stale,
        fetchedAt: new Date().toISOString(),
        traceId,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        data: { symbol: normalizedSymbol, range, points: [] },
        meta: {
          source: 'error',
          stale: true,
          fetchedAt: new Date().toISOString(),
          traceId,
          error: String(error?.message ?? error),
        },
      },
      { status: 200 } // keep UI from hard-failing
    );
  }
}
