/**
 * News Data Providers
 * Multiple implementations with fallback chain
 */

import { ENV } from '@/lib/env/server';
import { fetchWebzNews } from '@/lib/providers/news/webz';
import { fetchFinnhubNews } from '@/lib/news/headlinesPipeline';
import { fetchMarketHeadlinesLive } from '@/lib/news/headlinesPipeline';
import { ProviderError, notConfigured, providerFailure } from '@/lib/providers/errors';
import { fetchWithTimeout } from '@/lib/providers/utils';
import type { NewsItem, MarketProviderConfig } from '../types';
import { normalizeMarketDate } from './registry';
import type { NewsItem as PipelineNewsItem } from '@/lib/schemas/news';

/**
 * Polygon News provider
 */
export async function fetchNewsPolygon(config: MarketProviderConfig): Promise<NewsItem[]> {
  const { ticker, start, end, limit = 50, traceId } = config;
  
  if (!ENV.POLYGON_API_KEY) {
    throw notConfigured('polygon');
  }
  
  try {
    // Polygon News API endpoint
    const url = `https://api.polygon.io/v2/reference/news?ticker=${encodeURIComponent(ticker)}&limit=${limit}&apiKey=${ENV.POLYGON_API_KEY}`;
    
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 5000);
    
    if (!res.ok) {
      if (res.status === 429) {
        throw providerFailure('polygon', 'Rate limit exceeded', 429);
      }
      throw providerFailure('polygon', `HTTP ${res.status}`, res.status);
    }
    
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const news: NewsItem[] = results
      .filter((item: any) => {
        if (!item.published_utc) return false;
        const date = normalizeMarketDate(new Date(item.published_utc));
        return date >= startStr && date <= endStr;
      })
      .slice(0, limit)
      .map((item: any): NewsItem => ({
        title: item.title || 'No title',
        url: item.article_url || item.url || '',
        source: item.publisher?.name || 'Unknown',
        publishedAt: new Date(item.published_utc).toISOString(),
        summary: item.description || item.summary,
      }));
    
    return news;
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('polygon', error?.message || 'polygon news fetch failed', 0);
  }
}

/**
 * NewsAPI provider
 */
