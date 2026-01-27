import { NextRequest } from 'next/server';
import { explainStockMoves } from '@/lib/analytics/moveExplainer';
import { getCache, setCache } from '@/lib/cache/memory';
import { ok, badRequest, serverError } from '@/lib/api/respond';
import { logger } from '@/lib/api/logger';
import { getDefaultBenchmarkTicker } from '@/lib/analytics/moveExplainer/benchmark';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/stocks/catalysts?ticker=&start=&end=&interval=&topN=&includeBenchmark=&benchmarkTicker=&includeAI=
 * Returns moves with catalysts and optional AI explanations
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
    const includeAI = searchParams.get('includeAI') === 'true';
    const useStrictAI = searchParams.get('useStrictAI') !== 'false'; // Default true - use non-hallucinating explainer
    const explainOnlyTopN = searchParams.get('explainOnlyTopN') !== 'false'; // Default true - only explain top N moves
    
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
    
    // Cache key (include explainOnlyTopN in cache key since it affects results)
    const cacheKeyBase = `stocks:catalysts:${ticker}:${start}:${end}:${interval}:${topN}:${includeBenchmark ? selectedBenchmark : 'no-benchmark'}`;
    const cacheKey = includeAI 
      ? `${cacheKeyBase}:ai:${useStrictAI ? 'strict' : 'legacy'}:${explainOnlyTopN ? 'topN' : 'all'}` 
      : cacheKeyBase;
    
    // Determine cache TTL
    const endDate = new Date(end);
    const startDate = new Date(start);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const isHistorical = daysDiff > 30;
    const ttlMs = isHistorical ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    
    const cached = getCache<{
      moves: Array<{
        move: { date: string; returnPct: number; direction: 'up' | 'down'; rank: number; close: number; previousClose?: number };
        catalysts: Array<{ label: string; confidence: 'high' | 'medium' | 'low'; evidence: any[]; rationale: string }>;
        aiExplanation?: any;
        benchmarkComparison?: any;
      }>;
      priceSeries: Array<{ date: string; close: number }>;
      warnings: string[];
    }>(cacheKey);
    
    if (cached && !cached.stale) {
      logger.info(
        {
          traceId,
          ticker,
          cache: 'hit',
          cacheKey,
          movesCount: cached.value.moves.length,
        },
        'stocks:catalysts:cacheHit'
      );
      return ok({
        data: cached.value,
        meta: {
          traceId,
          source: 'cache',
          fetchedAt: new Date().toISOString(),
        },
      });
    }
    
    logger.info(
      {
        traceId,
        ticker,
        cache: cached?.stale ? 'stale' : 'miss',
        cacheKey,
      },
      'stocks:catalysts:cacheMiss'
    );
    
    // Fetch moves with catalysts
    const result = await explainStockMoves({
      ticker,
      start,
      end,
      interval: interval as 'daily' | 'weekly',
      topN,
      includeBenchmark,
      benchmarkTicker: selectedBenchmark,
      includeAI,
      useStrictAI,
      explainOnlyTopN,
      traceId,
    });
    
    // Cache result
    setCache(cacheKey, result, ttlMs);
    
    const elapsed = Date.now() - startedAt;
    const resultSizeBytes = JSON.stringify(result).length;
    
    logger.info(
      {
        traceId,
        ticker,
        movesCount: result.moves.length,
        includeAI,
        useStrictAI,
        elapsed,
        resultSizeBytes,
        cacheKey,
      },
      'stocks:catalysts:success'
    );
    
    return ok({
      data: result,
      meta: {
        traceId,
        source: 'provider',
        fetchedAt: new Date().toISOString(),
        elapsed,
      },
    });
  } catch (error: any) {
    logger.error({ traceId, error: error.message }, 'stocks:catalysts:error');
    return serverError({ error: 'Failed to fetch catalysts' }, { traceId });
  }
}
