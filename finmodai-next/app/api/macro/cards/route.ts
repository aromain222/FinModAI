// app/api/macro/cards/route.ts
import { NextResponse } from 'next/server';
import { cached } from '@/lib/cache';
import { fetchFredLatestForCards } from '@/lib/providers/macro/fred';

export const runtime = 'nodejs';

const TTL_MS = 60_000;

export async function GET() {
  const traceId = crypto.randomUUID();

  const cacheKey = `macro:cards:v1`;

  try {
    const { value, stale } = await cached(cacheKey, TTL_MS, async () => {
      // Pick a simple, interpretable set that matches your UI buckets
      // Inflation: CPI (YoY computed client-side if you want later)
      // Growth: Industrial Production (proxy) OR real GDP (quarterly)
      // Labor: Unemployment rate
      // Rates: 10Y Treasury
      const [cpi, indpro, unrate, dgs10] = await Promise.all([
        fetchFredLatestForCards('CPIAUCSL', traceId), // CPI index
        fetchFredLatestForCards('INDPRO', traceId),   // Industrial Production index
        fetchFredLatestForCards('UNRATE', traceId),   // Unemployment rate %
        fetchFredLatestForCards('DGS10', traceId),    // 10Y yield %
      ]);

      const missing = [
        !process.env.FRED_API_KEY ? 'FRED_API_KEY missing' : null,
      ].filter(Boolean);

      return {
        ok: true,
        cards: {
          inflation: cpi ? { series: cpi.seriesId, date: cpi.date, value: cpi.value, unit: 'index' } : null,
          growth: indpro ? { series: indpro.seriesId, date: indpro.date, value: indpro.value, unit: 'index' } : null,
          labor: unrate ? { series: unrate.seriesId, date: unrate.date, value: unrate.value, unit: '%' } : null,
          rates: dgs10 ? { series: dgs10.seriesId, date: dgs10.date, value: dgs10.value, unit: '%' } : null,
        },
        meta: {
          traceId,
          missing,
        },
      };
    });

    return NextResponse.json({
      ...value,
      meta: {
        ...value.meta,
        source: 'fred',
        stale,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        cards: { inflation: null, growth: null, labor: null, rates: null },
        meta: {
          traceId,
          source: 'error',
          fetchedAt: new Date().toISOString(),
          error: String(e?.message || e),
        },
      },
      { status: 200 }
    );
  }
}
