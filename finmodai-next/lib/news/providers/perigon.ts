import { createHash } from 'crypto';
import { z } from 'zod';
import { normalizedNewsItemSchema, type NewsRange, type NewsTopic, type NormalizedNewsItem } from '@/lib/news/types';

const perigonResponseSchema = z.object({
  articles: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        title: z.string().optional(),
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

const TOPIC_QUERY: Record<NewsTopic, string> = {
  all: '("Federal Reserve" OR CPI OR inflation OR "Treasury yields" OR recession OR jobs OR GDP OR oil OR OPEC OR "S&P 500" OR "bond market" OR "credit spreads" OR "central bank")',
  policy: '("Federal Reserve" OR ECB OR BoE OR "central bank" OR "rate decision" OR "policy statement")',
  rates: '("Treasury yields" OR "bond yields" OR "term premium" OR "auction" OR "Fed funds")',
  inflation: '(CPI OR inflation OR PCE OR "price pressures")',
  energy: '(oil OR WTI OR Brent OR OPEC OR "crude inventories" OR EIA)',
  fx: '(dollar OR DXY OR yen OR euro OR FX OR "currency")',
  equities: '("S&P 500" OR stocks OR "earnings" OR "risk-off" OR volatility OR VIX)',
};

const RANGE_HOURS: Record<NewsRange, number> = {
  '1D': 24,
  '3D': 72,
  '1W': 24 * 7,
  '1M': 24 * 30,
};

export function rangeToFromISO(range: NewsRange): string {
  const dt = new Date();
  dt.setHours(dt.getHours() - RANGE_HOURS[range]);
  return dt.toISOString();
}

function stableId(id: string | number | undefined, url: string): string {
  if (id !== undefined && id !== null && String(id).trim()) return String(id);
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function topicTag(topic: NewsTopic): string[] {
  return topic === 'all' ? ['macro', 'markets'] : [topic];
}

function normalize(items: z.infer<typeof perigonResponseSchema>['articles'], topic: NewsTopic): NormalizedNewsItem[] {
  const seen = new Set<string>();
  const output: NormalizedNewsItem[] = [];
  for (const raw of items ?? []) {
    const title = raw.title?.trim() || '';
    const url = raw.url?.trim() || '';
    if (!title || !url || seen.has(url)) continue;
    const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : null;
    const publishedIso =
      publishedAt && !Number.isNaN(publishedAt.getTime())
        ? publishedAt.toISOString()
        : new Date().toISOString();

    const parsed = normalizedNewsItemSchema.safeParse({
      id: stableId(raw.id, url),
      source: raw.source || raw.sourceDomain || 'Perigon',
      title,
      description: raw.summary || raw.description || null,
      url,
      published_at: publishedIso,
      tags: raw.categories ?? topicTag(topic),
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

export async function fetchPerigonHeadlines(params: {
  apiKey: string;
  range: NewsRange;
  topic: NewsTopic;
  limit: number;
  signal?: AbortSignal;
}): Promise<NormalizedNewsItem[]> {
  const query = TOPIC_QUERY[params.topic] || process.env.NEWS_DEFAULT_QUERY || TOPIC_QUERY.all;
  const from = rangeToFromISO(params.range);
  const qs = new URLSearchParams({
    apiKey: params.apiKey,
    q: query,
    from,
    sortBy: 'date',
    size: String(params.limit),
  });

  const response = await fetch(`https://api.goperigon.com/v1/all?${qs.toString()}`, {
    next: { revalidate: 300 },
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`PERIGON_HTTP_${response.status}`);
  }

  const payload = perigonResponseSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new Error('PERIGON_SCHEMA_INVALID');
  }
  return normalize(payload.data.articles, params.topic).slice(0, params.limit);
}

