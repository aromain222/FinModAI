/**
 * NewsAPI Provider
 * Requires NEWSAPI_API_KEY environment variable
 */

import { ENV } from '@/lib/env/server';
import { fetchWithTimeout } from '@/lib/providers/utils';
import type { NewsItem, NewsSearchParams } from '../types';
import { normalizeNewsItems, normalizeMarketDate } from '../registry';

/**
 * NewsAPI provider implementation
 */
export async function fetchNewsNewsAPI(params: NewsSearchParams): Promise<NewsItem[]> {
  const { ticker, start, end, limit = 50 } = params;
  
  const apiKey = process.env.NEWSAPI_API_KEY || process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  if (!apiKey) {
    throw new Error('NewsAPI provider not configured: NEWSAPI_API_KEY missing');
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
        throw new Error('NewsAPI rate limit exceeded');
      }
      throw new Error(`NewsAPI HTTP ${res.status}`);
    }
    
    const json = await res.json();
    
    if (json.status === 'error') {
      throw new Error(json.message || 'NewsAPI error');
    }
    
    const articles = Array.isArray(json?.articles) ? json.articles : [];
    
    // Filter by date range
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const news: NewsItem[] = articles
      .filter((item: any) => {
        if (!item.title || !item.publishedAt) return false;
        const date = normalizeMarketDate(item.publishedAt);
        return date >= startStr && date <= endStr;
      })
      .slice(0, limit)
      .map((item: any): NewsItem => ({
        title: item.title || 'No title',
        url: item.url || '',
        source: item.source?.name || 'Unknown',
        publishedAt: new Date(item.publishedAt).toISOString(),
        summary: item.description || item.content,
      }));
    
    // Normalize and sort
    return normalizeNewsItems(news);
  } catch (error: any) {
    throw new Error(`NewsAPI provider failed: ${error?.message || String(error)}`);
  }
}

