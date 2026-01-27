/**
 * Stock Move Explainer - Main Orchestrator
 * Combines move detection, catalyst matching, and AI explanation
 */

import { detectMoves } from './moveDetection';
import { matchCatalysts } from './catalystMatcher';
import { explainMove as explainMoveLegacy } from './aiExplainer';
import { explainMove as explainMoveStrict } from '@/lib/ai/move_explainer';
import { defaultProvider } from './providers/defaultProvider';
import type { MarketProvider, MoveWithCatalysts, BenchmarkComparison, MoveEvent, PriceBar, NewsItem, EventItem } from './types';
import { getDefaultBenchmarkTicker, classifyMove, computeBenchmarkReturn } from './benchmark';
import { logger } from '@/lib/api/logger';
import {
  getCachedRawData,
  cacheRawData,
  getResultCacheKey,
  getCacheTTL,
  type CachedRawData,
} from './cache';

/**
 * Enrich moves with benchmark context
 */
async function enrichMovesWithBenchmark(
  moves: MoveEvent[],
  benchmarkTicker: 'SPY' | 'QQQ',
  interval: 'daily' | 'weekly',
  provider: MarketProvider,
  traceId: string
): Promise<MoveEvent[]> {
  if (moves.length === 0) return moves;
  
  try {
    // Get benchmark series for the full period (more efficient than per-move)
    const firstMove = moves[0];
    const lastMove = moves[moves.length - 1];
    
    // Extend range slightly to ensure we have data
    const startDate = new Date(firstMove.date);
    startDate.setDate(startDate.getDate() - (interval === 'daily' ? 5 : 14));
    const endDate = new Date(lastMove.date);
    endDate.setDate(endDate.getDate() + 2);
    
    const benchmarkBars = await provider.getBenchmarkSeries?.(benchmarkTicker, {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      interval,
      traceId,
    });
    
    if (!benchmarkBars || benchmarkBars.length < 2) {
      console.warn(`[MoveExplainer] Insufficient benchmark data for ${benchmarkTicker}`);
      return moves;
    }
    
    // Enrich each move with benchmark context
    return moves.map(move => {
      // Find the previous bar date in the benchmark series (same period calculation)
      // For daily: previous day; for weekly: previous week
      const moveBarIndex = benchmarkBars.findIndex(b => b.date === move.date);
      
      if (moveBarIndex <= 0) {
        // Can't find move date or no previous bar
        return move;
      }
      
      // Use previous bar in benchmark series (this matches the move calculation)
      const previousBar = benchmarkBars[moveBarIndex - 1];
      const moveBar = benchmarkBars[moveBarIndex];
      
      if (!moveBar || !previousBar || !Number.isFinite(moveBar.close) || !Number.isFinite(previousBar.close)) {
        return move;
      }
      
      const benchmarkReturnPct = ((moveBar.close - previousBar.close) / previousBar.close) * 100;
      
      if (!Number.isFinite(benchmarkReturnPct)) {
        return move;
      }
      
      const excessReturnPct = move.returnPct - benchmarkReturnPct;
      const moveClass = classifyMove(excessReturnPct, interval);
      
      return {
        ...move,
        benchmarkReturnPct,
        excessReturnPct,
        moveClass,
        benchmarkTicker,
      };
    });
  } catch (error) {
    console.error(`[MoveExplainer] Failed to enrich moves with benchmark:`, error);
    return moves; // Return moves unchanged on error
  }
}

/**
 * Compute benchmark comparison for AI explanation
 */
async function computeBenchmarkComparison(
  ticker: string,
  move: MoveEvent,
  benchmarkTicker: 'SPY' | 'QQQ',
  provider: MarketProvider
): Promise<BenchmarkComparison | undefined> {
  if (!move.benchmarkReturnPct || move.excessReturnPct === undefined || !move.moveClass) {
    return undefined;
  }
  
  return {
    ticker: benchmarkTicker,
    returnPct: move.benchmarkReturnPct,
    excessReturnPct: move.excessReturnPct,
    context: move.moveClass === 'idiosyncratic' ? 'idiosyncratic' : 
             move.moveClass === 'sector-driven' ? 'sector-driven' : 'market-driven',
  };
}

/**
 * Main function to explain stock moves
 */
