import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assessHeadlineRelevance, type RelevanceEventType } from '@/lib/news/relevance';
import { getMacroEventFallbackImage } from '@/lib/macroEventImageQueries';

export type NewsType = 'headlines' | 'events';
export type NewsRange = '1D' | '3D' | '1W' | '1M' | '3M';
export type ProviderName = 'perigon' | 'polygon' | 'alphavantage' | 'benzinga' | 'eodhd' | 'newsapi' | 'finnhub' | 'supabase' | 'demo' | 'none';
export type Direction = 'up' | 'down' | 'mixed' | 'unknown';
export type Confidence = 'high' | 'medium' | 'low';

export type HeadlineItem = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  published_at: string;
  imageUrl?: string;
  tags?: string[];
};

export type Sentiment = 'positive' | 'negative' | 'neutral';

export type ModelImpact = {
  revenue_growth_delta: number;
  margin_delta: number;
  discount_rate_delta: number;
  primary_driver: 'growth' | 'margin' | 'discount_rate';
  probability: number;
};

export type EventItem = {
  id: string;
  title: string;
  what_happened: string;
  ai_summary: string;
  why_it_matters: string;
  impacted_sectors: Array<{ sector: string; direction: Direction; rationale?: string }>;
  impacted_tickers: Array<{ ticker: string; direction: Direction; rationale?: string }>;
  watch_items: string[];
  sources: Array<{ source: string; title: string; url: string; published_at: string }>;
  confidence: Confidence;
  published_at: string;
  /** 0–1 importance score derived from confidence + event type + source count */
  impact_score?: number;
  /** Exponential time decay: exp(-hours_since_event / 6). 1.0 = just published, ~0.22 at 8h */
  time_decay_weight?: number;
  /** Directional sentiment derived from dominant impacted_tickers/sectors direction */
  sentiment?: Sentiment;
  /** Model-ready valuation assumption deltas — directly applicable to DCF/LBO inputs */
  model_impact?: ModelImpact;
  image_url?: string;
  image_thumb_url?: string;
  image_provider?: string;
  image_source_url?: string;
  image_author?: string;
  image_author_url?: string;
  image_query?: string;
  image_cached_at?: string;
  tags?: string[];
};

export type Params = {
  type: NewsType;
  range: NewsRange;
  tag: string;
  limit: number;
  fromIso: string;
  lookbackHours: number;
};

export type DemoTopic = 'policy' | 'rates' | 'inflation' | 'energy' | 'fx' | 'equities' | 'growth';

export type DemoScenario = {
  key: string;
  headline: string;
  eventTitle: string;
  description: string;
  source: string;
  url: string;
  topics: DemoTopic[];
  eventType: RelevanceEventType;
};

export type NewsResponse = {
  ok: true;
  provider: ProviderName;
  items: HeadlineItem[];
  meta: { ingested: number; fromSupabase: number; errors: string[] };
};

export type EventsResponse = {
  ok: true;
  provider: ProviderName;
  items: EventItem[];
  events: EventItem[];
  meta: { ingested: number; fromSupabase: number; errors: string[] };
};

export type RelevantHeadline = HeadlineItem & {
  relevance: ReturnType<typeof assessHeadlineRelevance>;
};

export const TYPE_VALUES: NewsType[] = ['headlines', 'events'];
export const RANGE_VALUES: NewsRange[] = ['1D', '3D', '1W', '1M', '3M'];
const RANGE_TO_HOURS: Record<NewsRange, number> = {
  '1D': 24,
  '3D': 72,
  '1W': 24 * 7,
  '1M': 24 * 30,
  '3M': 24 * 90,
};

