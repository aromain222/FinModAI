import 'server-only';

import type { NewsItem } from '@/lib/schemas/news';
import { normalizeTitle } from '@/lib/macro/normalize';

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'and',
  'in',
  'on',
  'for',
  'with',
  'as',
  'at',
  'from',
  'after',
  'before',
  'amid',
  'says',
  'say',
  'report',
  'reports',
  'update',
  'live',
  'breaking',
  'stocks',
  'stock',
  'market',
  'markets',
  'shares',
  'futures',
  'price',
  'prices',
  'today',
]);

export function sourceQualityWeight(source: string): number {
  const s = (source || '').toLowerCase();
  if (s.includes('reuters')) return 1.35;
  if (s.includes('bloomberg')) return 1.35;
  if (s.includes('wsj') || s.includes('wall street journal')) return 1.25;
  if (s.includes('financial times') || s.includes('ft.com')) return 1.2;
  if (s.includes('cnbc')) return 1.15;
  if (s.includes('marketwatch')) return 1.1;
  return 1.0;
}

function tokenize(title: string): Set<string> {
  const tokens = normalizeTitle(title)
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => t.length >= 3);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function computeRecencyScore(publishedAtISO: string): number {
  const ts = Date.parse(publishedAtISO);
  if (!Number.isFinite(ts)) return 0.1;
  const ageMinutes = Math.max(0, (Date.now() - ts) / (60 * 1000));
  // Smooth decay: ~0.5 at 6 hours, ~0.2 at 18 hours.
  return Math.exp(-ageMinutes / 360);
}

function hasNumber(text: string): boolean {
  return /\b\d{1,3}(?:\.\d+)?%?\b/.test(text);
}

function specificityScore(item: NewsItem): number {
  const title = item.title || '';
  const summary = item.summary || '';
  const tickers = Array.isArray(item.tickers) ? item.tickers.filter((t) => typeof t === 'string' && t.trim()) : [];
  const text = `${title} ${summary}`.toLowerCase();

  let score = 0;
  if (tickers.length) score += 0.45;

  const keySignals = [
    // Earnings / company-specific
    'earnings',
    'guidance',
    'revenue',
    'eps',
    'profit',
    'forecast',
    'beats',
    'misses',
    'acquisition',
    'acquire',
    'merger',
    'deal',
    'lawsuit',
    'fda',
    'strike',
    'outage',
    // Macro / geopolitics (can move sectors)
    'rates',
    'inflation',
    'cpi',
    'jobs',
    'payrolls',
    'tariff',
    'sanctions',
    'opec',
  ];
  if (keySignals.some((w) => text.includes(w))) score += 0.25;

  if (hasNumber(text)) score += 0.15;

  // Entity-ish: all-caps ticker in parentheses, or $TICKER.
  if (/\$[A-Z]{1,5}\b/.test(title) || /\([A-Z]{1,5}\)/.test(title)) score += 0.15;

  return Math.min(1, score);
}

export function scoreHeadline(item: NewsItem): number {
  const recency = computeRecencyScore(item.publishedAt);
  const source = sourceQualityWeight(item.source);
  const spec = specificityScore(item);
  // Normalize to ~0..1.6
  return recency * 0.65 + (source / 1.35) * 0.2 + spec * 0.15;
}

export function selectTopStories(params: { items: NewsItem[]; limit: number; dedupeOverlap?: number }): NewsItem[] {
  const overlapThreshold = typeof params.dedupeOverlap === 'number' ? params.dedupeOverlap : 0.5;
  const scored = params.items
    .map((item) => ({ item, score: scoreHeadline(item), tokens: tokenize(item.title || '') }))
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ item: NewsItem; tokens: Set<string> }> = [];
  for (const row of scored) {
    if (selected.length >= params.limit) break;
    const tooSimilar = selected.some((s) => jaccard(s.tokens, row.tokens) >= overlapThreshold);
    if (tooSimilar) continue;
    selected.push({ item: row.item, tokens: row.tokens });
  }

  return selected.map((s) => s.item);
}
