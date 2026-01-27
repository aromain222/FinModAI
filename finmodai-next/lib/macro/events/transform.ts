/**
 * Macro Events - deterministic transformation from raw news items.
 *
 * This module is import-safe for API route handlers:
 * - No server-action directives.
 * - Pure transformation + async enrichment (observed impact, optional AI synthesis).
 */

import type { NewsItem } from '@/lib/schemas/news';
import type { MacroEvent, RawNewsItem } from './types';
import { groupByCanonicalTitle, deduplicateToEvents } from './dedupe';

function convertToRawNewsItem(item: NewsItem): RawNewsItem {
  return {
    title: item.title || '',
    url: item.url || '',
    source: item.source || 'Unknown',
    publishedAt: item.publishedAt,
    summary: item.summary || '',
    topics: item.topics || [],
    tickers: item.tickers || [],
  };
}

export async function transformNewsToEvents(
  newsItems: NewsItem[],
  marketData?: { changePct?: number | null; points?: Array<{ t: string; close: number }> }
): Promise<MacroEvent[]> {
  if (!Array.isArray(newsItems) || newsItems.length === 0) return [];

  const rawItems: RawNewsItem[] = newsItems.map(convertToRawNewsItem);
  const groups = groupByCanonicalTitle(rawItems, 48);
  return await deduplicateToEvents(groups, marketData);
}