const TOPIC_TO_QUERY: Record<string, string> = {
  all: 'Federal Reserve OR CPI OR inflation OR Treasury yields OR recession OR jobs OR GDP OR oil OR OPEC OR S&P 500 OR bond market OR central bank',
  policy: 'Federal Reserve OR ECB OR BoE OR central bank OR rate decision OR policy statement',
  rates: 'Treasury yields OR bond yields OR Fed funds OR term premium OR bond auction',
  inflation: 'CPI OR inflation OR PCE OR price pressures',
  energy: 'oil OR WTI OR Brent OR OPEC OR crude inventories',
  fx: 'dollar OR DXY OR yen OR euro OR FX OR currency',
  equities: 'S&P 500 OR stocks OR earnings OR risk-off OR volatility OR VIX',
  growth: 'AI infrastructure OR hyperscaler capex OR growth stocks OR software multiples OR semiconductor demand',
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    key: 'iran-israel-escalation-oil-shipping',
    headline: 'Escalation of Iran-Israel conflict raising risks to global oil supply and shipping routes',
    eventTitle: 'Middle East Escalation Raises Oil and Shipping Risk Premium',
    description:
      'Rising geopolitical tensions increased concern around energy supply disruption and maritime corridor stability, pushing investors toward inflation hedges and defensive positioning.',
    source: 'Demo Macro Feed',
    url: 'https://www.reuters.com/world/middle-east/',
    topics: ['energy', 'inflation', 'fx', 'equities'],
    eventType: 'geopolitics',
  },
  {
    key: 'nvidia-earnings-ai-infra-boom',
    headline: 'Nvidia earnings reinforcing the AI infrastructure spending boom',
    eventTitle: 'Nvidia Results Reinforce AI Infrastructure Capex Cycle',
    description:
      'Results and guidance pointed to sustained hyperscale and enterprise demand for accelerated compute, reinforcing AI-linked investment momentum across the semiconductor and data center stack.',
    source: 'Demo Macro Feed',
    url: 'https://www.cnbc.com/technology/',
    topics: ['equities'],
    eventType: 'equities',
  },
  {
    key: 'fed-fewer-cuts-elevated-expectations',
    headline: 'Federal Reserve signals fewer rate cuts as inflation expectations remain elevated',
    eventTitle: 'Fed Easing Path Repriced as Inflation Expectations Stay Sticky',
    description:
      'Policy communication indicated a slower easing cycle, with inflation expectations and services-price persistence reducing confidence in rapid rate normalization.',
    source: 'Demo Macro Feed',
    url: 'https://www.federalreserve.gov/monetarypolicy.htm',
    topics: ['policy', 'rates', 'inflation', 'fx'],
    eventType: 'policy',
  },
  {
    key: 'opec-tightening-supply-policy',
    headline: 'OPEC production policy tightening global oil supply',
    eventTitle: 'OPEC Supply Discipline Tightens Global Crude Balance',
    description:
      'Producer discipline and constrained incremental output supported a tighter oil balance, increasing the probability of higher energy prices feeding into inflation channels.',
    source: 'Demo Macro Feed',
    url: 'https://www.opec.org/opec_web/en/press_room.htm',
    topics: ['energy', 'inflation'],
    eventType: 'energy',
  },
  {
    key: 'us-china-ai-chip-restrictions',
    headline: 'U.S.-China semiconductor export restrictions expanding to advanced AI chips',
    eventTitle: 'Expanded AI Chip Controls Raise Supply Chain and Earnings Risk',
    description:
      'Broader export controls increased policy risk for semiconductor supply chains, with potential demand substitution, compliance costs, and cross-border tech fragmentation effects.',
    source: 'Demo Macro Feed',
    url: 'https://www.bis.doc.gov/',
    topics: ['policy', 'equities', 'fx'],
    eventType: 'geopolitics',
  },
  {
    key: 'hyperscaler-ai-datacenter-capex',
    headline: 'Major hyperscalers dramatically increasing AI data center capital expenditures',
    eventTitle: 'Hyperscaler AI Capex Surge Supports Multi-Year Infrastructure Cycle',
    description:
      'Capital spending plans from major cloud platforms signaled sustained demand for compute, networking, and power infrastructure tied to AI model training and inference growth.',
    source: 'Demo Macro Feed',
    url: 'https://www.bloomberg.com/technology',
    topics: ['equities', 'growth'],
    eventType: 'growth',
  },
];

