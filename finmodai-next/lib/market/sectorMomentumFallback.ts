/**
 * Fallback sector momentum computation using getMarketSeries
 * Used when getFlowMetrics fails or returns insufficient data
 */

import { getMarketSeries } from './provider';
import type { SectorMomentumRange } from './sectorMomentum';

const SECTOR_ETFS = ['XLB', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLRE', 'XLU', 'XLV', 'XLY'];

const sectorName = (etf: string) =>
  ({
    XLB: 'Materials',
    XLE: 'Energy',
    XLF: 'Financials',
    XLI: 'Industrials',
    XLK: 'Technology',
    XLP: 'Consumer Staples',
    XLRE: 'Real Estate',
    XLU: 'Utilities',
    XLV: 'Health Care',
    XLY: 'Consumer Discretionary',
  }[etf] ?? etf);

/**
 * Compute sector momentum using getMarketSeries as fallback
 * Returns simplified scores based on ETF returns only
 */
export async function computeSectorMomentumFallback(params: {
  range: SectorMomentumRange;
  traceId: string;
  timeoutMs?: number;
}): Promise<{
  scores: Array<{
    sector: string;
    etf: string;
    score: number;
    returnPct: number;
    direction: 'up' | 'down' | 'flat';
  }>;
  source: string;
  warnings: string[];
}> {
  const { range, traceId, timeoutMs = 4000 } = params;
  const warnings: string[] = [];
  const results: Array<{
    etf: string;
    returnPct: number | null;
    source: string;
  }> = [];

  // Fetch all sector ETFs in parallel with timeout
  const fetchPromises = SECTOR_ETFS.map(async (etf) => {
    try {
      const series = await getMarketSeries({ ticker: etf, range: range as '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y', traceId });
      const returnPct = series.stats?.pctChange ?? null;
      return {
        etf,
        returnPct: returnPct !== null && Number.isFinite(returnPct) ? returnPct : null,
        source: series.source || 'fallback',
      };
    } catch (error) {
      warnings.push(`${etf}_failed`);
      return {
        etf,
        returnPct: null,
        source: 'fallback',
      };
    }
  });

  // Wait for all or timeout
  const deadline = new Promise<void>((resolve) => {
    setTimeout(() => resolve(), timeoutMs);
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

  // Build scores
  const scores = results
    .filter((r) => r.returnPct !== null)
    .map((r) => {
      const returnPct = r.returnPct!;
      const score = Math.round(returnPct * 10); // Simple score: return * 10
      const direction: 'up' | 'down' | 'flat' = score > 15 ? 'up' : score < -15 ? 'down' : 'flat';
      
      return {
        sector: sectorName(r.etf),
        etf: r.etf,
        score,
        returnPct,
        direction,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (scores.length < SECTOR_ETFS.length) {
    warnings.push('sector_partial');
  }

  return {
    scores,
    source,
    warnings: Array.from(new Set(warnings)),
  };
}

