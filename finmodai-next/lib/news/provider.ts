import { createHash } from 'crypto';
import { z } from 'zod';
import { headlineItemSchema, newsRangeSchema, newsTopicSchema, type HeadlineItem, type NewsRange, type NewsTopic } from '@/lib/news/types';

type HeadlinesProvider = 'perigon' | 'newsapi' | 'none';

type HeadlinesPayload = {
  items: HeadlineItem[];
  provider: HeadlinesProvider;
  error?: string;
};

const RANGE_DAYS: Record<NewsRange, number> = {
  '1D': 1,
  '3D': 3,
  '1W': 7,
  '1M': 30,
};

const TOPIC_QUERY: Record<NewsTopic, string> = {
  all: '("Federal Reserve" OR CPI OR inflation OR "Treasury yields" OR recession OR jobs OR GDP OR oil OR OPEC OR "S&P 500" OR "bond market" OR "credit spreads" OR "central bank")',
  policy: '("Federal Reserve" OR ECB OR BoE OR "central bank" OR "rate decision" OR "policy statement")',
  rates: '("Treasury yields" OR "bond yields" OR "term premium" OR "auction" OR "Fed funds")',
  inflation: '(CPI OR inflation OR PCE OR "price pressures")',
  energy: '(oil OR WTI OR Brent OR OPEC OR "crude inventories" OR EIA)',
  fx: '(dollar OR DXY OR yen OR euro OR FX OR "currency")',
  equities: '("S&P 500" OR stocks OR "earnings" OR "risk-off" OR volatility OR VIX)',
};