export function withEventImageFallback<T extends EventItem>(event: T, categoryHint?: string | null): T {
  const category = categoryHint || event.tags?.[0] || event.title;
  const fallbackThumb = getMacroEventFallbackImage(category, 'thumb');
  const fallbackHero = getMacroEventFallbackImage(category, 'hero');
  return {
    ...event,
    image_url: event.image_url || fallbackHero,
    image_thumb_url: event.image_thumb_url || event.image_url || fallbackThumb,
  };
}

export function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeIso(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return nowIso();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
}

export function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
}

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function parseParams(request: NextRequest): { ok: true; value: Params } | { ok: false; details: Record<string, string> } {
  const typeRaw = (request.nextUrl.searchParams.get('type') || 'headlines').toLowerCase();
  const rangeRaw = (request.nextUrl.searchParams.get('range') || request.nextUrl.searchParams.get('timeframe') || '3D').toUpperCase();
  const tag = (request.nextUrl.searchParams.get('tag') || request.nextUrl.searchParams.get('topic') || 'all').trim().toLowerCase() || 'all';
  const limitRaw = request.nextUrl.searchParams.get('limit') || '20';
  const lookbackRaw = request.nextUrl.searchParams.get('lookback_hours');
  const details: Record<string, string> = {};

  const limit = Number.parseInt(limitRaw, 10);
  if (!TYPE_VALUES.includes(typeRaw as NewsType)) details.type = `invalid:${typeRaw}`;
  if (!RANGE_VALUES.includes(rangeRaw as NewsRange)) details.range = `invalid:${rangeRaw}`;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) details.limit = `invalid:${limitRaw}`;

  let lookbackHours = RANGE_TO_HOURS[(rangeRaw as NewsRange) || '3D'];
  if (lookbackRaw) {
    const parsedLookback = Number.parseInt(lookbackRaw, 10);
    if (!Number.isInteger(parsedLookback) || parsedLookback < 1 || parsedLookback > 24 * 365) {
      details.lookback_hours = `invalid:${lookbackRaw}`;
    } else if (!request.nextUrl.searchParams.get('timeframe') && !request.nextUrl.searchParams.get('range')) {
      lookbackHours = parsedLookback;
    }
  }

  if (Object.keys(details).length > 0) return { ok: false, details };

  const fromMs = Date.now() - lookbackHours * 60 * 60 * 1000;
  return {
    ok: true,
    value: {
      type: typeRaw as NewsType,
      range: rangeRaw as NewsRange,
      tag,
      limit,
      lookbackHours,
      fromIso: new Date(fromMs).toISOString(),
    },
  };
}

export function topicQuery(tag: string): string {
  return TOPIC_TO_QUERY[tag] || TOPIC_TO_QUERY.all;
}

