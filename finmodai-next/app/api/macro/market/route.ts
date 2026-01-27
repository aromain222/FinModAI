import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cached } from '@/lib/cache';
import { getMarketSeries } from '@/lib/market/provider';
import { fetchWebzNews } from '@/lib/providers/news/webz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RangeSchema = z.enum(['1D', '1W', '1M', '1Y', '5Y']);
type Range = z.infer<typeof RangeSchema>;

const ScaleSchema = z.enum(['price', 'return', 'rebase100']).optional().default('price');
type Scale = z.infer<typeof ScaleSchema>;

const QuerySchema = z.object({
  symbol: z.string().optional().default('SPY'),
  benchmark: z.string().optional(), // Alias for symbol, for backward compat
  range: RangeSchema.optional().default('1W'),
  scale: ScaleSchema.optional().default('price'),
  includeHeadlines: z.string().optional().default('false'),
});

const ttlByRange: Record<Range, number> = {
  '1D': 60 * 1000,
  '1W': 5 * 60 * 1000,
  '1M': 5 * 60 * 1000,
  '1Y': 20 * 60 * 1000,
  '5Y': 60 * 60 * 1000,
};

type MarketPoint = { t: string; close: number };
type ProcessedPoint = { t: string; v: number };
type CachedMarket = { source: string; points: MarketPoint[]; warnings: string[]; updatedAt: string };
type CachedMarketWithHeadlines = CachedMarket & { headlines?: Array<{ title: string; publishedAt: string; url?: string }> };

const computeChangePct = (points: MarketPoint[]) => {
  if (points.length < 2) return null;
  const first = points[0]?.close ?? 0;
  const last = points[points.length - 1]?.close ?? 0;
  if (!first) return null;
  return ((last - first) / first) * 100;
};

// Get benchmark label from ticker
const getBenchmarkLabel = (ticker: string): string => {
  const labels: Record<string, string> = {
    'SPY': 'S&P 500',
    'QQQ': 'Nasdaq',
    'DIA': 'Dow',
  };
  return labels[ticker] || ticker;
};

