import { createHash } from 'crypto';
import { z } from 'zod';
import { normalizedNewsItemSchema, type NewsRange, type NewsTopic, type NormalizedNewsItem } from '@/lib/news/types';

// Finnhub general-news categories that overlap with macro topics
const TOPIC_CATEGORY: Record<NewsTopic, string> = {
  all: 'general',
  policy: 'general',
  rates: 'forex',
  inflation: 'general',
  energy: 'general',
  fx: 'forex',
  equities: 'merger',
};

const RANGE_HOURS: Record<NewsRange, number> = {
  '1D': 24,
  '3D': 72,
  '1W': 168,
  '1M': 720,
};

const finnhubArticleSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  headline: z.string().optional(),
  summary: z.string().nullable().optional(),
  url: z.string().url().optional(),
  source: z.string().optional(),
  datetime: z.number().optional(),   // unix seconds
  image: z.string().optional(),
  category: z.string().optional(),
  related: z.string().optional(),    // ticker symbol if company-specific
});

type FinnhubArticle = z.infer<typeof finnhubArticleSchema>;

function stableId(id: string | number | undefined, url: string): string {
  if (id !== undefined && id !== null && String(id).trim()) return `fh-${id}`;
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function toIso(datetime: number | undefined): string {
  if (!datetime) return new Date().toISOString();
  const ms = datetime * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function topicTag(topic: NewsTopic): string[] {
  return topic === 'all' ? ['macro', 'markets'] : [topic];
}

function rangeToFromSec(range: NewsRange): number {
  const hours = RANGE_HOURS[range] ?? 72;
  return Math.floor((Date.now() - hours * 3_600_000) / 1000);
}

function normalize(items: FinnhubArticle[], topic: NewsTopic): NormalizedNewsItem[] {
  const seen = new Set<string>();
  const output: NormalizedNewsItem[] = [];

  for (const raw of items) {
    const title = raw.headline?.trim() ?? '';
    const url = raw.url?.trim() ?? '';
    if (!title || !url || seen.has(url)) continue;

    const tags: string[] = [...topicTag(topic)];
    if (raw.category) tags.push(raw.category);
    // If Finnhub tagged a specific ticker, surface it
    if (raw.related && /^[A-Z]{1,5}$/.test(raw.related)) tags.push(`ticker:${raw.related}`);

    const parsed = normalizedNewsItemSchema.safeParse({
      id: stableId(raw.id, url),
      source: raw.source ?? 'Finnhub',
      title,
      description: raw.summary ?? null,
      url,
      published_at: toIso(raw.datetime),
      tags,
      ai_summary: null,
      affected_tickers: raw.related && /^[A-Z]{1,5}$/.test(raw.related) ? [raw.related] : null,
      affected_sectors: null,
    });

    if (!parsed.success) continue;
    seen.add(url);
    output.push(parsed.data);
  }

  return output;
}

export async function fetchFinnhubHeadlines(params: {
  apiKey: string;
  range: NewsRange;
  topic: NewsTopic;
  limit: number;
  signal?: AbortSignal;
}): Promise<NormalizedNewsItem[]> {
  const category = TOPIC_CATEGORY[params.topic] ?? 'general';
  const minDateSec = rangeToFromSec(params.range);

  const qs = new URLSearchParams({
    category,
    minId: '0',
    token: params.apiKey,
  });

  const response = await fetch(`https://finnhub.io/api/v1/news?${qs.toString()}`, {
    next: { revalidate: 300 },
    signal: params.signal,
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`FINNHUB_HTTP_${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`FINNHUB_HTTP_${response.status}`);
  }

  const payload: unknown = await response.json();
  const rawItems = Array.isArray(payload)
    ? payload.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    : [];

  const articles: FinnhubArticle[] = rawItems
    .map((item) => finnhubArticleSchema.safeParse(item))
    .filter((r): r is z.SafeParseSuccess<FinnhubArticle> => r.success)
    .map((r) => r.data)
    // filter to the requested time window
    .filter((a) => !a.datetime || a.datetime >= minDateSec);

  return normalize(articles, params.topic).slice(0, params.limit);
}
