import { NextRequest, NextResponse } from 'next/server';
import { getMarketIndices } from '@/lib/data/marketService';
import { MarketIndexSeriesSchema } from '@/lib/schemas/market';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get('symbols') || 'SPY,QQQ,DIA';
  const range = (searchParams.get('range') || '1M') as any;
  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  try {
    const timeBudgetMs = range === '1D' || range === '1W' ? 2500 : 4000;
    const { items, meta } = await getMarketIndices({ symbols, range, traceId, timeBudgetMs });
    const data = items.map((item) => MarketIndexSeriesSchema.parse(item));
    const elapsed = Date.now() - startTime;
    
    // Compute coverage
    const coverage = {
      tickersRequested: symbols.length,
      tickersReturned: data.length,
      percent: symbols.length > 0 ? Math.round((data.length / symbols.length) * 100) : 0,
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[market:indices] GET: ${symbols.length} requested, ${data.length} returned, ${elapsed}ms (${traceId})`);
    }

    return NextResponse.json({ 
      ok: true, 
      data, 
      meta: {
        ...meta,
        elapsed,
      },
      coverage,
      warnings: meta.warnings || [],
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[market:indices] GET error after ${elapsed}ms:`, error?.message);
    }
    return NextResponse.json(
      { 
        ok: false, 
        error: { code: 'PROVIDER_ERROR', message: error?.message || 'Failed to fetch indices' }, 
        meta: { traceId, elapsed },
        warnings: ['fetch_failed'],
      },
      { status: 502 }
    );
  }
}
