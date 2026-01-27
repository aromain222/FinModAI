import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMarketSeries } from '@/lib/market/provider';
import { DEFAULT_FEATURED_TICKERS } from '@/lib/market/watchlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  tickers: z.string().optional(), // Comma-separated list
  range: z.enum(['1D', '1W', '1M', '3M', '6M', '1Y', '5Y']).optional().default('1M'),
});

const TIME_BUDGET_MS = 4000; // 4 seconds max

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;
  
  const parsed = QuerySchema.safeParse({
    tickers: searchParams.get('tickers') ?? undefined,
    range: searchParams.get('range') ?? undefined,
  });
  
  const { tickers: tickersParam, range } = parsed.success ? parsed.data : { tickers: undefined, range: '1M' as const };
  
  // Parse tickers from query param or use default
  const tickers = tickersParam
    ? tickersParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_FEATURED_TICKERS;
  
  const results: Array<{
    ticker: string;
    returnPct: number | null;
    lastPrice: number | null;
    source: string;
  }> = [];

  const warnings: string[] = [];

  // Fetch all tickers in parallel with timeout
  const fetchPromises = tickers.map(async (ticker) => {
    try {
      const series = await getMarketSeries({ ticker, range, traceId });
      const returnPct = series.stats?.pctChange ?? null;
      const lastPrice = series.points.length > 0 ? series.points[series.points.length - 1]?.close ?? null : null;
      
      return {
        ticker,
        returnPct: returnPct !== null && Number.isFinite(returnPct) ? returnPct : null,
        lastPrice: lastPrice !== null && Number.isFinite(lastPrice) ? lastPrice : null,
        source: series.source || 'fallback',
      };
    } catch (error: any) {
      warnings.push(`${ticker}_failed:${error.message || 'unknown'}`);
      return {
        ticker,
        returnPct: null,
        lastPrice: null,
        source: 'fallback',
      };
    }
  });

  // Wait for all or timeout
  const deadline = new Promise<void>((resolve) => {
    setTimeout(() => resolve(), TIME_BUDGET_MS);
  });

  const settled = await Promise.allSettled(fetchPromises);
  await Promise.race([Promise.resolve(), deadline]);

  // Collect successful results
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    }
  }

  // Determine source (use most common source, or 'mixed')
  const sources = results.map((r) => r.source).filter((s) => s && s !== 'fallback');
  const sourceCounts: Record<string, number> = {};
  sources.forEach((s) => {
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  });
  const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const source = topSource || (sources.length > 1 ? 'mixed' : sources[0] || 'fallback');

  // Sort by returnPct (descending), nulls last
  const sortedResults = results.sort((a, b) => {
    if (a.returnPct === null && b.returnPct === null) return 0;
    if (a.returnPct === null) return 1;
    if (b.returnPct === null) return -1;
    return b.returnPct - a.returnPct;
  });

  return NextResponse.json({
    ok: sortedResults.length > 0,
    range,
    tickers: sortedResults,
    source,
    warnings: Array.from(new Set(warnings)),
    coverage: `${sortedResults.filter((r) => r.returnPct !== null).length}/${tickers.length} computed`,
    meta: {
      traceId,
      elapsedMs: Date.now() - startTime,
      requestedCount: tickers.length,
      returnedCount: sortedResults.length,
    },
  });
}