export function isRealNewsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!host) return false;
    if (host === 'example.com' || host === 'www.example.com') return false;
    if (host.endsWith('.local')) return false;
    if (host === 'localhost' || host === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

export function dedupeHeadlines(items: HeadlineItem[]): HeadlineItem[] {
  const seen = new Set<string>();
  const output: HeadlineItem[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    output.push(item);
  }
  return output;
}

export function filterHeadlinesByFreshness(items: HeadlineItem[], fromIso: string): HeadlineItem[] {
  const threshold = new Date(fromIso).getTime();
  if (!Number.isFinite(threshold)) return items;
  return items.filter((item) => {
    const published = new Date(item.publishedAt).getTime();
    return Number.isFinite(published) && published >= threshold;
  });
}

export function filterEventsByFreshness(items: EventItem[], fromIso: string): EventItem[] {
  const threshold = new Date(fromIso).getTime();
  if (!Number.isFinite(threshold)) return items;
  return items.filter((item) => {
    const published = new Date(item.published_at).getTime();
    return Number.isFinite(published) && published >= threshold;
  });
}

export function evaluateRelevantHeadlines(items: HeadlineItem[], minScore: number): {
  accepted: RelevantHeadline[];
  droppedNoiseCount: number;
} {
  const scored: RelevantHeadline[] = items.map((item) => ({
    ...item,
    relevance: assessHeadlineRelevance({
      title: item.title,
      description: item.description,
      source: item.source,
      minScore,
    }),
  }));
  const droppedNoiseCount = scored.filter((item) => item.relevance.reasons.includes('noise:detected')).length;
  const accepted = scored
    .filter((item) => item.relevance.accepted && item.relevance.eventType !== 'other')
    .sort((a, b) => {
      if (b.relevance.score !== a.relevance.score) return b.relevance.score - a.relevance.score;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  return { accepted, droppedNoiseCount };
}

export function addRelevanceTags(item: RelevantHeadline): HeadlineItem {
  const { relevance, ...entry } = item;
  return {
    ...entry,
    tags: Array.from(new Set([...(entry.tags ?? []), relevance.eventType, `relevance:${relevance.score}`])),
  };
}

export function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

export function demoScenariosForTag(tag: string): DemoScenario[] {
  const normalized = tag.trim().toLowerCase();
  if (normalized === 'all') return DEMO_SCENARIOS;
  const filtered = DEMO_SCENARIOS.filter((scenario) => scenario.topics.includes(normalized as DemoTopic));
  return filtered.length > 0 ? filtered : DEMO_SCENARIOS;
}

export function demoPublishedAt(params: Params, index: number, total: number): string {
  const now = Date.now();
  const lookbackMs = Math.max(2, params.lookbackHours) * 60 * 60 * 1000;
  const slot = Math.max(30 * 60 * 1000, Math.floor(lookbackMs / Math.max(total + 1, 2)));
  const offset = Math.min(lookbackMs - 60_000, index * slot);
  return new Date(now - offset).toISOString();
}

export function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** Compute 0–1 impact score from confidence, source count, and event type. */
export function computeImpactScore(event: Pick<EventItem, 'confidence' | 'sources' | 'tags'>): number {
  const baseByConfidence: Record<Confidence, number> = { high: 0.75, medium: 0.50, low: 0.28 };
  let score = baseByConfidence[event.confidence] ?? 0.40;

  // Source corroboration bonus
  const uniqueSources = new Set(event.sources.map((s) => s.source.toLowerCase())).size;
  score += Math.min(uniqueSources * 0.04, 0.12);

  // High-signal event type bonus
  const highSignalTags = new Set(['policy', 'rates', 'inflation', 'earnings', 'geopolitics', 'energy', 'credit']);
  const tags = event.tags ?? [];
  if (tags.some((t) => highSignalTags.has(t.toLowerCase()))) score += 0.08;

  return Math.min(Math.round(score * 100) / 100, 1.0);
}

/** Exponential decay over 6-hour half-life. Returns 1.0 for fresh events, approaches 0 as age grows. */
export function computeTimeDecayWeight(publishedAt: string): number {
  const now = Date.now();
  const published = new Date(publishedAt).getTime();
  if (!Number.isFinite(published)) return 0.5;
  const hoursSince = Math.max(0, (now - published) / (1000 * 60 * 60));
  return Math.round(Math.exp(-hoursSince / 6) * 1000) / 1000;
}

/** Derive sentiment from the dominant direction of impacted tickers/sectors. */
export function computeSentiment(event: Pick<EventItem, 'impacted_tickers' | 'impacted_sectors'>): Sentiment {
  const items = [
    ...event.impacted_tickers.map((t) => t.direction),
    ...event.impacted_sectors.map((s) => s.direction),
  ];
  let up = 0;
  let down = 0;
  for (const d of items) {
    if (d === 'up') up++;
    else if (d === 'down') down++;
  }
  if (up === 0 && down === 0) return 'neutral';
  if (up > down * 1.5) return 'positive';
  if (down > up * 1.5) return 'negative';
  return 'neutral';
}

/** Attach impact_score, time_decay_weight, and sentiment to an event. */
export function enrichEventScores<T extends EventItem>(event: T): T {
  return {
    ...event,
    impact_score: event.impact_score ?? computeImpactScore(event),
    time_decay_weight: event.time_decay_weight ?? computeTimeDecayWeight(event.published_at),
    sentiment: event.sentiment ?? computeSentiment(event),
  };
}
