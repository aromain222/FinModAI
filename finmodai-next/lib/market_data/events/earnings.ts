/**
 * Earnings Events Detection
 * Fetches earnings events from authoritative sources or infers from news
 */

import { ENV } from '@/lib/env/server';
import { fetchWithTimeout } from '@/lib/providers/utils';
import type { EventItem, NewsItem } from '../providers/types';
import { normalizeMarketDate } from '../providers/registry';

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
  'q1',
  'q2',
  'q3',
  'q4',
  'fiscal quarter',
  'earnings per share',
  'earnings call',
  'earnings report',
];

/**
 * Confidence scoring for earnings detection from news
 */
function scoreEarningsConfidence(title: string, summary?: string): { score: number; reasons: string[] } {
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
  if (
    (text.includes('q1') || text.includes('q2') || text.includes('q3') || text.includes('q4')) &&
    (text.includes('results') || text.includes('report') || text.includes('earnings'))
  ) {
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
 * Infer earnings events from news items
 * Only includes high-confidence matches (score >= 30)
 * NEVER fabricates earnings numbers - only uses what's in the news
 */
export function inferEarningsFromNews(news: NewsItem[], ticker: string): EventItem[] {
  const earningsEvents: EventItem[] = [];
  const minConfidenceScore = 30; // Only include high-confidence matches

  for (const item of news) {
    const { score } = scoreEarningsConfidence(item.title, item.summary);

    if (score >= minConfidenceScore) {
      const date = normalizeMarketDate(item.publishedAt);

      // Build title from news (never fabricate numbers)
      earningsEvents.push({
        type: 'earnings',
        title: item.title,
        date,
        url: item.url,
        source: 'news-detected',
      });
    }
  }

  return earningsEvents;
}

/**
 * Fetch earnings events from Polygon (authoritative source)
 */
export async function fetchEarningsPolygon(
  ticker: string,
  start: string,
  end: string
): Promise<EventItem[]> {
  if (!ENV.POLYGON_API_KEY) {
    throw new Error('Polygon API key not configured');
  }

  try {
    const url = `https://api.polygon.io/v2/reference/calendars/earnings?ticker=${encodeURIComponent(ticker)}&apiKey=${ENV.POLYGON_API_KEY}`;

    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 5000);

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error('Polygon rate limit exceeded');
      }
      throw new Error(`Polygon API HTTP ${res.status}`);
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
      .map((item: any): EventItem => {
        // Build title from authoritative data (never fabricate numbers)
        const fiscalInfo = item.fiscal_quarter && item.fiscal_year 
          ? `Q${item.fiscal_quarter} ${item.fiscal_year}`
          : '';
        const title = fiscalInfo 
          ? `Earnings: ${ticker} ${fiscalInfo}`
          : `Earnings: ${ticker}`;

        return {
          type: 'earnings',
          title,
          date: normalizeMarketDate(item.date),
          source: 'polygon',
        };
      });

    return events;
  } catch (error: any) {
    throw new Error(`Polygon earnings fetch failed: ${error?.message || String(error)}`);
  }
}

/**
 * Get earnings events with provider fallback
 * Prefers authoritative sources (Polygon), falls back to news inference
 */
export async function getEarningsEvents(
  ticker: string,
  start: string,
  end: string,
  newsFallback?: NewsItem[]
): Promise<EventItem[]> {
  const allEvents: EventItem[] = [];

  // 1. Try Polygon (authoritative source)
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
  // Label as "news-detected" to indicate it's inferred, not authoritative
  if (newsFallback && newsFallback.length > 0) {
    const inferredEvents = inferEarningsFromNews(newsFallback, ticker);

    // Deduplicate with existing events (by date)
    const existingDates = new Set(allEvents.map((e) => e.date));
    const uniqueInferred = inferredEvents.filter((e) => !existingDates.has(e.date));

    allEvents.push(...uniqueInferred);
  }

  return allEvents.sort((a, b) => a.date.localeCompare(b.date));
}

