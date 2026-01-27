import { NextRequest } from 'next/server';
import { defaultProvider } from '@/lib/analytics/moveExplainer/providers/defaultProvider';
import { getCache, setCache } from '@/lib/cache/memory';
import { ok, badRequest, serverError } from '@/lib/api/respond';
import { logger } from '@/lib/api/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/stocks/series?ticker=&start=&end=&interval=
 * Returns price series for a ticker
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
    
    if (!ticker) {
      return badRequest({ error: 'ticker is required' }, { traceId });
    }
    
    if (!start || !end) {
      return badRequest({ error: 'start and end dates are required' }, { traceId });
    }
    
    if (interval !== 'daily' && interval !== 'weekly') {
      return badRequest({ error: 'interval must be daily or weekly' }, { traceId });
    }
    
    // Cache key
    const cacheKey = `stocks:series:${ticker}:${start}:${end}:${interval}`;
    
    // Determine cache TTL (recent <= 30d: 1h, historical > 30d: 24h)
    const endDate = new Date(end);
    const startDate = new Date(start);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const isHistorical = daysDiff > 30;
    const ttlMs = isHistorical ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    
    const cached = getCache<{ bars: Array<{ date: string; open?: number; high?: number; low?: number; close: number; volume?: number }> }>(cacheKey);
    if (cached && !cached.stale) {
      return ok({
        data: cached.value.bars,
        meta: {
          traceId,
          source: 'cache',
          fetchedAt: new Date().toISOString(),
        },
      });
    }
    
    // Fetch from provider
    const bars = await defaultProvider.getPriceSeries({
      ticker,
      start,
      end,
      interval: interval as 'daily' | 'weekly',
      traceId,
    });
    
    // Cache result
    setCache(cacheKey, { bars }, ttlMs);
    
    const elapsed = Date.now() - startedAt;
    logger.info({ traceId, ticker, barsCount: bars.length, elapsed }, 'stocks:series');
    
    return ok({
      data: bars,
      meta: {
        traceId,
        source: 'provider',
        fetchedAt: new Date().toISOString(),
        elapsed,
      },
    });
  } catch (error: any) {
    logger.error({ traceId, error: error.message }, 'stocks:series:error');
    return serverError({ error: 'Failed to fetch price series' }, { traceId });
  }
}