export async function explainStockMoves(params: {
  ticker: string;
  start: string; // ISO date
  end: string; // ISO date
  interval: 'daily' | 'weekly';
  topN?: number;
  includeBenchmark?: boolean;
  benchmarkTicker?: 'SPY' | 'QQQ';
  includeAI?: boolean;
  useStrictAI?: boolean; // Use non-hallucinating explainer (default: true)
  explainOnlyTopN?: boolean; // If true, only explain top N moves (default: true)
  provider?: MarketProvider;
  traceId?: string;
}): Promise<{
  moves: MoveWithCatalysts[];
  priceSeries: Array<{ date: string; close: number }>;
  warnings: string[];
  _meta?: {
    priceProvider: string;
    newsProvider: string;
    eventsProvider: string;
  };
}> {
  const {
    ticker,
    start,
    end,
    interval,
    topN = 10,
    includeBenchmark = true, // Default to true
    benchmarkTicker, // Auto-detect if not provided
    includeAI = false,
    useStrictAI = true, // Default to strict (non-hallucinating)
    explainOnlyTopN = true, // Default to explaining only top N moves (for performance)
    provider = defaultProvider,
    traceId = 'move-explainer',
  } = params;
  
  // Auto-select benchmark if not provided
  const selectedBenchmark: 'SPY' | 'QQQ' = benchmarkTicker || getDefaultBenchmarkTicker(ticker);
  
  const warnings: string[] = [];
  const ttlMs = getCacheTTL(start, end);
  
  // Check cache for raw data
  const rawCacheKey = `stocks:raw:${ticker}:${start}:${end}:${interval}`;
  const cachedRaw = getCachedRawData(ticker, start, end, interval);
  let priceBars: PriceBar[];
  let news: NewsItem[];
  let events: EventItem[];
  let priceProvider = 'unknown';
  let newsProvider = 'unknown';
  let eventsProvider = 'unknown';
  let fetchStartTime = Date.now();
  
  if (cachedRaw && !cachedRaw.stale) {
    // Cache hit for raw data
    logger.info(
      {
        traceId,
        ticker,
        cache: 'hit',
        cacheKey: rawCacheKey,
        priceCount: cachedRaw.value.priceSeries.length,
        newsCount: cachedRaw.value.news.length,
        eventsCount: cachedRaw.value.events.length,
      },
      'moveExplainer:rawCacheHit'
    );
    priceBars = cachedRaw.value.priceSeries;
    news = cachedRaw.value.news;
    events = cachedRaw.value.events;
    priceProvider = cachedRaw.value.priceProvider;
    newsProvider = cachedRaw.value.newsProvider;
    eventsProvider = cachedRaw.value.eventsProvider;
  } else {
    // Cache miss - fetch from providers
    logger.info(
      {
        traceId,
        ticker,
        cache: cachedRaw?.stale ? 'stale' : 'miss',
        cacheKey: rawCacheKey,
      },
      'moveExplainer:rawCacheMiss'
    );
    
    const fetchTimes = {
      priceStart: Date.now(),
      newsStart: 0,
      eventsStart: 0,
      priceEnd: 0,
      newsEnd: 0,
      eventsEnd: 0,
    };
    
    // Fetch price series - use direct provider fetch to get provider name
    try {
      fetchTimes.priceStart = Date.now();
      // Import the direct fetch function to get provider info
      const { fetchPriceSeriesWithFallback } = await import('./providers/priceProviders');
      const priceResult = await fetchPriceSeriesWithFallback({
        ticker,
        start,
        end,
        interval,
        traceId,
      });
      priceBars = priceResult.bars;
      priceProvider = priceResult.provider;
      fetchTimes.priceEnd = Date.now();
      
      if (priceBars.length < 2) {
        warnings.push('insufficient_price_data');
        logger.warn({ traceId, ticker, priceCount: priceBars.length }, 'moveExplainer:insufficientPriceData');
        return {
          moves: [],
          priceSeries: [],
          warnings,
          _meta: {
            priceProvider,
            newsProvider: 'none',
            eventsProvider: 'none',
          },
        };
      }
    } catch (error: any) {
      warnings.push('price_fetch_failed');
      logger.error({ traceId, ticker, error: error?.message || String(error) }, 'moveExplainer:priceFetchFailed');
      return {
        moves: [],
        priceSeries: [],
        warnings,
        _meta: {
          priceProvider: 'failed',
          newsProvider: 'none',
          eventsProvider: 'none',
        },
      };
    }
    
    // Fetch news - use direct provider fetch to get provider name
    try {
      fetchTimes.newsStart = Date.now();
      const { fetchNewsWithFallback } = await import('./providers/newsProviders');
      const newsResult = await fetchNewsWithFallback({
        ticker,
        start,
        end,
        interval,
        limit: 100,
        traceId,
      });
      news = newsResult.news;
      newsProvider = newsResult.provider;
      fetchTimes.newsEnd = Date.now();
    } catch (error: any) {
      logger.warn({ traceId, ticker, error: error?.message || String(error) }, 'moveExplainer:newsFetchFailed');
      news = [];
      warnings.push('news_fetch_failed');
    }
    
    // Fetch events - use direct provider fetch to get provider name
    try {
      fetchTimes.eventsStart = Date.now();
      const { fetchEventsWithFallback } = await import('./providers/eventsProviders');
      const eventsResult = await fetchEventsWithFallback(
        { ticker, start, end, interval, traceId },
        news // Pass news for inference fallback
      );
      events = eventsResult.events;
      eventsProvider = eventsResult.provider;
      fetchTimes.eventsEnd = Date.now();
    } catch (error: any) {
      logger.warn({ traceId, ticker, error: error?.message || String(error) }, 'moveExplainer:eventsFetchFailed');
      events = [];
      warnings.push('events_fetch_failed');
    }
    
    // Cache raw data
    const rawData: CachedRawData = {
      priceSeries: priceBars,
      news,
      events,
      priceProvider,
      newsProvider,
      eventsProvider,
      fetchedAt: Date.now(),
    };
    cacheRawData(ticker, start, end, interval, rawData, ttlMs);
    
    logger.info(
      {
        traceId,
        ticker,
        priceProvider,
        newsProvider,
        eventsProvider,
        priceCount: priceBars.length,
        newsCount: news.length,
        eventsCount: events.length,
        priceFetchMs: fetchTimes.priceEnd - fetchTimes.priceStart,
        newsFetchMs: fetchTimes.newsEnd - fetchTimes.newsStart,
        eventsFetchMs: fetchTimes.eventsEnd - fetchTimes.eventsStart,
        totalFetchMs: Date.now() - fetchStartTime,
        priceSizeBytes: JSON.stringify(priceBars).length,
        newsSizeBytes: JSON.stringify(news).length,
        eventsSizeBytes: JSON.stringify(events).length,
      },
      'moveExplainer:rawDataFetched'
    );
  }
  
  // Detect moves
  let moves = detectMoves(priceBars, interval, topN);
  
  if (moves.length === 0) {
    return {
      moves: [],
      priceSeries: priceBars.map(b => ({ date: b.date, close: b.close })),
      warnings,
      _meta: {
        priceProvider,
        newsProvider,
        eventsProvider,
      },
    };
  }
  
  // Enrich moves with benchmark context (always if includeBenchmark is true)
  if (includeBenchmark) {
    moves = await enrichMovesWithBenchmark(moves, selectedBenchmark, interval, provider, traceId);
  }
  
  // Check if news/events are empty and log
  if (news.length === 0) {
    warnings.push('no_news_found');
  }
  if (events.length === 0) {
    warnings.push('no_events_found');
  }
  
  // Match catalysts to moves
  const matchStartTime = Date.now();
  const movesWithCatalysts: MoveWithCatalysts[] = [];
  
  for (const move of moves) {
    const catalysts = matchCatalysts(move, news, events, interval);
    
    // Compute benchmark comparison for AI explanation (if benchmark data is available)
    let benchmarkComparison: BenchmarkComparison | undefined;
    if (includeBenchmark) {
      benchmarkComparison = await computeBenchmarkComparison(
        ticker,
        move,
        selectedBenchmark,
        provider
      );
    }
    
    // Generate AI explanation if requested
    // Only explain top N moves if explainOnlyTopN is true (for performance with long ranges)
    let aiExplanation;
    if (includeAI) {
      const shouldExplain = !explainOnlyTopN || move.rank <= topN;
      
      if (shouldExplain) {
        if (useStrictAI) {
          aiExplanation = await explainMoveStrict({
            ticker,
            move,
            catalysts,
            benchmarkComparison,
          });
        } else {
          aiExplanation = await explainMoveLegacy({
            ticker,
            move,
            catalysts,
            benchmarkComparison,
          });
        }
      }
      // else: aiExplanation remains undefined (no explanation for this move)
    }
    
    movesWithCatalysts.push({
      move,
      catalysts,
      aiExplanation,
      benchmarkComparison,
    });
  }
  
  const matchTime = Date.now() - matchStartTime;
  
  logger.info(
    {
      traceId,
      ticker,
      movesCount: moves.length,
      catalystsMatched: movesWithCatalysts.length,
      matchTimeMs: matchTime,
      totalTimeMs: Date.now() - fetchStartTime,
    },
    'moveExplainer:catalystsMatched'
  );
  
  return {
    moves: movesWithCatalysts,
    priceSeries: priceBars.map(b => ({ date: b.date, close: b.close })),
    warnings,
    _meta: {
      priceProvider,
      newsProvider,
      eventsProvider,
    },
  };
}

