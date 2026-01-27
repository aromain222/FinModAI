/**
 * Default Market Provider with Fallback Chaining
 * Orchestrates multiple providers with automatic fallback
 */

import type { MarketProvider, PriceSeriesParams, NewsSearchParams, CompanyEventsParams, PriceBar, NewsItem, EventItem } from './types';
import { fetchPriceYahoo } from './price/yahoo';
import { fetchNewsNewsAPI } from './news/newsapi';
import { getEarningsEvents } from '../events/earnings';
import { getSecFilings } from '../events/sec';
import { tryProvidersWithFallback, providerRegistry, normalizePriceSeries, normalizeNewsItems, normalizeEventItems } from './registry';
import { logger } from '@/lib/api/logger';

/**
 * Default Market Provider Implementation
 * Uses fallback chaining for resilience
 */
export class DefaultMarketProvider implements MarketProvider {
  /**
   * Get price series with fallback chain
   * Price is critical - throws error if all providers fail
   */
  async getPriceSeries(params: PriceSeriesParams): Promise<PriceBar[]> {
    const traceId = params.ticker + '-' + Date.now();
    
    // Price provider chain: Yahoo (no key required)
    const providers = [
      {
        name: 'yahoo',
        fn: () => fetchPriceYahoo(params),
      },
    ];
    
    const result = await tryProvidersWithFallback(providers, traceId);
    
    if (!result || result.result === null) {
      throw new Error(`All price providers failed. Last error: ${result?.error || 'Unknown'}`);
    }
    
    // Ensure normalization and sorting
    return normalizePriceSeries(result.result);
  }
  
  /**
   * Search news with fallback chain
   * News is optional - returns empty array if all providers fail
   */
  async searchNews(params: NewsSearchParams): Promise<NewsItem[]> {
    const traceId = params.ticker + '-' + Date.now();
    
    // News provider chain: NewsAPI > (empty fallback)
    const providers: Array<{ name: string; fn: () => Promise<NewsItem[]> }> = [];
    
    // Add NewsAPI if key available
    if (process.env.NEWSAPI_API_KEY || process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY) {
      providers.push({
        name: 'newsapi',
        fn: () => fetchNewsNewsAPI(params),
      });
    }
    
    const result = await tryProvidersWithFallback(providers, traceId);
    
    // Graceful degradation: return empty array if news fails (price chart must still work)
    if (!result || result.result === null) {
      logger.warn({ ticker: params.ticker, error: result?.error, traceId }, 'market_data:news_failed');
      return [];
    }
    
    // Ensure normalization and sorting
    return normalizeNewsItems(result.result);
  }
  
  /**
   * Get company events (earnings, filings, etc.)
   * Events are optional - returns empty array if unavailable
   * Combines earnings and SEC filings with news fallback
   */
  async getCompanyEvents(params: CompanyEventsParams): Promise<EventItem[]> {
    const { ticker, start, end } = params;
    const traceId = ticker + '-' + Date.now();

    try {
      // Fetch news first (for fallback inference)
      let newsFallback: NewsItem[] = [];
      try {
        newsFallback = await this.searchNews({
          ticker,
          start,
          end,
          limit: 100, // Get more news for better inference
        });
      } catch (error: any) {
        // News is optional for events, continue without it
        logger.warn({ ticker, error: error?.message, traceId }, 'market_data:events:news_fallback_failed');
      }

      // Fetch earnings events (with news fallback)
      const earningsEvents: EventItem[] = [];
      try {
        const earnings = await getEarningsEvents(ticker, start, end, newsFallback);
        earningsEvents.push(...earnings);
      } catch (error: any) {
        logger.warn({ ticker, error: error?.message, traceId }, 'market_data:events:earnings_failed');
      }

      // Fetch SEC filings (with news fallback)
      const filingEvents: EventItem[] = [];
      try {
        const filings = await getSecFilings(ticker, start, end, newsFallback);
        filingEvents.push(...filings);
      } catch (error: any) {
        logger.warn({ ticker, error: error?.message, traceId }, 'market_data:events:filings_failed');
      }

      // Combine and normalize
      const allEvents = [...earningsEvents, ...filingEvents];
      return normalizeEventItems(allEvents);
    } catch (error: any) {
      logger.error({ ticker, error: error?.message, traceId }, 'market_data:events:failed');
      // Return empty array for graceful degradation
      return [];
    }
  }
}

/**
 * Default provider instance
 */
export const defaultMarketProvider = new DefaultMarketProvider();

/**
 * Export types and registry for external use
 */
export * from './types';
export { providerRegistry } from './registry';
export type { ProviderHealth } from './registry';