const perigonResponseSchema = z.object({
  articles: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        title: z.string(),
        url: z.string().url().optional(),
        publishedAt: z.string().optional(),
        description: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
        source: z.string().optional(),
        sourceDomain: z.string().optional(),
        categories: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

const newsApiResponseSchema = z.object({
  status: z.string(),
  articles: z.array(
    z.object({
      source: z.object({ name: z.string().optional() }).optional(),
      title: z.string(),
      description: z.string().nullable().optional(),
      url: z.string().url(),
      publishedAt: z.string().datetime(),
    })
  ),
});

const MEMORY_TTL_MS = 60_000;
const memoryCache = new Map<string, { ts: number; payload: HeadlinesPayload }>();
const inFlight = new Map<string, Promise<HeadlinesPayload>>();

function cacheKey(range: NewsRange, topic: NewsTopic, limit: number) {
  return `${range}:${topic}:${limit}`;
}

function stableId(id: string | number | undefined, url: string): string {
  if (id !== undefined && id !== null && String(id).trim()) return String(id);
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function startIsoForRange(range: NewsRange): string {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() - RANGE_DAYS[range]);
  return dt.toISOString();
}

function topicQuery(topic: NewsTopic): string {
  return TOPIC_QUERY[topic] || process.env.NEWS_DEFAULT_QUERY || TOPIC_QUERY.all;
}

function topicTag(topic: NewsTopic): string[] {
  return topic === 'all' ? ['macro', 'markets'] : [topic];
}

function normalizeAndDedupe(items: HeadlineItem[]): HeadlineItem[] {
  const seen = new Set<string>();
  const deduped: HeadlineItem[] = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }
  return deduped;
}

function normalizePerigon(items: z.infer<typeof perigonResponseSchema>['articles'], topic: NewsTopic): HeadlineItem[] {
  const mapped = (items ?? [])
    .map((item) => {
      const rawUrl = item.url?.trim() || '';
      if (!rawUrl || !item.title?.trim()) return null;
      const parsedPublishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
      const publishedAt =
        parsedPublishedAt && !Number.isNaN(parsedPublishedAt.getTime())
          ? parsedPublishedAt.toISOString()
          : new Date().toISOString();
      const parsed = headlineItemSchema.safeParse({
        id: stableId(item.id, rawUrl),
        source: item.source || item.sourceDomain || 'Perigon',
        title: item.title,
        description: item.summary || item.description || null,
        url: rawUrl,
        published_at: publishedAt,
        tags: item.categories ?? topicTag(topic),
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((item): item is HeadlineItem => item !== null);
  return normalizeAndDedupe(mapped);
}

function normalizeNewsApi(items: z.infer<typeof newsApiResponseSchema>['articles'], topic: NewsTopic): HeadlineItem[] {
  const mapped = items
    .map((item) =>
      headlineItemSchema.safeParse({
        id: stableId(undefined, item.url),
        source: item.source?.name || 'NewsAPI',
        title: item.title,
        description: item.description ?? null,
        url: item.url,
        published_at: item.publishedAt,
        tags: topicTag(topic),
      })
    )
    .filter((entry): entry is { success: true; data: HeadlineItem } => entry.success)
    .map((entry) => entry.data);
  return normalizeAndDedupe(mapped);
}

async function fetchPerigon(range: NewsRange, topic: NewsTopic, limit: number): Promise<HeadlineItem[] | null> {
  const apiKey = process.env.PERIGON_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    apiKey,
    q: topicQuery(topic),
    from: startIsoForRange(range),
    sortBy: 'date',
    size: String(limit),
  });

  const response = await fetch(`https://api.goperigon.com/v1/all?${params.toString()}`, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    console.error('[news/provider] Perigon request failed', { status: response.status });
    return null;
  }

  const parsed = perigonResponseSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  return normalizePerigon(parsed.data.articles, topic).slice(0, limit);
}

async function fetchNewsApi(range: NewsRange, topic: NewsTopic, limit: number): Promise<HeadlineItem[] | null> {
  const apiKey = process.env.NEWSAPI_KEY || '';
  if (!apiKey) return null;

  const params = new URLSearchParams({
    q: topicQuery(topic),
    language: 'en',
    sortBy: 'publishedAt',
    from: startIsoForRange(range),
    pageSize: String(limit),
    apiKey,
  });

  const response = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    console.error('[news/provider] NewsAPI request failed', { status: response.status });
    return null;
  }

  const parsed = newsApiResponseSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  return normalizeNewsApi(parsed.data.articles, topic).slice(0, limit);
}

export function parseNewsRange(value: string | null): NewsRange {
  const parsed = newsRangeSchema.safeParse((value || '3D').toUpperCase());
  return parsed.success ? parsed.data : '3D';
}

export function parseNewsTopic(value: string | null): NewsTopic {
  const parsed = newsTopicSchema.safeParse((value || 'all').toLowerCase());
  return parsed.success ? parsed.data : 'all';
}

export function parseNewsLimit(value: string | null, defaultValue = 20): number {
  const parsed = Number(value || String(defaultValue));
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export async function getHeadlines(params: {
  range: NewsRange;
  topic: NewsTopic;
  limit: number;
}): Promise<HeadlinesPayload> {
  const { range, topic, limit } = params;
  const key = cacheKey(range, topic, limit);
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.ts < MEMORY_TTL_MS) {
    return cached.payload;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const requestPromise = (async (): Promise<HeadlinesPayload> => {
    const perigonItems = await fetchPerigon(range, topic, limit);
    if (perigonItems && perigonItems.length > 0) {
      return { items: perigonItems, provider: 'perigon' };
    }

    const newsApiItems = await fetchNewsApi(range, topic, limit);
    if (newsApiItems && newsApiItems.length > 0) {
      return { items: newsApiItems, provider: 'newsapi' };
    }

    if (!process.env.PERIGON_API_KEY && !process.env.NEWSAPI_KEY) {
      return { items: [], provider: 'none', error: 'No news provider configured' };
    }
    return { items: [], provider: 'none', error: 'News provider request failed' };
  })();

  inFlight.set(key, requestPromise);
  try {
    const payload = await requestPromise;
    memoryCache.set(key, { ts: Date.now(), payload });
    return payload;
  } finally {
    inFlight.delete(key);
  }
}

