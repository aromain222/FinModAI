import { getCache, setCache } from '@/lib/cache/memory';
import { MarketHeadline, MarketIndexSeries, MarketPulse } from '@/lib/schemas/market';
import { getMarketSeries } from '@/lib/market/provider';
import { fetchGdeltHeadlines } from '@/lib/providers/news/gdelt';
import { fetchFinnhubHeadlines } from '@/lib/providers/news/finnhub';

type Meta = { 
  asOf: string; 
  providerUsed: string; 
  stale: boolean; 
  traceId: string;
  cached?: boolean;
  warnings?: string[];
  elapsed?: number;
  timedOut?: boolean;
};

const rangeToInterval = (range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y') => {
  switch (range) {
    case '1D':
      return '1d';
    case '1W':
      return '1w';
    case '1M':
      return '1m';
    case '3M':
      return '3m';
    case '1Y':
      return '1y';
    case '5Y':
      return '5y';
    default:
      return '1m';
  }
};

// Convert MarketSeries to MarketIndexSeries format
function convertToMarketIndexSeries(series: { ticker: string; points: Array<{ t: string; close: number }>; source: string }, range: string): MarketIndexSeries {
  return {
    symbol: series.ticker,
    points: series.points.map(p => ({ t: p.t, v: p.close })),
    interval: rangeToInterval(range as any),
  };
}

/**
 * Get market indices with parallel requests and time budget
 * Returns partial results if budget exceeded
 */
export async function getMarketIndices(params: {
  symbols: string[];
  range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
  traceId: string;
}) {
  const cacheKey = `market:indices:${params.symbols.join(',')}:${params.range}`;
  const cached = getCache<{ items: MarketIndexSeries[]; providerUsed: string }>(cacheKey);
  if (cached && !cached.stale) {
    return { items: cached.value.items, meta: { asOf: new Date().toISOString(), providerUsed: cached.value.providerUsed, stale: false, traceId: params.traceId } };
  }

  const TIME_BUDGET_MS = 3500; // 3.5 seconds global timeout
  const startTime = Date.now();
  const warnings: string[] = [];

  try {
    // Parallel requests with time budget
    const deadline = new Promise<{ items: MarketIndexSeries[]; providerUsed: string }>((resolve) => {
      setTimeout(() => {
        warnings.push('timeout_exceeded');
        resolve({ items: [], providerUsed: 'timeout' });
      }, TIME_BUDGET_MS);
    });

    const fetchPromise = Promise.allSettled(
      params.symbols.map(async (symbol) => {
        try {
          const res = await pickSeriesProvider(symbol, params.range, params.traceId);
          return { series: res.data, provider: res.provider, symbol };
        } catch (err: any) {
          warnings.push(`${symbol}_failed:${err?.message || 'unknown'}`);
          return { series: null, provider: 'error', symbol };
        }
      })
    ).then((results) => {
      const successful = results.filter((r) => r.status === 'fulfilled' && r.value.series !== null);
      const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.series === null));
      
      if (failed.length > 0) {
        warnings.push(`${failed.length}_tickers_failed`);
      }
      
      const items = successful.map((r) => (r.status === 'fulfilled' ? r.value.series : null)).filter((s): s is MarketIndexSeries => s !== null);
      const providerUsed = successful[0]?.status === 'fulfilled' && successful[0].value.provider ? successful[0].value.provider : 'mixed';
      
      return { items, providerUsed };
    });

    const result = await Promise.race([fetchPromise, deadline]);
    const elapsed = Date.now() - startTime;
    
    if (elapsed >= TIME_BUDGET_MS) {
      warnings.push(`deadline_exceeded_${elapsed}ms`);
    }
    
    // Cache successful results
    if (result.items.length > 0) {
      setCache(cacheKey, result, 10 * 60 * 1000);
    }
    
    return {
      items: result.items,
      meta: {
        asOf: new Date().toISOString(),
        providerUsed: result.providerUsed,
        stale: false,
        traceId: params.traceId,
        elapsedMs: elapsed,
        warnings,
      },
    };
  } catch (err) {
    if (cached) {
      return {
        items: cached.value.items,
        meta: {
          asOf: new Date(cached.value.items[0]?.points?.slice(-1)?.[0]?.t ?? Date.now()).toISOString(),
          providerUsed: cached.value.providerUsed,
          stale: true,
          traceId: params.traceId,
          warnings: [...warnings, 'using_cached'],
        },
      };
    }
    throw err;
  }
}

export async function getMarketHeadlines(params: { sentiment?: string; limit: number; traceId: string }) {
  const cacheKey = `market:headlines:${params.sentiment || 'all'}:${params.limit}`;
  const cached = getCache<{ items: MarketHeadline[]; providerUsed: string }>(cacheKey);

  try {
    const query = 'markets OR inflation OR rates OR earnings OR economy';
    let items = await fetchGdeltHeadlines({ query, limit: params.limit, traceId: params.traceId });
    let providerUsed = 'gdelt';

    if (!items.length) {
      items = await fetchFinnhubHeadlines({ limit: params.limit, traceId: params.traceId });
      providerUsed = 'finnhub';
    }

    if (params.sentiment && params.sentiment !== 'all') {
      const sentimentMap: Record<string, 'pos' | 'neg' | 'neu'> = {
        bullish: 'pos',
        bearish: 'neg',
        neutral: 'neu',
      };
      const target = sentimentMap[params.sentiment] ?? (params.sentiment as any);
      items = items.filter((item) => item.sentiment === target);
    }

    setCache(cacheKey, { items, providerUsed }, 10 * 60 * 1000);
    return { items, meta: { asOf: new Date().toISOString(), providerUsed, stale: false, traceId: params.traceId } };
  } catch (err) {
    if (cached) {
      return {
        items: cached.value.items,
        meta: { asOf: new Date().toISOString(), providerUsed: cached.value.providerUsed, stale: true, traceId: params.traceId },
      };
    }
    throw err;
  }
}

export async function getMarketPulse(params: { traceId: string }) {
  const cacheKey = 'market:pulse';
  const cached = getCache<{ pulse: MarketPulse; providerUsed: string }>(cacheKey);

  try {
    const indices = await getMarketIndices({ symbols: ['SPY', 'QQQ', 'DIA'], range: '1M', traceId: params.traceId });
    const lastPoints = indices.items.map((series) => series.points[series.points.length - 1]?.v ?? 0);
    const firstPoints = indices.items.map((series) => series.points[0]?.v ?? 0);
    const changes = lastPoints.map((v, idx) => (firstPoints[idx] ? v - firstPoints[idx] : 0));
    const advancers = changes.filter((c) => c > 0).length;
    const decliners = changes.filter((c) => c < 0).length;

    const pulse: MarketPulse = {
      asOf: new Date().toISOString(),
      breadth: { advancers, decliners },
      vol: {},
      notes: ['Breadth derived from SPY/QQQ/DIA proxies'],
    };

    setCache(cacheKey, { pulse, providerUsed: indices.meta.providerUsed }, 5 * 60 * 1000);
    return { pulse, meta: { asOf: pulse.asOf, providerUsed: indices.meta.providerUsed, stale: false, traceId: params.traceId } };
  } catch (err) {
    if (cached) {
      return { pulse: cached.value.pulse, meta: { asOf: cached.value.pulse.asOf, providerUsed: cached.value.providerUsed, stale: true, traceId: params.traceId } };
    }
    throw err;
  }
}