// Transform series based on scale
const transformSeries = (points: MarketPoint[], scale: Scale): ProcessedPoint[] => {
  if (points.length === 0) return [];
  
  // Filter out invalid points
  const validPoints = points.filter(p => 
    p.t && 
    typeof p.close === 'number' && 
    Number.isFinite(p.close) && 
    !Number.isNaN(p.close)
  );
  
  if (validPoints.length === 0) return [];
  
  const firstValue = validPoints[0].close;
  if (!firstValue || !Number.isFinite(firstValue)) return [];
  
  return validPoints.map(p => {
    if (scale === 'price') {
      return { t: p.t, v: p.close };
    } else if (scale === 'return') {
      // Return %: (value/firstValue - 1) * 100
      const returnPct = ((p.close / firstValue) - 1) * 100;
      return { t: p.t, v: Number.isFinite(returnPct) ? returnPct : 0 };
    } else if (scale === 'rebase100') {
      // Rebase to 100: value/firstValue * 100
      const rebased = (p.close / firstValue) * 100;
      return { t: p.t, v: Number.isFinite(rebased) ? rebased : 100 };
    }
    return { t: p.t, v: p.close };
  });
};

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  if (process.env.NODE_ENV !== 'production' || process.env.MACRO_DEBUG_KEYS === '1') {
    console.log('[MACRO_KEYS]', {
      FRED: !!process.env.FRED_API_KEY,
      DATABENTO: !!process.env.DATABENTO_API_KEY,
      WEBZ: !!process.env.WEBZ_API_KEY,
      WEBZIO: !!process.env.WEBZIO_API_KEY,
      OPENAI: !!process.env.OPENAI_API_KEY,
      FINNHUB: !!process.env.FINNHUB_API_KEY,
      POLYGON: !!process.env.POLYGON_API_KEY,
    });
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    symbol: searchParams.get('symbol') ?? searchParams.get('benchmark') ?? undefined,
    benchmark: searchParams.get('benchmark') ?? undefined,
    range: searchParams.get('range') ?? undefined,
    scale: searchParams.get('scale') ?? undefined,
    includeHeadlines: searchParams.get('includeHeadlines') ?? undefined,
  });

  const fallbackParams = { symbol: 'SPY', range: '1W' as Range, scale: 'price' as Scale, includeHeadlines: 'false' };
  const { symbol, benchmark, range, scale, includeHeadlines } = parsed.success ? parsed.data : fallbackParams;
  // Use benchmark if provided, otherwise symbol (backward compat)
  const ticker = (benchmark || symbol || 'SPY').trim().toUpperCase();
  const normalizedSymbol = ticker === 'SPY' || ticker === 'QQQ' || ticker === 'DIA' ? ticker : 'SPY';
  const shouldIncludeHeadlines = includeHeadlines === 'true' || includeHeadlines === '1';
  const ttlMs = ttlByRange[range] ?? ttlByRange['1W'];
  const cacheKey = `macro:market:${normalizedSymbol}:${range}${shouldIncludeHeadlines ? ':headlines' : ''}`;

  try {
    const { value, stale } = await cached<CachedMarketWithHeadlines>(cacheKey, ttlMs, async () => {
      const warnings: string[] = [];
      const series = await getMarketSeries({ ticker: normalizedSymbol, range, traceId });
      
      // Map warnings based on source
      if (series.source === 'fallback') {
        warnings.push('market_unavailable');
      } else if (series.source === 'yfinance') {
        warnings.push('fallback_to_yfinance');
      }
      
      const result: CachedMarketWithHeadlines = {
        source: series.source,
        points: series.points.map((p) => ({ t: p.t, close: p.close })),
        warnings,
        updatedAt: series.lastUpdatedISO,
      };
      
      // Fetch headlines if requested
      if (shouldIncludeHeadlines) {
        try {
          const baseQuery = 'stocks OR equities OR S&P 500 OR Nasdaq';
          const tickerQuery = normalizedSymbol ? `${normalizedSymbol} OR ${normalizedSymbol}` : '';
          const query = [tickerQuery, baseQuery].filter(Boolean).join(' OR ');
          
          const headlines = await fetchWebzNews({ query, size: 10, traceId });
          result.headlines = headlines.slice(0, 10).map((item) => ({
            title: item.title || '',
            publishedAt: item.publishedAt || new Date().toISOString(),
            url: item.url || undefined,
          }));
        } catch (error) {
          warnings.push('headlines_failed');
        }
      }
      
      return result;
    });

    const warnings = [...value.warnings];
    if (stale) warnings.push('stale_cache');
    if (value.points.length > 0 && value.points.length < 2) warnings.push('insufficient_points');

    const changePct = computeChangePct(value.points);
    const transformedSeries = transformSeries(value.points, scale || 'price');
    
    // Calculate stats for the transformed series
    const seriesStart = transformedSeries[0]?.v ?? null;
    const seriesEnd = transformedSeries[transformedSeries.length - 1]?.v ?? null;
    const seriesChangePct = scale === 'price' 
      ? changePct 
      : (seriesStart && seriesEnd && Number.isFinite(seriesStart) && Number.isFinite(seriesEnd))
        ? seriesEnd - seriesStart
        : null;

    return NextResponse.json({
      source: value.source,
      updatedAt: value.updatedAt,
      benchmark: {
        symbol: normalizedSymbol,
        label: getBenchmarkLabel(normalizedSymbol),
      },
      scale: scale || 'price',
      range,
      series: transformedSeries,
      stats: {
        start: seriesStart,
        end: seriesEnd,
        changePct: seriesChangePct,
      },
      // Legacy fields for backward compatibility
      data: {
        symbol: normalizedSymbol,
        range,
        points: value.points,
        changePct,
        ...(shouldIncludeHeadlines && value.headlines ? { headlines: value.headlines } : {}),
      },
      warnings,
    });
  } catch (error: any) {
    const errorMsg = error?.message || String(error) || 'Unknown error';
    console.error('[macro:market]', { traceId, ticker: normalizedSymbol, error: errorMsg });
    return NextResponse.json({
      source: 'fallback',
      updatedAt: new Date().toISOString(),
      benchmark: {
        symbol: normalizedSymbol,
        label: getBenchmarkLabel(normalizedSymbol),
      },
      scale: scale || 'price',
      range,
      series: [],
      stats: {
        start: null,
        end: null,
        changePct: null,
      },
      data: { symbol: normalizedSymbol, range, points: [], changePct: null },
      warnings: ['market_unavailable'],
    });
  }
}
