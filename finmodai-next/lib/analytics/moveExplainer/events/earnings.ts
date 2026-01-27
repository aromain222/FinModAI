/**
 * Earnings Events Enrichment
 * Fetches earnings events from providers or infers from high-confidence news matching
 */

import { ENV } from '@/lib/env/server';
import { ProviderError, notConfigured, providerFailure } from '@/lib/providers/errors';
import { fetchWithTimeout } from '@/lib/providers/utils';
import type { EventItem } from '../types';
import { normalizeMarketDate } from '../providers/registry';

export type EarningsEvent = EventItem & {
  type: 'earnings';
  source: 'polygon' | 'fmp' | 'news-detected';
  fiscalQuarter?: string;
  fiscalYear?: string;
  epsActual?: number;
  epsEstimate?: number;
  revenueActual?: number;
  revenueEstimate?: number;
};

/**
 * High-confidence keywords for earnings detection from news
 */
const EARNINGS_KEYWORDS = [
  'earnings',
  'eps',
  'revenue',
  'guidance',
  'beat',
  'miss',
  'surprise',
  'quarterly results',
  'q1', 'q2', 'q3', 'q4',
  'fiscal quarter',
  'earnings per share',
  'earnings call',
  'earnings report',
];

/**
 * Confidence scoring for earnings detection from news
 */
function scoreEarningsConfidence(
  title: string,
  summary?: string
): { score: number; reasons: string[] } {
  const text = (title + ' ' + (summary || '')).toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  
  // Strong indicators (higher weight)
  if (text.includes('earnings') && (text.includes('beat') || text.includes('miss') || text.includes('surprise'))) {
    score += 30;
    reasons.push('earnings_with_result');
  }
  
  if (text.includes('eps') && (text.includes('beat') || text.includes('miss'))) {
    score += 25;
    reasons.push('eps_with_result');
  }
  
  if (text.includes('revenue') && (text.includes('beat') || text.includes('miss'))) {
    score += 25;
    reasons.push('revenue_with_result');
  }
  
  // Quarterly indicators
  if ((text.includes('q1') || text.includes('q2') || text.includes('q3') || text.includes('q4')) && 
      (text.includes('results') || text.includes('report') || text.includes('earnings'))) {
    score += 20;
    reasons.push('quarterly_results');
  }
  
  // Guidance updates
  if (text.includes('guidance') && (text.includes('raised') || text.includes('lowered') || text.includes('revised'))) {
    score += 20;
    reasons.push('guidance_update');
  }
  
  // Earnings call/report mentions
  if (text.includes('earnings call') || text.includes('earnings report')) {
    score += 15;
    reasons.push('earnings_call_mention');
  }
  
  // Basic earnings mentions (lower weight)
  if (text.includes('earnings')) {
    score += 10;
    reasons.push('earnings_mention');
  }
  
  return { score, reasons };
}

/**
 * Extract earnings events from news items
 * Only includes high-confidence matches
 */
export function inferEarningsFromNews(
  news: Array<{ title: string; url?: string; source?: string; publishedAt: string; summary?: string }>,
  ticker: string
): EarningsEvent[] {
  const earningsEvents: EarningsEvent[] = [];
  const minConfidenceScore = 30; // Only include high-confidence matches
  
  for (const item of news) {
    const { score, reasons } = scoreEarningsConfidence(item.title, item.summary);
    
    if (score >= minConfidenceScore) {
      const date = normalizeMarketDate(item.publishedAt);
      
      // Try to extract quarter/year from text
      const text = (item.title + ' ' + (item.summary || '')).toLowerCase();
      let fiscalQuarter: string | undefined;
      let fiscalYear: string | undefined;
      
      // Match Q1/Q2/Q3/Q4 patterns
      const quarterMatch = text.match(/q[1-4]/i);
      if (quarterMatch) {
        fiscalQuarter = quarterMatch[0].toUpperCase();
      }
      
      // Match year patterns (2024, 2025, etc.)
      const yearMatch = text.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        fiscalYear = yearMatch[1];
      }
      
      earningsEvents.push({
        type: 'earnings',
        title: item.title,
        date,
        url: item.url,
        source: 'news-detected',
        fiscalQuarter,
        fiscalYear,
      });
    }
  }
  
  return earningsEvents;
}

/**
 * Fetch earnings events from Polygon
 */
export async function fetchEarningsPolygon(
  ticker: string,
  start: string,
  end: string
): Promise<EarningsEvent[]> {
  if (!ENV.POLYGON_API_KEY) {
    throw notConfigured('polygon');
  }
  
  try {
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
    
    const events: EarningsEvent[] = results
      .filter((item: any) => {
        if (!item.date) return false;
        const date = normalizeMarketDate(item.date);
        return date >= startStr && date <= endStr;
      })
      .map((item: any): EarningsEvent => ({
        type: 'earnings',
        title: `Earnings: ${ticker} Q${item.fiscal_quarter || ''} ${item.fiscal_year || ''}`,
        date: normalizeMarketDate(item.date),
        source: 'polygon',
        fiscalQuarter: item.fiscal_quarter ? `Q${item.fiscal_quarter}` : undefined,
        fiscalYear: item.fiscal_year ? String(item.fiscal_year) : undefined,
        epsActual: typeof item.eps === 'number' ? item.eps : undefined,
        epsEstimate: typeof item.eps_est === 'number' ? item.eps_est : undefined,
        revenueActual: typeof item.revenue === 'number' ? item.revenue : undefined,
        revenueEstimate: typeof item.revenue_est === 'number' ? item.revenue_est : undefined,
      }));
    
    return events;
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('polygon', error?.message || 'polygon earnings fetch failed', 0);
  }
}

/**
 * Get earnings events with provider fallback
 */
export async function getEarningsEvents(
  ticker: string,
  start: string,
  end: string,
  newsFallback?: Array<{ title: string; url?: string; source?: string; publishedAt: string; summary?: string }>
): Promise<EarningsEvent[]> {
  const allEvents: EarningsEvent[] = [];
  
  // 1. Try Polygon (authoritative)
  if (ENV.POLYGON_API_KEY) {
    try {
      const polygonEvents = await fetchEarningsPolygon(ticker, start, end);
      if (polygonEvents.length > 0) {
        allEvents.push(...polygonEvents);
      }
    } catch (error: any) {
      // Continue to fallback
      console.warn(`[Earnings] Polygon failed: ${error?.message}`);
    }
  }
  
  // 2. Infer from news (if no authoritative data or as supplement)
  if (newsFallback && newsFallback.length > 0) {
    const inferredEvents = inferEarningsFromNews(newsFallback, ticker);
    
    // Deduplicate with existing events (by date)
    const existingDates = new Set(allEvents.map(e => e.date));
    const uniqueInferred = inferredEvents.filter(e => !existingDates.has(e.date));
    
    allEvents.push(...uniqueInferred);
  }
  
  return allEvents.sort((a, b) => a.date.localeCompare(b.date));
}

