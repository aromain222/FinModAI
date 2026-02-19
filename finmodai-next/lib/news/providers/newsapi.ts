import { createHash } from 'crypto';
import { z } from 'zod';
import { normalizedNewsItemSchema, type NewsRange, type NewsTopic, type NormalizedNewsItem } from '@/lib/news/types';
import { rangeToFromISO } from '@/lib/news/providers/perigon';

const newsApiResponseSchema = z.object({
  status: z.string(),
  articles: z.array(
    z.object({
      source: z.object({ name: z.string().optional() }).optional(),
      title: z.string().optional(),
      description: z.string().nullable().optional(),
      url: z.string().url().optional(),
      publishedAt: z.string().datetime().optional(),
    })
  ),
});

const TOPIC_QUERY: Record<NewsTopic, string> = {
  all: '("Federal Reserve" OR CPI OR inflation OR "Treasury yields" OR recession OR jobs OR GDP OR oil OR OPEC OR "S&P 500" OR "bond market" OR "credit spreads" OR "central bank")',
  policy: '("Federal Reserve" OR ECB OR BoE OR "central bank" OR "rate decision" OR "policy statement")',
  rates: '("Treasury yields" OR "bond yields" OR "term premium" OR "auction" OR "Fed funds")',
  inflation: '(CPI OR inflation OR PCE OR "price pressures")',
  energy: '(oil OR WTI OR Brent OR OPEC OR "crude inventories" OR EIA)',
  fx: '(dollar OR DXY OR yen OR euro OR FX OR "currency")',
  equities: '("S&P 500" OR stocks OR "earnings" OR "risk-off" OR volatility OR VIX)',
};

function stableId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function topicTag(topic: NewsTopic): string[] {
  return topic === 'all' ? ['macro', 'markets'] : [topic];
}

function normalize(items: z.infer<typeof newsApiResponseSchema>['articles'], topic: NewsTopic): NormalizedNewsItem[] {
  const seen = new Set<string>();
  const output: NormalizedNewsItem[] = [];

  for (const raw of items) {
    const title = raw.title?.trim() || '';
    const url = raw.url?.trim() || '';
    if (!title || !url || seen.has(url)) continue;

    const parsed = normalizedNewsItemSchema.safeParse({
      id: stableId(url),
      source: raw.source?.name || 'NewsAPI',
      title,
      description: raw.description || null,
      url,
      published_at: raw.publishedAt || new Date().toISOString(),
      tags: topicTag(topic),
      ai_summary: null,
      affected_tickers: null,
      affected_sectors: null,
    });
    if (!parsed.success) continue;
    seen.add(url);
    output.push(parsed.data);
  }

  return output;
}

export async function fetchNewsApiHeadlines(params: {
  apiKey: string;
  range: NewsRange;
  topic: NewsTopic;
  limit: number;
  signal?: AbortSignal;
}): Promise<NormalizedNewsItem[]> {
  const query = TOPIC_QUERY[params.topic] || process.env.NEWS_DEFAULT_QUERY || TOPIC_QUERY.all;
  const from = rangeToFromISO(params.range);
  const qs = new URLSearchParams({
    q: query,
    from,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: String(params.limit),
    apiKey: params.apiKey,
  });

  const response = await fetch(`https://newsapi.org/v2/everything?${qs.toString()}`, {
    next: { revalidate: 300 },
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`NEWSAPI_HTTP_${response.status}`);
  }

  const payload = newsApiResponseSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new Error('NEWSAPI_SCHEMA_INVALID');
  }
  return normalize(payload.data.articles, params.topic).slice(0, params.limit);
}