export async function fetchNewsNewsAPI(config: MarketProviderConfig): Promise<NewsItem[]> {
  const { ticker, start, end, limit = 50 } = config;
  
  const apiKey = process.env.NEWSAPI_API_KEY || process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  if (!apiKey) {
    throw notConfigured('newsapi');
  }
  
  try {
    // NewsAPI Everything endpoint
    const fromDate = new Date(start);
    const toDate = new Date(end);
    const fromStr = fromDate.toISOString().split('T')[0];
    const toStr = toDate.toISOString().split('T')[0];
    
    const query = `${ticker} OR ${ticker.toUpperCase()}`;
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromStr}&to=${toStr}&language=en&sortBy=publishedAt&pageSize=${Math.min(limit, 100)}&apiKey=${apiKey}`;
    
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 5000);
    
    if (!res.ok) {
      if (res.status === 429) {
        throw providerFailure('newsapi', 'Rate limit exceeded', 429);
      }
      throw providerFailure('newsapi', `HTTP ${res.status}`, res.status);
    }
    
    const json = await res.json();
    
    if (json.status === 'error') {
      throw providerFailure('newsapi', json.message || 'NewsAPI error', 0);
    }
    
    const articles = Array.isArray(json?.articles) ? json.articles : [];
    
    const news: NewsItem[] = articles
      .filter((item: any) => item.title && item.publishedAt)
      .slice(0, limit)
      .map((item: any): NewsItem => ({
        title: item.title || 'No title',
        url: item.url || '',
        source: item.source?.name || 'Unknown',
        publishedAt: new Date(item.publishedAt).toISOString(),
        summary: item.description || item.content,
      }));
    
    return news;
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('newsapi', error?.message || 'newsapi fetch failed', 0);
  }
}

/**
 * Finnhub news provider
 */
export async function fetchNewsFinnhub(config: MarketProviderConfig): Promise<NewsItem[]> {
  const { ticker, start, end, limit = 50, traceId } = config;
  
  if (!ENV.FINNHUB_API_KEY) {
    throw notConfigured('finnhub');
  }
  
  try {
    // Use existing pipeline function
    const endDate = new Date(end);
    const startDate = new Date(start);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    let range: '1D' | '1W' | '1M' | '3M' = '1M';
    if (daysDiff <= 7) range = '1W';
    else if (daysDiff <= 30) range = '1M';
    else range = '3M';
    
    const headlines = await fetchMarketHeadlinesLive({
      range,
      ticker,
      query: ticker ? `${ticker} OR ${ticker.toUpperCase()}` : '',
      limit,
      traceId: traceId || 'move-explainer',
    });
    
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const news: NewsItem[] = headlines.items
      .filter((h: PipelineNewsItem) => {
        if (!h.publishedAt) return false;
        const date = normalizeMarketDate(h.publishedAt);
        return date >= startStr && date <= endStr;
      })
      .slice(0, limit)
      .map((h: PipelineNewsItem): NewsItem => ({
        title: h.title || 'No title',
        url: h.url || '',
        source: h.source || 'Unknown',
        publishedAt: h.publishedAt || new Date().toISOString(),
        summary: h.summary || undefined,
      }));
    
    return news;
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('finnhub', error?.message || 'finnhub news fetch failed', 0);
  }
}

/**
 * Webz.io news provider
 */
export async function fetchNewsWebz(config: MarketProviderConfig): Promise<NewsItem[]> {
  const { ticker, start, end, limit = 50, traceId } = config;
  
  if (!ENV.WEBZ_API_KEY) {
    throw notConfigured('webz');
  }
  
  try {
    const query = `${ticker} OR ${ticker.toUpperCase()}`;
    const webzItems = await fetchWebzNews({
      query,
      size: limit,
      traceId: traceId || 'move-explainer',
    });
    
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const news: NewsItem[] = webzItems
      .filter(h => {
        if (!h.publishedAt) return false;
        const date = normalizeMarketDate(h.publishedAt);
        return date >= startStr && date <= endStr;
      })
      .slice(0, limit)
      .map((h): NewsItem => ({
        title: h.title || 'No title',
        url: h.url || '',
        source: h.source || 'Unknown',
        publishedAt: h.publishedAt || new Date().toISOString(),
        summary: h.summary || undefined,
      }));
    
    return news;
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('webz', error?.message || 'webz news fetch failed', 0);
  }
}

/**
 * Unified news provider with fallback chain
 */
export async function fetchNewsWithFallback(config: MarketProviderConfig): Promise<{
  news: NewsItem[];
  provider: string;
  warnings: string[];
}> {
  const { ticker, traceId } = config;
  const warnings: string[] = [];
  
  // Provider priority: Polygon > NewsAPI > Finnhub > Webz > Unified Pipeline
  
  const providers: Array<{ name: string; fn: () => Promise<NewsItem[]> }> = [];
  
  // 1. Polygon (if key available)
  if (ENV.POLYGON_API_KEY) {
    providers.push({
      name: 'polygon',
      fn: () => fetchNewsPolygon(config),
    });
  }
  
  // 2. NewsAPI (if key available)
  if (process.env.NEWSAPI_API_KEY || process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY) {
    providers.push({
      name: 'newsapi',
      fn: () => fetchNewsNewsAPI(config),
    });
  }
  
  // 3. Finnhub (if key available)
  if (ENV.FINNHUB_API_KEY) {
    providers.push({
      name: 'finnhub',
      fn: () => fetchNewsFinnhub(config),
    });
  }
  
  // 4. Webz (if key available)
  if (ENV.WEBZ_API_KEY) {
    providers.push({
      name: 'webz',
      fn: () => fetchNewsWebz(config),
    });
  }
  
  // 5. Unified pipeline (uses existing fallback chain)
  providers.push({
    name: 'unified',
    fn: async () => {
      const endDate = new Date(config.end);
      const startDate = new Date(config.start);
      const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      
      let range: '1D' | '1W' | '1M' | '3M' = '1M';
      if (daysDiff <= 7) range = '1W';
      else if (daysDiff <= 30) range = '1M';
      else range = '3M';
      
      const headlines = await fetchMarketHeadlinesLive({
        range,
        ticker,
        query: ticker ? `${ticker} OR ${ticker.toUpperCase()}` : '',
        limit: config.limit || 50,
        traceId: traceId || 'move-explainer',
      });
      
      const startStr = normalizeMarketDate(config.start);
      const endStr = normalizeMarketDate(config.end);
      
      return headlines.items
        .filter((h: PipelineNewsItem) => {
          if (!h.publishedAt) return false;
          const date = normalizeMarketDate(h.publishedAt);
          return date >= startStr && date <= endStr;
        })
        .slice(0, config.limit || 50)
        .map((h: PipelineNewsItem): NewsItem => ({
          title: h.title || 'No title',
          url: h.url || '',
          source: h.source || 'Unknown',
          publishedAt: h.publishedAt || new Date().toISOString(),
          summary: h.summary || undefined,
        }));
    },
  });
  
  // Try providers in order
  for (const provider of providers) {
    try {
      const news = await provider.fn();
      
      if (news.length > 0) {
        return {
          news,
          provider: provider.name,
          warnings,
        };
      }
      
      warnings.push(`${provider.name}_no_results`);
    } catch (error: any) {
      warnings.push(`${provider.name}_failed:${error?.message || 'unknown'}`);
      // Continue to next provider
    }
  }
  
  // All providers failed - return empty array (graceful degradation)
  return {
    news: [],
    provider: 'none',
    warnings,
  };
}

