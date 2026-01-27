import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { computeSectorMomentum, type SectorMomentumRange } from '@/lib/market/sectorMomentum';
import { computeSectorMomentumFallback } from '@/lib/market/sectorMomentumFallback';
import { cached } from '@/lib/cache';
import { toErrorText } from '@/lib/providers/utils';
import { stats as getCacheStats } from '@/lib/utils/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  range: z.enum(['1D', '1W', '1M']).optional().default('1D'),
});

const ttlByRange: Record<SectorMomentumRange, number> = {
  '1D': 5 * 60 * 1000,
  '1W': 15 * 60 * 1000,
  '1M': 30 * 60 * 1000,
};

const GLOBAL_DEADLINE_MS = 12000; // 12 seconds global timeout

const dedupeWarnings = (warnings: string[]) => Array.from(new Set(warnings.map((w) => (w || '').trim()).filter(Boolean)));

/**
 * Execute function with deadline - returns partial results if timeout exceeded
 */
async function withDeadline<T>(
  fn: () => Promise<T>,
  deadlineMs: number,
  onTimeout: (elapsed: number) => T
): Promise<{ result: T; elapsed: number; timedOut: boolean }> {
  const start = Date.now();
  const deadline = new Promise<T>((resolve) => {
    setTimeout(() => resolve(onTimeout(Date.now() - start)), deadlineMs);
  });

  const result = await Promise.race([fn(), deadline]);
  const elapsed = Date.now() - start;
  const timedOut = elapsed >= deadlineMs;

  return { result, elapsed, timedOut };
}

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startTime = Date.now();
  const now = new Date().toISOString();

  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({ range: searchParams.get('range') ?? undefined });
  const range: SectorMomentumRange = parsed.success ? parsed.data.range : '1D';

  const cacheKey = `market:sector-momentum:${range}`;
  const ttlMs = ttlByRange[range] ?? ttlByRange['1D'];
  const cacheStatsBefore = getCacheStats();

  try {
    // Execute with deadline - return partial results if timeout exceeded
    const { result: computeResult, elapsed, timedOut } = await withDeadline(
      async () => {
        const { value, stale } = await cached(cacheKey, ttlMs, async () => computeSectorMomentum({ range, traceId }));
        return { value, stale };
      },
      GLOBAL_DEADLINE_MS,
      (elapsedMs) => {
        // Timeout - return partial/empty results
        console.warn(`[sector-momentum] Deadline exceeded (${elapsedMs}ms) for range ${range}`);
        return {
          value: {
            scores: [],
            meta: { providerUsed: 'timeout', sources: {} },
            providers: {},
            warnings: ['deadline_exceeded'],
          },
          stale: false,
        };
      }
    );

    const { value, stale } = computeResult;
    let scores = value.scores ?? [];
    let warnings = dedupeWarnings([...(value.warnings ?? []), ...(stale ? ['stale'] : [])]);
    let source = value.meta?.providerUsed || 'fallback';
    let providers = value.providers ?? {};

    // FALLBACK: If no scores or very few scores, use getMarketSeries fallback
    if (scores.length === 0 || scores.length < 3) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[sector-momentum] Primary method returned ${scores.length} scores, using fallback`);
      }
      
      try {
        const fallbackResult = await computeSectorMomentumFallback({ range, traceId, timeoutMs: 4000 });
        if (fallbackResult.scores.length > 0) {
          // Convert fallback format to SectorScore format
          scores = fallbackResult.scores.map((s) => ({
            sector: s.sector,
            score: s.score,
            direction: s.direction,
            summary: `${s.sector} ${s.direction === 'up' ? 'rising' : s.direction === 'down' ? 'falling' : 'flat'}; ETF return ${s.returnPct >= 0 ? '+' : ''}${s.returnPct.toFixed(2)}%.`,
            drivers: [],
            drags: [],
            constituents: [],
            etf: s.etf, // Add etf field for UI
            returnPct: s.returnPct, // Add returnPct for UI
          }));
          source = fallbackResult.source;
          warnings = dedupeWarnings([...warnings, ...fallbackResult.warnings, 'used_fallback_method']);
          
          // Build providers map from fallback
          fallbackResult.scores.forEach((s) => {
            providers[s.etf] = source;
          });
        }
      } catch (fallbackError) {
        warnings.push('fallback_method_failed');
        if (process.env.NODE_ENV !== 'production') {
          console.error(`[sector-momentum] Fallback method also failed:`, toErrorText(fallbackError));
        }
      }
    }

    const activeProviders = Array.from(new Set(Object.values(providers).filter((p) => typeof p === 'string' && p && p !== 'fallback')));
    if (activeProviders.length === 0 && source === 'fallback') {
      source = 'fallback';
    } else if (activeProviders.length > 0 && source === 'fallback') {
      source = activeProviders.length === 1 ? activeProviders[0]! : 'mixed';
    }

    // Count provider usage
    const providerCounts: Record<string, number> = {};
    Object.values(providers).forEach((p) => {
      if (typeof p === 'string' && p) {
        providerCounts[p] = (providerCounts[p] || 0) + 1;
      }
    });

    const cacheStatsAfter = getCacheStats();
    const cacheHits = cacheStatsAfter.size - cacheStatsBefore.size + (stale ? 0 : 1); // Rough estimate

    // Calculate coverage
    const totalSectors = 11; // XLB, XLE, XLF, XLI, XLK, XLP, XLRE, XLU, XLV, XLY, XLC
    const returnedSectors = scores.length;
    const coverage = { ok: returnedSectors, total: totalSectors };

    const payload: any = {
      ok: scores.length > 0,
      updatedAt: now,
      range,
      asOf: now,
      source,
      providers,
      sectors: scores.map((s) => {
        // Normalize returnPct to decimal format (0.12 for 12%)
        // s.returnPct may come from percentage format (12) or be missing
        // s.score is derived from percentage-based changePct, so score/10 would also need normalization
        let returnPctDecimal: number;
        if (typeof s.returnPct === 'number' && Number.isFinite(s.returnPct)) {
          // If returnPct exists, check if it's percentage (abs > 1) or decimal (abs <= 1)
          // Percentage format (12 for 12%) -> convert to decimal (0.12)
          // Decimal format (0.12 for 12%) -> use as is
          returnPctDecimal = Math.abs(s.returnPct) > 1 ? s.returnPct / 100 : s.returnPct;
        } else if (typeof s.score === 'number' && Number.isFinite(s.score)) {
          // Fallback: derive from score (score is typically -100 to +100 range, represents approximate percentage)
          // score/10 would give us approximate percentage, then normalize to decimal
          const approxPercent = s.score / 10;
          returnPctDecimal = Math.abs(approxPercent) > 1 ? approxPercent / 100 : approxPercent;
        } else {
          returnPctDecimal = 0;
        }
        
        return {
          sector: s.sector,
          ticker: s.etf || s.sector,
          returnPct: returnPctDecimal, // Always in decimal format (0.12 for 12%)
          score: s.score,
          direction: s.direction,
        };
      }),
      coverage,
      data: scores, // Keep for backward compatibility
      warnings,
      meta: {
        traceId,
        elapsedMs: Date.now() - startTime,
        cacheHits: Math.max(0, cacheHits),
        providerCounts,
        errorsCount: warnings.filter((w) => w.includes('unavailable') || w.includes('failed')).length,
        ...(process.env.NODE_ENV !== 'production' && {
          stale,
          providerUsed: value.meta?.providerUsed,
          sources: value.meta?.sources,
          timedOut,
        }),
      },
    };

    // Log response shape for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[sector-momentum] Range: ${range}, Elapsed: ${elapsed}ms, Source: ${source}, Sectors: ${scores.length}/${totalSectors}, Providers: ${Object.keys(providerCounts).join(', ') || 'none'}`);
      console.log(`[sector-momentum] Response shape: ok=${payload.ok}, sectors.length=${payload.sectors.length}, coverage=${JSON.stringify(payload.coverage)}`);
    }

    return NextResponse.json(payload);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    
    // Try fallback even on error
    let fallbackScores: any[] = [];
    let fallbackSource = 'fallback';
    try {
      const fallbackResult = await computeSectorMomentumFallback({ range, traceId, timeoutMs: 3000 });
      fallbackScores = fallbackResult.scores.map((s) => ({
        sector: s.sector,
        ticker: s.etf,
        returnPct: s.returnPct,
        score: s.score,
        direction: s.direction,
      }));
      fallbackSource = fallbackResult.source;
    } catch (fallbackError) {
      // Fallback also failed
    }
    
    const payload: any = {
      ok: fallbackScores.length > 0,
      updatedAt: now,
      range,
      asOf: now,
      source: fallbackSource,
      providers: {},
      sectors: fallbackScores,
      coverage: { ok: fallbackScores.length, total: 11 },
      data: fallbackScores, // Keep for backward compatibility
      warnings: ['sector_momentum_unavailable', ...(fallbackScores.length > 0 ? ['used_fallback_method'] : [])],
      meta: {
        traceId,
        elapsedMs: elapsed,
        cacheHits: 0,
        errorsCount: 1,
      },
    };
    if (process.env.NODE_ENV !== 'production') {
      payload.meta.error = toErrorText(error);
      console.error(`[sector-momentum] Error after ${elapsed}ms:`, toErrorText(error));
    }
    return NextResponse.json(payload);
  }
}
