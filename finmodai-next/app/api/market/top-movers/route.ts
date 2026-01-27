import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMarketSeries } from '@/lib/market/provider';
import { cached } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  range: z.enum(['1D', '1W', '1M']).optional().default('1D'),
  limit: z.coerce.number().min(1).max(20).optional().default(10),
});

type Range = '1D' | '1W' | '1M';

// Curated list of liquid mega-cap and popular tickers for top movers
const LIQUID_TICKERS = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'NFLX',
  // Mega-cap diversified
  'JPM', 'JNJ', 'V', 'WMT', 'PG', 'MA', 'DIS', 'HD',
  // Semiconductors
  'AMD', 'INTC', 'AVGO', 'TXN', 'QCOM',
  // Financials
  'BAC', 'GS', 'MS', 'C', 'WFC',
  // Consumer
  'MCD', 'SBUX', 'NKE', 'COST',
  // Energy
  'XOM', 'CVX', 'SLB',
  // Healthcare
  'UNH', 'PFE', 'ABT', 'TMO',
  // Industrials
  'BA', 'CAT', 'GE', 'HON',
  // Other popular
  'COIN', 'PLTR', 'RIVN', 'LCID', 'F', 'GM',
];

const TIME_BUDGET_MS = 4000; // 4 second time budget
const ttlByRange: Record<Range, number> = {
  '1D': 2 * 60 * 1000, // 2 minutes for daily
  '1W': 5 * 60 * 1000, // 5 minutes for weekly
  '1M': 15 * 60 * 1000, // 15 minutes for monthly
};

type Mover = {
  ticker: string;
  name?: string;
  returnPct: number;
  price?: number;
  source: string;
};

type TopMoversResult = {
  range: Range;
  gainers: Mover[];
  losers: Mover[];
  warnings: string[];
  source: string;
  coverage: string; // e.g., "45/60 computed"
};

/**
 * Compute return percentage from series points
 * Returns decimal format (0.12 for 12%) for consistent API format
 */
function computeReturnPct(points: Array<{ t: string; close: number }>): number | null {
  if (points.length < 2) return null;
  const first = points[0]?.close;
  const last = points[points.length - 1]?.close;
  if (!first || !last || first === 0) return null;
  // Return as decimal (0.12 for 12%) instead of percentage (12 for 12%)
  return (last - first) / first;
}

/**
 * Fetch top movers with time budget
 */
async function fetchTopMovers(range: Range, limit: number, traceId: string): Promise<TopMoversResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const results: Array<{ ticker: string; returnPct: number; price: number | null; source: string }> = [];
  
  // Fetch series for all tickers in parallel with timeout
  const fetchPromises = LIQUID_TICKERS.map(async (ticker) => {
    try {
      const series = await getMarketSeries({ ticker, range, traceId });
      const returnPct = computeReturnPct(series.points);
      const price = series.points[series.points.length - 1]?.close ?? null;
      
      if (returnPct !== null && Number.isFinite(returnPct)) {
        return {
          ticker,
          returnPct,
          price,
          source: series.source,
        };
      }
      return null;
    } catch (error) {
      warnings.push(`${ticker}_failed`);
      return null;
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
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  }

  const elapsed = Date.now() - startTime;
  if (elapsed >= TIME_BUDGET_MS) {
    warnings.push('timeout_exceeded');
  }

  // Sort by return percentage
  results.sort((a, b) => b.returnPct - a.returnPct);
  
  // Split into gainers and losers
  const gainers = results
    .filter((r) => r.returnPct > 0)
    .slice(0, limit)
    .map((r) => ({
      ticker: r.ticker,
      returnPct: r.returnPct,
      price: r.price ?? undefined,
      source: r.source,
    }));

  const losers = results
    .filter((r) => r.returnPct < 0)
    .sort((a, b) => a.returnPct - b.returnPct)
    .slice(0, limit)
    .map((r) => ({
      ticker: r.ticker,
      returnPct: r.returnPct,
      price: r.price ?? undefined,
      source: r.source,
    }));

  // Determine source (use most common source, or 'mixed')
  const sources = results.map((r) => r.source).filter((s) => s && s !== 'fallback');
  const sourceCounts: Record<string, number> = {};
  sources.forEach((s) => {
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  });
  const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const source = topSource || (sources.length > 1 ? 'mixed' : sources[0] || 'fallback');

  return {
    range,
    gainers,
    losers,
    warnings: Array.from(new Set(warnings)),
    source,
    coverage: `${results.length}/${LIQUID_TICKERS.length} computed`,
  };
}

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const searchParams = request.nextUrl.searchParams;
  
  const parsed = QuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });

  const { range, limit } = parsed.success ? parsed.data : { range: '1D' as Range, limit: 10 };
  const cacheKey = `market:top-movers:${range}:${limit}`;
  const ttlMs = ttlByRange[range] ?? ttlByRange['1D'];

  try {
    const { value, stale } = await cached<TopMoversResult>(cacheKey, ttlMs, async () => {
      return await fetchTopMovers(range, limit, traceId);
    });

    const warnings = [...value.warnings];
    if (stale) warnings.push('stale_cache');

    return NextResponse.json({
      ok: true,
      range: value.range,
      gainers: value.gainers,
      losers: value.losers,
      warnings,
      source: value.source,
      coverage: value.coverage,
      meta: {
        traceId,
        updatedAt: new Date().toISOString(),
        stale,
      },
    });
  } catch (error: any) {
    const errorMsg = error?.message || String(error) || 'Unknown error';
    console.error('[market:top-movers]', { traceId, error: errorMsg });
    
    return NextResponse.json({
      ok: false,
      range,
      gainers: [],
      losers: [],
      warnings: ['top_movers_unavailable'],
      source: 'fallback',
      coverage: '0/0 computed',
      error: { code: 'TOP_MOVERS_FAILED', message: errorMsg },
      meta: { traceId, updatedAt: new Date().toISOString() },
    });
  }
}
