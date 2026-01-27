import { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/respond';
import { getCache } from '@/lib/cache/memory';
import { providerRegistry } from '@/lib/analytics/moveExplainer/providers/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/stocks/debug?ticker=...
 * Debug endpoint for provider status and cache (always available)
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_ENDPOINTS !== 'true') {
    return new Response('Not available in production', { status: 404 });
  }

  // Keep available in production for debugging - can be restricted via env var if needed
  if (process.env.DISABLE_DEBUG_ENDPOINT === 'true') {
    return badRequest({ error: 'Debug endpoint is disabled' });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker')?.trim().toUpperCase();
  
  if (!ticker) {
    return badRequest({ error: 'ticker is required' });
  }
  
  // Get all provider health status
  const providerHealth = providerRegistry.getHealth();
  
  // Get recent cache keys for this ticker
  const recentCacheKeys: string[] = [];
  const cachePrefix = `stocks:`;
  
  // Since we can't enumerate the cache map, we'll check common patterns
  const commonPatterns = [
    `stocks:raw:${ticker}:`,
    `stocks:result:${ticker}:`,
    `stocks:catalysts:${ticker}:`,
    `stocks:moves:${ticker}:`,
  ];
  
  // Get cache entry info (limited - we can't enumerate all keys)
  const sampleCacheKeys: Array<{ key: string; exists: boolean; stale: boolean }> = [];
  
  // Get last errors from provider registry
  const lastErrors: Array<{ provider: string; error: string; timestamp: number }> = [];
  
  // Try to get provider health details
  const providers = ['polygon', 'alpha-vantage', 'unified', 'stooq', 'yahoo', 'newsapi', 'finnhub', 'webz'];
  const providerStatus = providers.map(provider => {
    const health = providerHealth[provider];
    return {
      name: provider,
      available: health?.available ?? true,
      successRate: health?.successRate ?? null,
      lastSuccess: health?.lastSuccess ? new Date(health.lastSuccess).toISOString() : null,
      lastFailure: health?.lastFailure ? new Date(health.lastFailure).toISOString() : null,
      consecutiveFailures: health?.consecutiveFailures ?? 0,
    };
  });
  
  return ok({
    ticker,
    timestamp: new Date().toISOString(),
    providers: providerStatus,
    cache: {
      note: 'Cache enumeration limited - checking common patterns',
      patterns: commonPatterns,
    },
    providerRegistry: {
      health: Object.fromEntries(
        Object.entries(providerHealth).map(([key, value]) => [
          key,
          {
            available: value.available,
            successRate: value.successRate,
            consecutiveFailures: value.consecutiveFailures,
            lastSuccess: value.lastSuccess ? new Date(value.lastSuccess).toISOString() : null,
            lastFailure: value.lastFailure ? new Date(value.lastFailure).toISOString() : null,
            lastError: value.lastError || null,
          },
        ])
      ),
    },
  });
}
