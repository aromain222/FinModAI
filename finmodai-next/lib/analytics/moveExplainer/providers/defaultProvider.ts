/**
 * Default Market Provider Implementation
 * Uses provider registry with fallback chaining
 */

import type { MarketProvider, MarketProviderConfig, PriceBar, NewsItem, EventItem } from '../types';
import { fetchPriceSeriesWithFallback } from './priceProviders';
import { fetchNewsWithFallback } from './newsProviders';
import { fetchEventsWithFallback } from './eventsProviders';
import { providerRegistry } from './registry';

/**
 * Default provider implementation using registry with fallback chain
 */
export class DefaultMarketProvider implements MarketProvider {
  async getPriceSeries(config: MarketProviderConfig): Promise<PriceBar[]> {
    const { ticker, traceId } = config;
    
    try {
      const result = await fetchPriceSeriesWithFallback(config);
      
      // Log provider health
      providerRegistry.recordAttempt(result.provider, true);
      
      if (result.bars.length === 0) {
        throw new Error(`No price data returned from ${result.provider}`);
      }
      
      return result.bars;
    } catch (error: any) {
      // Log failure
      const lastProvider = 'fallback';
      providerRegistry.recordAttempt(lastProvider, false, error?.message);
      
      console.error(`[DefaultMarketProvider] Failed to fetch price series for ${ticker}:`, error);
      throw error; // Re-throw to allow graceful handling upstream
    }
  }
  
  async getCompanyEvents(config: MarketProviderConfig): Promise<EventItem[]> {
    const { traceId } = config;
    
    try {
      // First try to get news for inference
      const newsResult = await fetchNewsWithFallback(config);
      
      // Then get events (with news as fallback)
      const eventsResult = await fetchEventsWithFallback(config, newsResult.news);
      
      // Log provider health
      providerRegistry.recordAttempt(eventsResult.provider, eventsResult.events.length > 0);
      
      return eventsResult.events;
    } catch (error: any) {
      console.error(`[DefaultMarketProvider] Failed to fetch events:`, error);
      // Return empty array for graceful degradation
      return [];
    }
  }
  
  async searchNews(config: MarketProviderConfig): Promise<NewsItem[]> {
    const { ticker, traceId } = config;
    
    try {
      const result = await fetchNewsWithFallback(config);
      
      // Log provider health
      providerRegistry.recordAttempt(result.provider, result.news.length > 0);
      
      return result.news;
    } catch (error: any) {
      console.error(`[DefaultMarketProvider] Failed to fetch news for ${ticker}:`, error);
      // Return empty array for graceful degradation (price chart must still work)
      return [];
    }
  }
  
  async getBenchmarkSeries(benchmarkTicker: string, config: Omit<MarketProviderConfig, 'ticker'>): Promise<PriceBar[]> {
    return this.getPriceSeries({
      ...config,
      ticker: benchmarkTicker,
    });
  }
}

export const defaultProvider = new DefaultMarketProvider();

