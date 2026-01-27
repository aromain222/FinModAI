/**
 * Events Data Providers
 * Earnings dates, SEC filings, etc.
 */

import { ENV } from '@/lib/env/server';
import { ProviderError, notConfigured, providerFailure } from '@/lib/providers/errors';
import { fetchWithTimeout } from '@/lib/providers/utils';
import type { EventItem, MarketProviderConfig } from '../types';
import { normalizeMarketDate } from './registry';
import { getEarningsEvents } from '../events/earnings';
import { getSecFilings } from '../events/sec';

/**
 * Infer events from news items (fallback method)
 */
export function inferEventsFromNews(news: Array<{ title: string; url?: string; source?: string; publishedAt: string; summary?: string }>): EventItem[] {
  const events: EventItem[] = [];
  
  for (const item of news) {
    const titleLower = item.title.toLowerCase();
    const summaryLower = (item.summary || '').toLowerCase();
    const text = titleLower + ' ' + summaryLower;
    const date = normalizeMarketDate(item.publishedAt);
    
    let type: EventItem['type'] | null = null;
    
    // Earnings
    if (text.includes('earnings') || text.includes('eps') || 
        text.includes('q1') || text.includes('q2') || text.includes('q3') || text.includes('q4') ||
        text.includes('quarter') && (text.includes('results') || text.includes('report'))) {
      type = 'earnings';
    }
    // Guidance
    else if (text.includes('guidance') || text.includes('forecast') || text.includes('outlook') ||
             text.includes('raised') || text.includes('lowered') || text.includes('revises')) {
      type = 'guidance';
    }
    // SEC filings
    else if (text.includes('sec') || text.includes('10-k') || text.includes('10-q') || 
             text.includes('8-k') || text.includes('filing') || text.includes('form')) {
      type = 'filing';
    }
    // Analyst actions
    else if (text.includes('upgrade') || text.includes('downgrade') || text.includes('price target') || 
             text.includes('initiate') || text.includes('rating') || text.includes('analyst')) {
      type = 'analyst';
    }
    // Macro
    else if (text.includes('cpi') || text.includes('jobs report') || text.includes('fed') || 
             text.includes('interest rate') || text.includes('inflation') || text.includes('unemployment')) {
      type = 'macro';
    }
    
    if (type) {
      events.push({
        type,
        title: item.title,
        date,
        url: item.url,
        source: item.source || 'news-detected',
      });
    }
  }
  
  return events;
}

/**
 * Polygon earnings calendar provider
 */
export async function fetchEventsPolygon(config: MarketProviderConfig): Promise<EventItem[]> {
  const { ticker, start, end } = config;
  
  if (!ENV.POLYGON_API_KEY) {
    throw notConfigured('polygon');
  }
  
  try {
    // Polygon earnings calendar endpoint
    const url = `https://api.polygon.io/v2/reference/calendars/earnings?ticker=${encodeURIComponent(ticker)}&apiKey=${ENV.POLYGON_API_KEY}`;
    
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
    
    const events: EventItem[] = results
      .filter((item: any) => {
        if (!item.date) return false;
        const date = normalizeMarketDate(item.date);
        return date >= startStr && date <= endStr;
      })
      .map((item: any): EventItem => ({
        type: 'earnings',
        title: `Earnings: ${ticker} Q${item.fiscal_quarter || ''} ${item.fiscal_year || ''}`,
        date: normalizeMarketDate(item.date),
        source: 'polygon',
      }));
    
    return events;
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('polygon', error?.message || 'polygon events fetch failed', 0);
  }
}

/**
 * Unified events provider with fallback
 * Merges earnings + SEC filings + other events
 */
export async function fetchEventsWithFallback(
  config: MarketProviderConfig,
  newsFallback?: Array<{ title: string; url?: string; source?: string; publishedAt: string; summary?: string }>
): Promise<{
  events: EventItem[];
  provider: string;
  warnings: string[];
}> {
  const { ticker, start, end, traceId } = config;
  const warnings: string[] = [];
  const allEvents: EventItem[] = [];
  const providers: string[] = [];
  
  // 1. Fetch earnings events (with provider fallback)
  try {
    const earningsEvents = await getEarningsEvents(ticker, start, end, newsFallback);
    if (earningsEvents.length > 0) {
      allEvents.push(...earningsEvents);
      providers.push(earningsEvents[0]?.source === 'polygon' ? 'polygon' : 'news-inferred');
    }
  } catch (error: any) {
    warnings.push(`earnings_fetch_failed:${error?.message || 'unknown'}`);
  }
  
  // 2. Fetch SEC filings (with provider fallback)
  try {
    const secFilings = await getSecFilings(ticker, start, end, newsFallback);
    if (secFilings.length > 0) {
      allEvents.push(...secFilings);
      providers.push(secFilings[0]?.source === 'SEC' ? 'sec-edgar' : 'news-inferred');
    }
  } catch (error: any) {
    warnings.push(`sec_filings_failed:${error?.message || 'unknown'}`);
  }
  
  // 3. Infer other events from news (analyst actions, macro, guidance, etc.)
  if (newsFallback && newsFallback.length > 0) {
    const inferredEvents = inferEventsFromNews(newsFallback);
    
    // Filter out earnings/filings that are already captured
    const existingKeys = new Set(allEvents.map(e => `${e.date}:${e.type}`));
    const otherInferred = inferredEvents.filter(e => 
      !existingKeys.has(`${e.date}:${e.type}`) &&
      e.type !== 'earnings' &&
      e.type !== 'filing'
    );
    
    if (otherInferred.length > 0) {
      allEvents.push(...otherInferred);
      providers.push('news-inferred');
    }
  }
  
  const provider = providers.length > 0 ? providers.join('+') : 'none';
  
  return {
    events: allEvents.sort((a, b) => a.date.localeCompare(b.date)),
    provider,
    warnings,
  };
}

