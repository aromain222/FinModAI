import { NextRequest } from 'next/server';
import { defaultProvider } from '@/lib/analytics/moveExplainer/providers/defaultProvider';
import { detectMoves } from '@/lib/analytics/moveExplainer/moveDetection';
import { enrichMovesWithBenchmark, getDefaultBenchmarkTicker } from '@/lib/analytics/moveExplainer/benchmark';
import { getCache, setCache } from '@/lib/cache/memory';
import { ok, badRequest, serverError } from '@/lib/api/respond';
import { logger } from '@/lib/api/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/stocks/moves?ticker=&start=&end=&interval=&topN=
 * Returns detected price moves
 */
export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker')?.trim().toUpperCase();
    const start = searchParams.get('start'); // ISO date
    const end = searchParams.get('end'); // ISO date
    const interval = searchParams.get('interval') || 'daily'; // daily | weekly
    const topN = Math.max(1, Math.min(20, Number(searchParams.get('topN') || 10)));
    const includeBenchmark = searchParams.get('includeBenchmark') !== 'false'; // Default true
    const benchmarkTickerParam = searchParams.get('benchmarkTicker');
    const benchmarkTicker = benchmarkTickerParam ? (benchmarkTickerParam as 'SPY' | 'QQQ') : undefined; // Auto-detect if not provided
    
    if (!ticker) {
      return badRequest({ error: 'ticker is required' }, { traceId });
    }
    
    if (!start || !end) {
      return badRequest({ error: 'start and end dates are required' }, { traceId });
    }
    
    if (interval !== 'daily' && interval !== 'weekly') {
      return badRequest({ error: 'interval must be daily or weekly' }, { traceId });
    }
    
    // Determine benchmark ticker (auto-detect if not provided)
    const selectedBenchmark = benchmarkTicker || getDefaultBenchmarkTicker(ticker);
    
    // Cache key (include benchmark if enabled)
    const cacheKey = `stocks:moves:${ticker}:${start}:${end}:${interval}:${topN}:${includeBenchmark ? selectedBenchmark : 'no-benchmark'}`;
    
    // Determine cache TTL
    const endDate = new Date(end);
    const startDate = new Date(start);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const isHistorical = daysDiff > 30;
    const ttlMs = isHistorical ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    
    const cached = getCache<{ moves: Array<{ date: string; returnPct: number; direction: 'up' | 'down'; rank: number; close: number; previousClose?: number; benchmarkReturnPct?: number; excessReturnPct?: number; moveClass?: string; benchmarkTicker?: string }> }>(cacheKey);
    if (cached && !cached.stale) {
      return ok({
        data: cached.value.moves,
        meta: {
          traceId,
          source: 'cache',
          fetchedAt: new Date().toISOString(),
        },
      });
    }
    
    // Fetch price series
    const bars = await defaultProvider.getPriceSeries({
      ticker,
      start,
      end,
      interval: interval as 'daily' | 'weekly',
      traceId,
    });
    
    if (bars.length < 2) {
      return ok({
        data: [],
        meta: {
          traceId,
          source: 'provider',
          fetchedAt: new Date().toISOString(),
          warning: 'insufficient_data',
        },
      });
    }
    
    // Detect moves
    let moves = detectMoves(bars, interval as 'daily' | 'weekly', topN);
    
    // Enrich with benchmark context if requested
    if (includeBenchmark) {
      moves = await enrichMovesWithBenchmark(moves, selectedBenchmark, interval as 'daily' | 'weekly', defaultProvider, traceId);
    }
    
    // Cache result
    setCache(cacheKey, { moves }, ttlMs);
    
    const elapsed = Date.now() - startedAt;
    logger.info({ traceId, ticker, movesCount: moves.length, elapsed }, 'stocks:moves');
    
    return ok({
      data: moves,
      meta: {
        traceId,
        source: 'provider',
        fetchedAt: new Date().toISOString(),
        elapsed,
      },
    });
  } catch (error: any) {
    logger.error({ traceId, error: error.message }, 'stocks:moves:error');
    return serverError({ error: 'Failed to detect moves' }, { traceId });
  }
}
