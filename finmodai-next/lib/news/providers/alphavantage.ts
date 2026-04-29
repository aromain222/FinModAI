import { createHash } from 'crypto';
import { z } from 'zod';
import { normalizedNewsItemSchema, type NewsRange, type NewsTopic, type NormalizedNewsItem } from '@/lib/news/types';

// Alpha Vantage topic strings → map our topics
const TOPIC_MAP: Record<NewsTopic, string> = {
  all: 'financial_markets,economy_macro,economy_monetary,earnings',
  policy: 'economy_monetary,economy_fiscal',
  rates: 'economy_monetary',
  inflation: 'economy_monetary,economy_macro',
  energy: 'energy_transportation',
  fx: 'economy_monetary,financial_markets',
  equities: 'earnings,financial_markets',
};

const RANGE_HOURS: Record<NewsRange, number> = {
  '1D': 24,
  '3D': 72,
  '1W': 168,
  '1M': 720,
};

// Alpha Vantage time format: YYYYMMDDTHHMM
function toAvTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}

// AV published format: "20240101T120000"
function avTimeToIso(value: string): string {
  if (!value || value.length < 15) return new Date().toISOString();
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(9, 11);
  const min = value.slice(11, 13);
  const sec = value.slice(13, 15);
  const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// AV sentiment label → our Sentiment type
function avLabelToTag(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('bullish')) return 'sentiment:positive';
  if (l.includes('bearish')) return 'sentiment:negative';
  return 'sentiment:neutral';
}

const avArticleSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  time_published: z.string().optional(),
  summary: z.string().nullable().optional(),
  source: z.string().optional(),
  banner_image: z.string().optional(),
  overall_sentiment_score: z.number().optional(),
  overall_sentiment_label: z.string().optional(),
  ticker_sentiment: z
    .array(
      z.object({
        ticker: z.string(),
        relevance_score: z.string().optional(),
        ticker_sentiment_score: z.string().optional(),
        ticker_sentiment_label: z.string().optional(),
      })
    )
    .optional(),
  topics: z
    .array(z.object({ topic: z.string(), relevance_score: z.string().optional() }))
    .optional(),
});

type AvArticle = z.infer<typeof avArticleSchema>;

function stableId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function topicTag(topic: NewsTopic): string[] {
  return topic === 'all' ? ['macro', 'markets'] : [topic];
}

function normalize(items: AvArticle[], topic: NewsTopic): NormalizedNewsItem[] {
  const seen = new Set<string>();
  const output: NormalizedNewsItem[] = [];

  for (const raw of items) {
    const title = raw.title?.trim() ?? '';
    const url = raw.url?.trim() ?? '';
    if (!title || !url || seen.has(url)) continue;

    // Surface high-relevance tickers (relevance_score > 0.3)
    const tickers = (raw.ticker_sentiment ?? [])
      .filter((t) => parseFloat(t.relevance_score ?? '0') > 0.3 && /^[A-Z]{1,5}$/.test(t.ticker))
      .sort((a, b) => parseFloat(b.relevance_score ?? '0') - parseFloat(a.relevance_score ?? '0'))
      .map((t) => t.ticker)
      .slice(0, 5);

    const sentimentTag = raw.overall_sentiment_label ? avLabelToTag(raw.overall_sentiment_label) : null;
    const tags = [
      ...topicTag(topic),
      ...(sentimentTag ? [sentimentTag] : []),
    ];

    // Ticker-level sentiment tags for top 3 tickers
    for (const t of (raw.ticker_sentiment ?? []).slice(0, 3)) {
      if (t.ticker_sentiment_label) {
        tags.push(`sentiment:${t.ticker}:${avLabelToTag(t.ticker_sentiment_label).replace('sentiment:', '')}`);
      }
    }

    const parsed = normalizedNewsItemSchema.safeParse({
      id: stableId(url),
      source: raw.source ?? 'Alpha Vantage',
      title,
      description: raw.summary ?? null,
      url,
      published_at: avTimeToIso(raw.time_published ?? ''),
      tags,
      ai_summary: null,
      affected_tickers: tickers.length > 0 ? tickers : null,
      affected_sectors: null,
    });

    if (!parsed.success) continue;
    seen.add(url);
    output.push(parsed.data);
  }

  return output;
}

export async function fetchAlphaVantageHeadlines(params: {
  apiKey: string;
  range: NewsRange;
  topic: NewsTopic;
  limit: number;
  signal?: AbortSignal;
}): Promise<NormalizedNewsItem[]> {
  const fromMs = Date.now() - RANGE_HOURS[params.range] * 3_600_000;
  const topics = TOPIC_MAP[params.topic] ?? TOPIC_MAP.all;

  const qs = new URLSearchParams({
    function: 'NEWS_SENTIMENT',
    topics,
    time_from: toAvTime(fromMs),
    limit: String(Math.min(params.limit, 200)),
    sort: 'LATEST',
    apikey: params.apiKey,
  });

  const response = await fetch(
    `https://www.alphavantage.co/query?${qs.toString()}`,
    { next: { revalidate: 300 }, signal: params.signal }
  );

  if (!response.ok) throw new Error(`ALPHAVANTAGE_HTTP_${response.status}`);

  const payload = (await response.json()) as { feed?: unknown[]; Information?: string; Note?: string };

  // AV returns a plain string in "Information" or "Note" when rate-limited
  if (typeof payload.Information === 'string' || typeof payload.Note === 'string') {
    throw new Error('ALPHAVANTAGE_RATE_LIMITED');
  }

  if (!Array.isArray(payload.feed)) return [];

  const articles = payload.feed
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    .map((x) => avArticleSchema.safeParse(x))
    .filter((r): r is z.SafeParseSuccess<AvArticle> => r.success)
    .map((r) => r.data);

  return normalize(articles, params.topic).slice(0, params.limit);
}
