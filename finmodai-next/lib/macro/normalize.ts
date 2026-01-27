import type { Region, Sentiment, Impact } from '@/lib/macro/sentiment';

export type MacroNewsItem = {
  id: string;
  title: string;
  source: string;
  url?: string;
  publishedAt: string;
  region?: Region;
  sentiment?: Sentiment;
  impact?: Impact;
  tags?: string[];
  summary?: string;
};

export const macroKeywords = [
  'inflation',
  'cpi',
  'unemployment',
  'jobs',
  'central bank',
  'interest rate',
  'rates',
  'federal reserve',
  'ecb',
  'boe',
  'boj',
  'gdp',
  'recession',
  'growth',
  'yield',
  'oil',
  'credit',
  'equity',
  'macro',
  'geopolitics',
  'tariff',
];

export const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

export const latestPublishedAt = (items: MacroNewsItem[]) => {
  const timestamps = items
    .map((item) => Date.parse(item.publishedAt))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
};

export const filterMacroItems = (items: MacroNewsItem[]) => {
  return items.filter((item) => {
    const haystack = `${item.title} ${item.summary ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase();
    return macroKeywords.some((word) => haystack.includes(word));
  });
};

export const dedupeItems = (items: MacroNewsItem[]) => {
  const seen = new Set<string>();
  const deduped: MacroNewsItem[] = [];
  for (const item of items) {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
};
