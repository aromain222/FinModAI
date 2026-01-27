import 'server-only';

import { normalizeTitle } from '@/lib/macro/normalize';
import { sourceQualityWeight } from '@/lib/market/topStories';

export type EventIntelRange = '1D' | '1W' | '1M';
export type EventIntelRegion = 'us' | 'global';

export type RawNewsItem = {
  id: string;
  title: string;
  summary?: string;
  source: string;
  url?: string;
  publishedAt: string;
  tickers?: string[];
};

export type NewsCluster = {
  id: string;
  items: RawNewsItem[];
  representative: RawNewsItem;
  sources: string[];
  headlineCount: number;
  score: number;
  tokens: Set<string>;
};

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

const STRONG_KEYWORDS = new Set([
  'earnings',
  'guidance',
  'rate',
  'rates',
  'cpi',
  'jobs',
  'war',
  'sanctions',
  'hurricane',
  'earthquake',
  'outage',
  'fda',
  'doj',
  'merger',
]);

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

function sharesStrongKeyword(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) {
    if (!STRONG_KEYWORDS.has(t)) continue;
    if (b.has(t)) return true;
  }
  return false;
}

function computeRecencyScore(publishedAtISO: string): number {
  const ts = Date.parse(publishedAtISO);
  if (!Number.isFinite(ts)) return 0;
  const ageHours = Math.max(0, (Date.now() - ts) / (60 * 60 * 1000));
  // 0..1 over 72 hours
  return Math.max(0, 72 - ageHours) / 72;
}

function clusterScore(cluster: { items: RawNewsItem[]; representative: RawNewsItem }): number {
  const size = cluster.items.length;
  const recency = computeRecencyScore(cluster.representative.publishedAt);
  const source = sourceQualityWeight(cluster.representative.source);
  // Heuristic: size dominates, then recency, then source quality.
  return size * 2.2 + recency * 1.4 + source;
}

function safeIso(iso: string): string {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

export function clusterNews(params: { items: RawNewsItem[]; threshold?: number }): NewsCluster[] {
  const threshold = typeof params.threshold === 'number' ? params.threshold : 0.35;
  const sorted = [...params.items]
    .map((item) => ({ ...item, publishedAt: safeIso(item.publishedAt) }))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  const clusters: Array<{
    id: string;
    items: RawNewsItem[];
    tokens: Set<string>;
  }> = [];

  for (const item of sorted) {
    const tokens = tokenize(item.title || '');
    if (!tokens.size) continue;

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < clusters.length; i += 1) {
      const candidate = clusters[i]!;
      const score = jaccard(tokens, candidate.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
      if (score >= threshold || sharesStrongKeyword(tokens, candidate.tokens)) {
        bestIdx = i;
        bestScore = Math.max(bestScore, score);
        break;
      }
    }

    if (bestIdx >= 0 && (bestScore >= threshold || sharesStrongKeyword(tokens, clusters[bestIdx]!.tokens))) {
      const cluster = clusters[bestIdx]!;
      cluster.items.push(item);
      for (const t of tokens) cluster.tokens.add(t);
    } else {
      clusters.push({ id: item.id, items: [item], tokens });
    }
  }

  const normalized = clusters
    .map((cluster) => {
      const items = [...cluster.items].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
      const representative = items[0]!;
      const sources = Array.from(new Set(items.map((i) => i.source).filter(Boolean))).slice(0, 10);
      const score = clusterScore({ items, representative });
      return {
        id: cluster.id || representative.id,
        items,
        representative,
        sources,
        headlineCount: items.length,
        score,
        tokens: cluster.tokens,
      } satisfies NewsCluster;
    })
    .sort((a, b) => b.score - a.score);

  return normalized;
}

function hashKey(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

export function clusterCacheKey(params: { cluster: NewsCluster; range: EventIntelRange; region: EventIntelRegion }): string {
  const rep = params.cluster.representative;
  const dateBucket = (rep.publishedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const base = `${params.range}|${params.region}|${dateBucket}|${rep.title || rep.id}`;
  return `event:intel:cluster:${hashKey(base)}`;
}

