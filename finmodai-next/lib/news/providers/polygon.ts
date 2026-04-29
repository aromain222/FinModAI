import { createHash } from 'crypto';
import { z } from 'zod';
import { normalizedNewsItemSchema, type NewsRange, type NewsTopic, type NormalizedNewsItem } from '@/lib/news/types';

const RANGE_HOURS: Record<NewsRange, number> = {
  '1D': 24,
  '3D': 72,
  '1W': 168,
  '1M': 720,
};

// Polygon lets you filter by ticker keywords — map topics to relevant search terms
const TOPIC_KEYWORDS: Record<NewsTopic, string | null> = {
  all: null,         // no keyword filter — fetch broad market news
  policy: null,
  rates: null,
  inflation: null,
  energy: null,
  fx: null,
  equities: null,
};

const polygonArticleSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  article_url: z.string().url().optional(),
  image_url: z.string().optional(),
  published_utc: z.string().optional(),
  publisher: z.object({ name: z.string().optional() }).optional(),
  tickers: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  // insights only on paid tier — tolerate absence
  insights: z
    .array(
      z.object({
        ticker: z.string(),
        sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
        sentiment_reasoning: z.string().optional(),
      })
    )
    .optional(),
});

type PolygonArticle = z.infer<typeof polygonArticleSchema>;

function stableId(id: string | undefined, url: string): string {
  if (id?.trim()) return `poly-${id}`;
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function topicTag(topic: NewsTopic): string[] {
  return topic === 'all' ? ['macro', 'markets'] : [topic];
}

// Polygon insight sentiment → NormalizedNewsItem direction hint via tag
function insightTags(insights: PolygonArticle['insights']): string[] {
  if (!insights || insights.length === 0) return [];
  return insights
    .filter((i) => i.sentiment && i.sentiment !== 'neutral')
    .map((i) => `sentiment:${i.ticker}:${i.sentiment}`);
}

function normalize(items: PolygonArticle[], topic: NewsTopic): NormalizedNewsItem[] {
  const seen = new Set<string>();
  const output: NormalizedNewsItem[] = [];

  for (const raw of items) {
    const title = raw.title?.trim() ?? '';
    const url = raw.article_url?.trim() ?? '';
    if (!title || !url || seen.has(url)) continue;

    const tickers = (raw.tickers ?? []).filter((t) => t.length <= 5);
    const tags = [
      ...topicTag(topic),
      ...(raw.keywords ?? []).slice(0, 3),
      ...insightTags(raw.insights),
    ];

    const parsed = normalizedNewsItemSchema.safeParse({
      id: stableId(raw.id, url),
      source: raw.publisher?.name ?? 'Polygon',
      title,
      description: raw.description ?? null,
      url,
      published_at: raw.published_utc
        ? new Date(raw.published_utc).toISOString()
        : new Date().toISOString(),
      tags,
      ai_summary: null,
      affected_tickers: tickers.length > 0 ? tickers.slice(0, 5) : null,
      affected_sectors: null,
    });

    if (!parsed.success) continue;
    seen.add(url);
    output.push(parsed.data);
  }

  return output;
}

export async function fetchPolygonHeadlines(params: {
  apiKey: string;
  range: NewsRange;
  topic: NewsTopic;
  limit: number;
  signal?: AbortSignal;
}): Promise<NormalizedNewsItem[]> {
  const fromMs = Date.now() - RANGE_HOURS[params.range] * 3_600_000;
  const fromIso = new Date(fromMs).toISOString();

  const qs = new URLSearchParams({
    apiKey: params.apiKey,
    limit: String(Math.min(params.limit, 50)),
    published_utc: fromIso,   // Polygon uses gte on this param name
    order: 'desc',
    sort: 'published_utc',
  });
  // Polygon docs: use "published_utc.gte" not "published_utc" for range filter
  const url = `https://api.polygon.io/v2/reference/news?${qs.toString().replace('published_utc=', 'published_utc.gte=')}`;

  const response = await fetch(url, {
    next: { revalidate: 300 },
    signal: params.signal,
  });

  if (response.status === 403) throw new Error('POLYGON_HTTP_403');
  if (!response.ok) throw new Error(`POLYGON_HTTP_${response.status}`);

  const payload = (await response.json()) as { results?: unknown[]; status?: string };

  if (!Array.isArray(payload.results)) return [];

  const articles = payload.results
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    .map((x) => polygonArticleSchema.safeParse(x))
    .filter((r): r is z.SafeParseSuccess<PolygonArticle> => r.success)
    .map((r) => r.data);

  return normalize(articles, params.topic).slice(0, params.limit);
}
