import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildHeadlineImageQuery } from '@/lib/headlineQuery';
import { getMacroEventFallbackImage } from '@/lib/macroEventImageQueries';
import { resolveMacroEventImageById } from '@/lib/macroEventImages';
import { getEnrichmentForHeadline } from '@/lib/news/enrichment';
import { inferEventImpact } from '@/lib/news/eventImpact';
import { assessHeadlineRelevance, type RelevanceEventType } from '@/lib/news/relevance';
import { searchPexelsPhotos } from '@/lib/pexels';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

type NewsType = 'headlines' | 'events';
type NewsRange = '1D' | '3D' | '1W' | '1M' | '3M';
type ProviderName = 'perigon' | 'benzinga' | 'newsapi' | 'supabase' | 'demo' | 'none';
type Direction = 'up' | 'down' | 'mixed' | 'unknown';
type Confidence = 'high' | 'medium' | 'low';

type HeadlineItem = {
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

type EventItem = {
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

function withEventImageFallback<T extends EventItem>(event: T, categoryHint?: string | null): T {
  const category = categoryHint || event.tags?.[0] || event.title;
  const fallbackThumb = getMacroEventFallbackImage(category, 'thumb');
  const fallbackHero = getMacroEventFallbackImage(category, 'hero');
  return {
    ...event,
    image_url: event.image_url || fallbackHero,
    image_thumb_url: event.image_thumb_url || event.image_url || fallbackThumb,
  };
}

type Params = {
  type: NewsType;
  range: NewsRange;
  tag: string;
  limit: number;
  fromIso: string;
  lookbackHours: number;
};

type DemoTopic = 'policy' | 'rates' | 'inflation' | 'energy' | 'fx' | 'equities' | 'growth';

type DemoScenario = {
  key: string;
  headline: string;
  eventTitle: string;
  description: string;
  source: string;
  url: string;
  topics: DemoTopic[];
  eventType: RelevanceEventType;
};

type NewsResponse = {
  ok: true;
  provider: ProviderName;
  items: HeadlineItem[];
  meta: { ingested: number; fromSupabase: number; errors: string[] };
};

type EventsResponse = {
  ok: true;
  provider: ProviderName;
  items: EventItem[];
  events: EventItem[];
  meta: { ingested: number; fromSupabase: number; errors: string[] };
};

type RelevantHeadline = HeadlineItem & {
  relevance: ReturnType<typeof assessHeadlineRelevance>;
};

const TYPE_VALUES: NewsType[] = ['headlines', 'events'];
const RANGE_VALUES: NewsRange[] = ['1D', '3D', '1W', '1M', '3M'];
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

const DEMO_SCENARIOS: DemoScenario[] = [
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

function demoScenariosForTag(tag: string): DemoScenario[] {
  const normalized = tag.trim().toLowerCase();
  if (normalized === 'all') return DEMO_SCENARIOS;
  const filtered = DEMO_SCENARIOS.filter((scenario) => scenario.topics.includes(normalized as DemoTopic));
  return filtered.length > 0 ? filtered : DEMO_SCENARIOS;
}

function demoPublishedAt(params: Params, index: number, total: number): string {
  const now = Date.now();
  const lookbackMs = Math.max(2, params.lookbackHours) * 60 * 60 * 1000;
  const slot = Math.max(30 * 60 * 1000, Math.floor(lookbackMs / Math.max(total + 1, 2)));
  const offset = Math.min(lookbackMs - 60_000, index * slot);
  return new Date(now - offset).toISOString();
}

function biasToDirection(bias: string): Direction {
  if (bias === 'Risk-On' || bias === 'Dovish') return 'up';
  if (bias === 'Risk-Off' || bias === 'Hawkish') return 'down';
  return 'mixed';
}

function buildDemoHeadlines(params: Params, limit = params.limit): HeadlineItem[] {
  const selected = demoScenariosForTag(params.tag).slice(0, Math.min(limit, DEMO_SCENARIOS.length));
  return selected.map((scenario, index) => {
    const published = demoPublishedAt(params, index, selected.length);
    const tags = Array.from(new Set([...scenario.topics, scenario.eventType, 'demo']));
    return {
      id: hashId(`demo-headline:${scenario.key}:${published}`),
      title: scenario.headline,
      description: scenario.description,
      url: scenario.url,
      source: scenario.source,
      publishedAt: published,
      published_at: published,
      tags,
      imageUrl: buildHeadlineFallbackImage({
        title: scenario.headline,
        tags,
      }),
    };
  });
}

function buildDemoEvents(params: Params, limit = params.limit): EventItem[] {
  const selected = demoScenariosForTag(params.tag).slice(0, Math.min(limit, DEMO_SCENARIOS.length));
  return selected.map((scenario, index) => {
    const published = demoPublishedAt(params, index, selected.length);
    const inferred = inferEventImpact({
      eventType: scenario.eventType,
      title: scenario.eventTitle,
      description: scenario.description,
    });
    const impactedTickers =
      inferred.affectedTickers.length > 0
        ? inferred.affectedTickers.map((ticker) => ({
            ticker: ticker.ticker,
            direction: ticker.direction as Direction,
            rationale: ticker.rationale,
          }))
        : [
            {
              ticker: 'SPY',
              direction: biasToDirection(inferred.bias),
              rationale: 'Broad market proxy for demo event impact.',
            },
          ];
    const event = makeDetailedEvent({
      id: hashId(`demo-event:${scenario.key}:${published}`),
      title: scenario.eventTitle,
      what_happened: `${scenario.headline}. ${scenario.description}`,
      ai_summary: toPlainNarrative(
        ensureNarrative(scenario.description, 2, [
          'This is generated from demo market data to keep event coverage available.',
          'Use rates, FX, volatility, and credit as confirmation signals.',
        ]),
        3
      ),
      why_it_matters: ensureImpactPrefix(
        buildReadableImpact(
          ensureNarrative(inferred.whyItMatters, 2, [scenario.description]),
          inferred.affectedSectors.map((sector) => ({
            sector: sector.sector,
            direction: sector.direction as Direction,
          }))
        )
      ),
      impacted_sectors:
        inferred.affectedSectors.length > 0
          ? inferred.affectedSectors.map((sector) => ({
              sector: sector.sector,
              direction: sector.direction as Direction,
              rationale: sector.rationale,
            }))
          : [{ sector: 'Technology', direction: 'mixed', rationale: 'Fallback sector mapping for demo event.' }],
      impacted_tickers: impactedTickers,
      watch_items:
        inferred.watchItems.length > 0
          ? inferred.watchItems.slice(0, 6)
          : ['Track 2Y/10Y yields, DXY, VIX, and IG/HY spreads for confirmation.'],
      sources: [
        {
          source: scenario.source,
          title: scenario.headline,
          url: scenario.url,
          published_at: published,
        },
      ],
      confidence: inferred.confidence,
      published_at: published,
      tags: Array.from(new Set([...scenario.topics, scenario.eventType, 'demo'])),
    } satisfies EventItem);

    return withEventImageFallback(event, scenario.eventType);
  });
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeIso(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return nowIso();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
}

function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
}

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseParams(request: NextRequest): { ok: true; value: Params } | { ok: false; details: Record<string, string> } {
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

function isRealNewsUrl(url: string): boolean {
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

function pickUrl(raw: Record<string, unknown>): string | null {
  const source = raw.source && typeof raw.source === 'object' ? (raw.source as Record<string, unknown>) : null;
  const candidate = raw.url ?? raw.link ?? raw.articleUrl ?? source?.url;
  if (typeof candidate !== 'string' || candidate.trim().length === 0) return null;
  return candidate.trim();
}

function normalizeHeadline(raw: Record<string, unknown>, provider: ProviderName): HeadlineItem | null {
  const titleCandidate = raw.title ?? raw.headline;
  const title = typeof titleCandidate === 'string' ? titleCandidate.trim() : '';
  if (!title) return null;
  const url = pickUrl(raw);
  if (!url) return null;
  if (!isRealNewsUrl(url)) return null;
  const sourceObj = raw.source && typeof raw.source === 'object' ? (raw.source as Record<string, unknown>) : null;
  const source =
    (typeof raw.source === 'string' ? raw.source : null) ??
    (typeof sourceObj?.name === 'string' ? sourceObj.name : null) ??
    (typeof raw.sourceDomain === 'string' ? raw.sourceDomain : null) ??
    provider;
  const description = raw.description ?? raw.summary ?? raw.content;
  const publishedIso = normalizeIso(raw.publishedAt ?? raw.published_at ?? raw.pubDate ?? raw.date);
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [];
  const imageCandidate =
    raw.imageUrl ??
    raw.image_url ??
    raw.urlToImage ??
    raw.image ??
    raw.thumbnail;

  return {
    id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : hashId(url),
    title,
    description: typeof description === 'string' && description.trim().length > 0 ? description.trim() : null,
    url,
    source: String(source),
    publishedAt: publishedIso,
    published_at: publishedIso,
    imageUrl: typeof imageCandidate === 'string' && imageCandidate.trim().length > 0 ? imageCandidate : undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

function absolutizeImageUrl(candidate: string, pageUrl: string): string | null {
  const value = candidate.trim();
  if (!value) return null;
  try {
    const resolved = new URL(value, pageUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function extractMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i'
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const content = match?.[1]?.trim();
    if (content) return content;
  }
  return null;
}

function parseOpenGraphImage(html: string, pageUrl: string): string | undefined {
  const candidate =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image') ??
    extractMetaContent(html, 'og:image:url');
  if (!candidate) return undefined;
  return absolutizeImageUrl(candidate, pageUrl) ?? undefined;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHeadlineFallbackImage(item: Pick<HeadlineItem, 'title' | 'tags'>, variant: 'thumb' | 'hero' = 'thumb'): string {
  const query = buildHeadlineImageQuery({
    headline: item.title,
    category: item.tags?.[0] ?? null,
  });
  const headlineWords = query
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const width = variant === 'hero' ? 1280 : 640;
  const height = variant === 'hero' ? 720 : 360;
  const title = escapeSvgText(headlineWords.join(' • ') || 'Macro Headline');
  const subtitle = escapeSvgText((item.tags?.[0] ?? 'macro').toUpperCase());
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#030712" />
        </linearGradient>
        <radialGradient id="glowA" cx="82%" cy="20%" r="48%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glowB" cx="22%" cy="82%" r="40%">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <rect width="${width}" height="${height}" fill="url(#glowA)" />
      <rect width="${width}" height="${height}" fill="url(#glowB)" />
      <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.16)}" width="${Math.round(width * 0.2)}" height="${Math.round(height * 0.02)}" rx="999" fill="rgba(255,255,255,0.08)" />
      <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.22)}" width="${Math.round(width * 0.12)}" height="${Math.round(height * 0.02)}" rx="999" fill="rgba(255,255,255,0.06)" />
      <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.7)}" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="${variant === 'hero' ? 40 : 24}" font-weight="700">${title}</text>
      <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.8)}" fill="rgba(248,250,252,0.72)" font-family="Arial, Helvetica, sans-serif" font-size="${variant === 'hero' ? 20 : 14}" font-weight="600" letter-spacing="3">${subtitle}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function resolveHeadlineImageUrl(item: HeadlineItem): Promise<string | undefined> {
  if (item.imageUrl) return item.imageUrl;
  if (!isRealNewsUrl(item.url)) return buildHeadlineFallbackImage(item);

  const timeout = withTimeoutSignal(4_000);
  try {
    const response = await fetch(item.url, {
      cache: 'no-store',
      signal: timeout.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'CapitalBaseBot/1.0 (+https://capitalbase.app)',
      },
    });
    if (!response.ok) return undefined;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) return undefined;

    const html = await response.text();
    const openGraphImage = parseOpenGraphImage(html, item.url);
    if (openGraphImage) return openGraphImage;
  } catch {
  } finally {
    timeout.cleanup();
  }

  try {
    const query = buildHeadlineImageQuery({
      headline: item.title,
      category: item.tags?.[0] ?? null,
    });
    const photos = await searchPexelsPhotos(query);
    const photo = photos.find(
      (candidate) =>
        typeof candidate.src.landscape === 'string' ||
        typeof candidate.src.large === 'string' ||
        typeof candidate.src.medium === 'string'
    );
    const imageUrl = photo?.src.landscape || photo?.src.large || photo?.src.medium;
    if (typeof imageUrl === 'string' && imageUrl.trim()) return imageUrl;
  } catch {
    // Fall through to deterministic headline-specific art.
  }

  return buildHeadlineFallbackImage(item);
}

async function hydrateHeadlineImages(items: HeadlineItem[], maxResolves: number): Promise<HeadlineItem[]> {
  let remaining = Math.max(0, maxResolves);
  const output: HeadlineItem[] = [];

  for (const item of items) {
    if (item.imageUrl || remaining <= 0) {
      output.push(item);
      continue;
    }

    const resolved = await resolveHeadlineImageUrl(item);
    output.push(resolved ? { ...item, imageUrl: resolved } : item);
    remaining -= 1;
  }

  return output;
}

function dedupeHeadlines(items: HeadlineItem[]): HeadlineItem[] {
  const seen = new Set<string>();
  const output: HeadlineItem[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    output.push(item);
  }
  return output;
}

function evaluateRelevantHeadlines(items: HeadlineItem[], minScore: number): {
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

function addRelevanceTags(item: RelevantHeadline): HeadlineItem {
  const { relevance, ...entry } = item;
  return {
    ...entry,
    tags: Array.from(new Set([...(entry.tags ?? []), relevance.eventType, `relevance:${relevance.score}`])),
  };
}

const THEME_PATTERNS: Array<{ token: string; pattern: RegExp }> = [
  { token: 'fed', pattern: /\b(federal reserve|fomc|fed)\b/i },
  { token: 'cpi', pattern: /\b(cpi|pce|inflation|price pressures?)\b/i },
  { token: 'yields', pattern: /\b(treasury yields?|bond yields?|term premium|auction)\b/i },
  { token: 'oil', pattern: /\b(oil|wti|brent|opec|crude|eia)\b/i },
  { token: 'dxy', pattern: /\b(dxy|usd|dollar|yen|euro|fx|currency)\b/i },
  { token: 'jobs', pattern: /\b(payrolls?|jobs?|unemployment|labor market)\b/i },
  { token: 'credit', pattern: /\b(credit spreads?|high yield|default|ig spread|funding stress)\b/i },
  { token: 'geopolitics', pattern: /\b(war|sanctions?|ceasefire|trade war|tariffs?|geopolitical)\b/i },
  { token: 'earnings', pattern: /\b(earnings|guidance|revisions?|profit warning)\b/i },
];

function detectThemeToken(item: RelevantHeadline): string {
  const text = `${item.title}\n${item.description ?? ''}`;
  for (const candidate of THEME_PATTERNS) {
    if (candidate.pattern.test(text)) return candidate.token;
  }
  return 'macro';
}

function toThemeLabel(token: string): string {
  const labels: Record<string, string> = {
    fed: 'Fed Policy',
    cpi: 'Inflation Data',
    yields: 'Treasury Yields',
    oil: 'Energy Complex',
    dxy: 'Dollar and FX',
    jobs: 'Labor Market',
    credit: 'Credit Conditions',
    geopolitics: 'Geopolitical Risk',
    earnings: 'Earnings Cycle',
    macro: 'Macro Regime',
  };
  return labels[token] ?? 'Macro Regime';
}

function toEventBaseTitle(eventType: RelevanceEventType): string {
  const titles: Record<RelevanceEventType, string> = {
    policy: 'Policy Path Repricing',
    rates: 'Rates and Duration Repricing',
    inflation: 'Inflation Trend Reassessment',
    growth: 'Growth Momentum Reassessment',
    energy: 'Energy Shock Transmission',
    fx: 'FX Regime Shift',
    credit: 'Credit Risk Repricing',
    geopolitics: 'Geopolitical Risk Transmission',
    equities: 'Equity Risk Regime Shift',
    other: 'Macro Cross-Asset Repricing',
  };
  return titles[eventType];
}

function toFocusHeadline(title: string): string {
  const cleaned = title
    .replace(/\s*\|\s*[^|]+$/g, '')
    .replace(/\s*-\s*(Reuters|Bloomberg|CNBC|WSJ|FT|Financial Times)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, 10).join(' ');
}

function synthesizeEventTitle(eventType: RelevanceEventType, theme: string, focus?: string): string {
  const focusLabel = typeof focus === 'string' ? focus.trim() : '';
  if (focusLabel.length > 0) return `${toThemeLabel(theme)} — ${focusLabel}`;
  return `${toThemeLabel(theme)} — ${toEventBaseTitle(eventType)}`;
}

function normalizeEventKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clusterRelevantHeadlines(relevant: RelevantHeadline[], limit: number): Array<{
  eventType: RelevanceEventType;
  theme: string;
  items: RelevantHeadline[];
}> {
  const buckets = new Map<string, { eventType: RelevanceEventType; theme: string; items: RelevantHeadline[] }>();
  for (const item of relevant) {
    if (item.relevance.eventType === 'other') continue;
    const theme = detectThemeToken(item);
    const key = `${item.relevance.eventType}:${theme}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.set(key, { eventType: item.relevance.eventType, theme, items: [item] });
    }
  }

  const clusters = Array.from(buckets.values())
    .map((cluster) => ({
      ...cluster,
      items: cluster.items
        .sort((a, b) => {
          const scoreDiff = b.relevance.score - a.relevance.score;
          if (scoreDiff !== 0) return scoreDiff;
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        })
        .slice(0, 5),
    }))
    .sort((a, b) => {
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      const avgA = a.items.reduce((sum, item) => sum + item.relevance.score, 0) / Math.max(a.items.length, 1);
      const avgB = b.items.reduce((sum, item) => sum + item.relevance.score, 0) / Math.max(b.items.length, 1);
      if (avgB !== avgA) return avgB - avgA;
      const latestA = Math.max(...a.items.map((item) => new Date(item.publishedAt).getTime()));
      const latestB = Math.max(...b.items.map((item) => new Date(item.publishedAt).getTime()));
      return latestB - latestA;
    });

  const multiSource = clusters.filter((cluster) => {
    const uniqueUrls = new Set(cluster.items.map((item) => item.url));
    const uniqueSources = new Set(cluster.items.map((item) => item.source.toLowerCase()));
    if (cluster.items.length >= 2 && uniqueUrls.size >= 2) return true;
    // Keep strong single-item clusters only when relevance is high.
    const leadScore = cluster.items[0]?.relevance.score ?? 0;
    return uniqueSources.size >= 1 && leadScore >= 48;
  });
  const selected = multiSource.length > 0 ? multiSource : clusters;
  return selected.slice(0, limit);
}

function toEventTypeLabel(eventType: RelevanceEventType): string {
  const labels: Record<RelevanceEventType, string> = {
    policy: 'policy',
    rates: 'rates',
    inflation: 'inflation',
    growth: 'growth',
    energy: 'energy',
    fx: 'FX',
    credit: 'credit',
    geopolitics: 'geopolitics',
    equities: 'equities',
    other: 'macro',
  };
  return labels[eventType];
}

function buildMarketContextSnapshot(
  relevant: RelevantHeadline[],
  params: Params
): {
  summaryLine: string;
  themeLine: string;
  headlineLines: string[];
} {
  if (relevant.length === 0) {
    return {
      summaryLine:
        `Current market context (${params.range}, topic=${params.tag}): limited high-confidence headlines, so treat event impact as low conviction until confirmed by rates, USD, credit, and breadth.`,
      themeLine: 'Current driver mix: macro (1).',
      headlineLines: [],
    };
  }

  const eventTypeCounts = new Map<RelevanceEventType, number>();
  const themeCounts = new Map<string, number>();
  for (const item of relevant) {
    const eventType = item.relevance.eventType;
    const theme = detectThemeToken(item);
    eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) ?? 0) + 1);
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }

  const topEventTypes = Array.from(eventTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([eventType, count]) => `${toEventTypeLabel(eventType)} (${count})`);

  const topThemes = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme, count]) => `${toThemeLabel(theme)} (${count})`);

  const headlineLines = relevant.slice(0, 8).map((item) => `${item.source}: ${item.title}`);

  return {
    summaryLine:
      `Current market context (${params.range}, topic=${params.tag}): dominant drivers are ${topEventTypes.join(', ') || 'macro'}. Focus on what changed now and what confirms it in 1-5 sessions.`,
    themeLine: `Current driver mix: ${topThemes.join(', ') || 'Macro Regime (1)'}.`,
    headlineLines,
  };
}

function topicQuery(tag: string): string {
  return TOPIC_TO_QUERY[tag] || TOPIC_TO_QUERY.all;
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function clampSentence(text: string, maxChars = 220): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const sliced = normalized.slice(0, maxChars);
  const cutAt = sliced.lastIndexOf(' ');
  return `${(cutAt > 120 ? sliced.slice(0, cutAt) : sliced).trim()}...`;
}

function toPlainNarrative(text: string, maxSentences: number): string {
  const sentences = splitSentences(text).map((sentence) => clampSentence(sentence));
  if (sentences.length === 0) return clampSentence(text);
  return sentences.slice(0, maxSentences).join(' ');
}

function sectorDirectionSummary(direction: Direction): string {
  if (direction === 'up') return 'up';
  if (direction === 'down') return 'down';
  if (direction === 'mixed') return 'mixed';
  return 'unclear';
}

function buildReadableImpact(
  rawImpact: string,
  sectors: Array<{ sector: string; direction: Direction }>
): string {
  const normalizedRaw = rawImpact.replace(/^market impact:\s*/i, '').trim();
  const baseSentences = splitSentences(normalizedRaw).map((sentence) => clampSentence(sentence, 260));
  const sectorList = sectors.slice(0, 3).map((item) => item.sector);
  const sectorText = sectorList.length > 0 ? sectorList.join(', ') : 'macro-sensitive sectors';
  const coreSentences: string[] = [];

  if (baseSentences.length > 0) coreSentences.push(baseSentences[0]);
  if (baseSentences.length > 1) coreSentences.push(baseSentences[1]);
  if (baseSentences.length > 2) coreSentences.push(baseSentences[2]);

  if (coreSentences.length < 2) {
    coreSentences.push(
      `Primary transmission should run through rates, USD, and credit spreads, with earliest sector expression likely in ${sectorText}.`
    );
  }
  if (coreSentences.length < 3) {
    coreSentences.push(
      'Confirmation should come from 2Y/10Y yields, DXY, VIX, and IG/HY spreads within 1-3 sessions; if those diverge, treat the move as low-conviction.'
    );
  }

  const lead = coreSentences.slice(0, 3).join(' ');
  const winnersLosers = sectors
    .slice(0, 4)
    .map((item) => `${item.sector} ${sectorDirectionSummary(item.direction)}`)
    .join('; ');
  const winnersLosersText = winnersLosers.length > 0 ? winnersLosers : 'broad index proxies mixed';
  const anchors = '2Y/10Y yields, DXY, VIX, IG/HY spreads';

  return [
    `Market impact: ${lead}`,
    `Likely winners/losers: ${winnersLosersText}.`,
    `Monitoring anchors: ${anchors}.`,
    'Invalidation trigger: if volatility and credit spreads fail to confirm within 1-3 sessions.',
  ].join(' ');
}

function ensureNarrative(base: string, minimum: number, extras: string[]): string {
  const sentences = splitSentences(base);
  for (const extra of extras) {
    if (sentences.length >= minimum) break;
    if (!sentences.includes(extra)) sentences.push(extra);
  }
  return sentences.join(' ');
}

function ensureImpactPrefix(text: string): string {
  if (/^market impact:/i.test(text)) return text;
  return `Market impact: ${text}`.trim();
}

function makeDetailedEvent(event: EventItem): EventItem {
  const sectorNames = event.impacted_sectors.map((sector) => sector.sector).slice(0, 3);
  const aiSummary = toPlainNarrative(
    ensureNarrative(event.ai_summary, 2, [
      `Catalyst concentration is highest in ${sectorNames.length > 0 ? sectorNames.join(', ') : 'macro-sensitive sectors'}.`,
      `Validate with 2Y/10Y, DXY, VIX, and IG/HY spreads.`,
    ]),
    3
  );
  const whyItMatters = ensureImpactPrefix(buildReadableImpact(event.why_it_matters, event.impacted_sectors));

  return {
    ...event,
    ai_summary: aiSummary,
    why_it_matters: whyItMatters,
  };
}

async function fetchPerigon(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.PERIGON_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    apiKey: key,
    q: topicQuery(params.tag),
    from: params.fromIso,
    sortBy: 'date',
    size: String(params.limit),
  });
  const timeout = withTimeoutSignal(10_000);
  try {
    const response = await fetch(`https://api.goperigon.com/v1/all?${qs.toString()}`, {
      cache: 'no-store',
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`PERIGON_HTTP_${response.status}`);
    const payload = (await response.json()) as { articles?: unknown[] };
    const rows = Array.isArray(payload.articles)
      ? payload.articles.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
      : [];
    const normalized = rows.map((row) => normalizeHeadline(row, 'perigon')).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) {
      console.debug('[api/news] perigon', {
        rawCount: rows.length,
        normalizedCount: normalized.length,
        droppedCount: rows.length - normalized.length,
        sampleKeys: rows.length > 0 ? Object.keys(rows[0]) : [],
      });
    }
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function fetchBenzinga(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.BENZINGA_API_KEY || process.env.BENZINGA_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    token: key,
    channels: 'economics,markets,general',
    dateFrom: params.fromIso,
    pageSize: String(params.limit),
    displayOutput: 'full',
  });
  const timeout = withTimeoutSignal(10_000);
  try {
    const response = await fetch(`https://api.benzinga.com/api/v2/news?${qs.toString()}`, {
      cache: 'no-store',
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`BENZINGA_HTTP_${response.status}`);
    const payload = (await response.json()) as { data?: unknown[]; articles?: unknown[] };
    const rawRows = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.articles)
        ? payload.articles
        : [];
    const rows = rawRows.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'));
    const normalized = rows.map((row) => normalizeHeadline(row, 'benzinga')).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) {
      console.debug('[api/news] benzinga', {
        rawCount: rows.length,
        normalizedCount: normalized.length,
        droppedCount: rows.length - normalized.length,
        sampleKeys: rows.length > 0 ? Object.keys(rows[0]) : [],
      });
    }
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function fetchNewsApi(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    apiKey: key,
    q: topicQuery(params.tag),
    from: params.fromIso,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: String(params.limit),
  });
  const timeout = withTimeoutSignal(10_000);
  try {
    const response = await fetch(`https://newsapi.org/v2/everything?${qs.toString()}`, {
      cache: 'no-store',
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`NEWSAPI_HTTP_${response.status}`);
    const payload = (await response.json()) as { articles?: unknown[] };
    const rows = Array.isArray(payload.articles)
      ? payload.articles.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
      : [];
    const normalized = rows.map((row) => normalizeHeadline(row, 'newsapi')).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) {
      console.debug('[api/news] newsapi', {
        rawCount: rows.length,
        normalizedCount: normalized.length,
        droppedCount: rows.length - normalized.length,
        sampleKeys: rows.length > 0 ? Object.keys(rows[0]) : [],
      });
    }
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function pullLiveHeadlines(params: Params, providers: ProviderName[], errors: string[]): Promise<{ provider: ProviderName | null; items: HeadlineItem[] }> {
  let primaryProvider: ProviderName | null = null;
  const collected: HeadlineItem[] = [];
  for (const provider of providers) {
    try {
      let items: HeadlineItem[] = [];
      if (provider === 'perigon') items = await fetchPerigon(params);
      if (provider === 'benzinga') items = await fetchBenzinga(params);
      if (provider === 'newsapi') items = await fetchNewsApi(params);
      if (items.length > 0) {
        if (primaryProvider === null) primaryProvider = provider;
        collected.push(...items);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'provider_failed';
      errors.push(`${provider}:${message}`);
      if (isDev()) console.error(`[api/news] ${provider} failed`, message);
    }
  }
  return { provider: primaryProvider, items: dedupeHeadlines(collected).slice(0, Math.max(params.limit * 2, 30)) };
}

async function upsertHeadlines(supabase: SupabaseClient, items: HeadlineItem[], errors: string[]): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((item) => ({
    published_at: item.publishedAt,
    source: item.source,
    title: item.title,
    description: item.description,
    url: item.url,
    image_url: item.imageUrl ?? null,
    tags: item.tags ?? [],
  }));
  const { error } = await supabase.from('news_headlines').upsert(rows, { onConflict: 'url' });
  if (error) {
    errors.push(`supabase_upsert_headlines:${error.message}`);
    if (isDev()) console.error('[api/news] supabase upsert headlines failed', error.message);
    return 0;
  }
  return rows.length;
}

async function readHeadlinesFromSupabase(supabase: SupabaseClient, params: Params, errors: string[]): Promise<HeadlineItem[]> {
  let query = supabase
    .from('news_headlines')
    .select('*')
    .gte('published_at', params.fromIso)
    .order('published_at', { ascending: false })
    .limit(params.limit);
  if (params.tag !== 'all') {
    query = query.contains('tags', [params.tag]);
  }
  const { data, error } = await query;
  if (error) {
    errors.push(`supabase_read_headlines:${error.message}`);
    if (isDev()) console.error('[api/news] supabase read headlines failed', error.message);
    return [];
  }
  const windowRows = Array.isArray(data) ? data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
  if (windowRows.length > 0) {
    return windowRows
      .map((row) =>
        normalizeHeadline(
          {
            id: row.id,
            title: row.title,
            description: row.description ?? row.summary,
            url: row.url,
            source: row.source,
            publishedAt: row.published_at,
            imageUrl: row.image_url,
            tags: row.tags,
          },
          'supabase'
        )
      )
      .filter((item): item is HeadlineItem => item !== null)
      .slice(0, params.limit);
  }

  // Broaden once to latest cached items if requested window is empty.
  const latest = await supabase
    .from('news_headlines')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(params.limit);
  if (latest.error) {
    errors.push(`supabase_read_headlines_latest:${latest.error.message}`);
    return [];
  }
  const rows = Array.isArray(latest.data)
    ? latest.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    : [];
  const normalizedLatest = rows
    .map((row) =>
      normalizeHeadline(
        {
          id: row.id,
          title: row.title,
          description: row.description ?? row.summary,
          url: row.url,
          source: row.source,
          publishedAt: row.published_at,
          imageUrl: row.image_url,
          tags: row.tags,
        },
        'supabase'
      )
    )
    .filter((item): item is HeadlineItem => item !== null)
    .slice(0, params.limit);

  if (normalizedLatest.length > 0) return normalizedLatest;

  const demo = await supabase
    .from('demo_headlines')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(params.limit);
  if (demo.error) {
    errors.push(`supabase_read_demo_headlines:${demo.error.message}`);
    return [];
  }
  const demoRows = Array.isArray(demo.data)
    ? demo.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    : [];
  return demoRows
    .map((row) =>
      normalizeHeadline(
        {
          id: row.id,
          title: row.title,
          description: null,
          url: row.url,
          source: row.source,
          publishedAt: row.published_at,
          tags: row.tags,
        },
        'supabase'
      )
    )
    .filter((item): item is HeadlineItem => item !== null)
    .slice(0, params.limit);
}

function toEventFromCluster(cluster: {
  eventType: RelevanceEventType;
  theme: string;
  items: RelevantHeadline[];
}): EventItem {
  const lead = cluster.items[0];
  const focusHeadline = toFocusHeadline(lead?.title ?? '');
  const title = synthesizeEventTitle(cluster.eventType, cluster.theme, focusHeadline);
  const related = cluster.items.slice(1, 3).map((item) => item.title);
  const whatHappened = related.length > 0
    ? `${lead.title}. Related: ${related.join('; ')}.`
    : lead.title;
  const impactSeed = inferEventImpact({
    eventType: cluster.eventType,
    title,
    description: whatHappened,
  });
  const publishedAt = normalizeIso(
    cluster.items
      .map((item) => item.publishedAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  );

  return {
    id: hashId(`${cluster.eventType}:${cluster.theme}:${cluster.items.map((item) => item.url).join('|')}`),
    title,
    what_happened: whatHappened,
    ai_summary: toPlainNarrative(ensureNarrative(impactSeed.whyItMatters, 2, [
        `Catalyst cluster is concentrated in ${toThemeLabel(cluster.theme).toLowerCase()}.`,
        `Transmission should be tracked through rates, FX, and credit channels.`,
      ]), 3),
    why_it_matters: ensureImpactPrefix(
      buildReadableImpact(
        ensureNarrative(impactSeed.whyItMatters, 3, [
          `Watch 2Y/10Y, DXY, VIX, and IG/HY spreads to confirm whether the move is broadening.`,
          `If those anchors diverge from price action, the shock is likely being absorbed rather than repriced.`,
        ]),
        impactSeed.affectedSectors.map((sector) => ({
          sector: sector.sector,
          direction: sector.direction as Direction,
        }))
      )
    ),
    impacted_sectors: impactSeed.affectedSectors.map((sector) => ({
      sector: sector.sector,
      direction: sector.direction as Direction,
      rationale: sector.rationale,
    })),
    impacted_tickers: impactSeed.affectedTickers.map((ticker) => ({
      ticker: ticker.ticker,
      direction: ticker.direction as Direction,
      rationale: ticker.rationale,
    })),
    watch_items: impactSeed.watchItems,
    sources: cluster.items.map((item) => ({
      source: item.source,
      title: item.title,
      url: item.url,
      published_at: normalizeIso(item.publishedAt),
    })),
    confidence: impactSeed.confidence,
    published_at: publishedAt,
    tags: Array.from(
      new Set([
        ...cluster.items.flatMap((item) => item.tags ?? []),
        cluster.eventType,
        cluster.theme,
      ])
    ),
  };
}

function dedupeEvents(events: EventItem[]): EventItem[] {
  const byKey = new Map<string, EventItem>();
  for (const event of events) {
    const key = `${normalizeEventKey(event.title)}|${normalizeEventKey(event.what_happened).slice(0, 140)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      continue;
    }
    const existingTs = new Date(existing.published_at).getTime();
    const currentTs = new Date(event.published_at).getTime();
    const keepCurrent =
      currentTs > existingTs ||
      event.sources.length > existing.sources.length ||
      event.ai_summary.length > existing.ai_summary.length;
    byKey.set(
      key,
      keepCurrent
        ? {
            ...event,
            sources: dedupeByUrl([...existing.sources, ...event.sources]),
          }
        : {
            ...existing,
            sources: dedupeByUrl([...existing.sources, ...event.sources]),
          }
    );
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );
}

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

async function upsertEvents(supabase: SupabaseClient, events: EventItem[], params: Params, errors: string[], provider: ProviderName | null): Promise<number> {
  if (events.length === 0) return 0;
  const modernRows = events.map((event) => ({
    published_at: event.published_at,
    provider: provider || 'supabase',
    title: event.title,
    description: event.what_happened,
    event_type: event.tags?.[0] || 'macro',
    tags: event.tags || [],
    affected_tickers: event.impacted_tickers.map((t) => t.ticker),
    affected_sectors: event.impacted_sectors.map((s) => s.sector),
    importance: event.confidence === 'high' ? 5 : event.confidence === 'medium' ? 3 : 2,
  }));
  const modernResult = await supabase
    .from('macro_events')
    .upsert(modernRows, { onConflict: 'provider,title,published_at' })
    .select('id');
  if (!modernResult.error) {
    const rows = Array.isArray(modernResult.data)
      ? modernResult.data.filter((row): row is { id: string } => Boolean(row && typeof (row as { id?: unknown }).id === 'string'))
      : [];
    for (const row of rows) {
      try {
        await resolveMacroEventImageById(supabase, row.id);
      } catch (imageError) {
        const message = imageError instanceof Error ? imageError.message : 'resolve_failed';
        errors.push(`macro_event_image_resolve:${message}`);
        if (isDev()) console.error('[api/news] macro event image resolve failed', { id: row.id, message });
      }
    }
    return modernRows.length;
  }

  const insertResult = await supabase.from('macro_events').insert(modernRows).select('id');
  if (!insertResult.error) {
    const rows = Array.isArray(insertResult.data)
      ? insertResult.data.filter((row): row is { id: string } => Boolean(row && typeof (row as { id?: unknown }).id === 'string'))
      : [];
    for (const row of rows) {
      try {
        await resolveMacroEventImageById(supabase, row.id);
      } catch (imageError) {
        const message = imageError instanceof Error ? imageError.message : 'resolve_failed';
        errors.push(`macro_event_image_resolve:${message}`);
      }
    }
    return modernRows.length;
  }

  errors.push(`supabase_upsert_events:${insertResult.error.message}`);
  if (isDev()) {
    console.error('[api/news] supabase upsert events failed', {
      modern: modernResult.error.message,
      insert: insertResult.error.message,
      range: params.range,
    });
  }
  return 0;
}

async function readEventsFromSupabase(supabase: SupabaseClient, params: Params, errors: string[]): Promise<EventItem[]> {
  const attempts: Array<{ dateColumn: string; filterValue: string }> = [
    { dateColumn: 'published_at', filterValue: params.fromIso },
    { dateColumn: 'created_at', filterValue: params.fromIso },
  ];
  for (const attempt of attempts) {
    const query = await supabase
      .from('macro_events')
      .select('*')
      .gte(attempt.dateColumn, attempt.filterValue)
      .order(attempt.dateColumn, { ascending: false })
      .limit(params.limit);
    if (query.error) continue;
    const rows = Array.isArray(query.data)
      ? query.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
      : [];
    const mapped = rows.map((row, index) => {
      const sourceUrls = Array.isArray(row.source_urls) ? row.source_urls.filter((u): u is string => typeof u === 'string') : [];
      const impactedAssets = Array.isArray(row.impacted_assets)
        ? row.impacted_assets.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
        : [];
      const impactedSectors = Array.isArray(row.impacted_sectors)
        ? row.impacted_sectors.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
        : [];
      const affectedTickers = Array.isArray(row.affected_tickers)
        ? row.affected_tickers.filter((x): x is string => typeof x === 'string')
        : [];
      const affectedSectors = Array.isArray(row.affected_sectors)
        ? row.affected_sectors.filter((x): x is string => typeof x === 'string')
        : [];
      const published = normalizeIso(row.published_at ?? row.created_at);
      const title = typeof row.title === 'string' ? row.title : `Macro Event ${index + 1}`;
      const oneLine =
        (typeof row.description === 'string' ? row.description : null) ??
        (typeof row.one_line === 'string' ? row.one_line : null) ??
        title;
      const confidence: Confidence =
        row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low' ? row.confidence : 'medium';
      const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [];
      const relevance = assessHeadlineRelevance({
        title,
        description: oneLine,
        source: 'supabase',
        minScore: 0,
      });
      const inferredImpact = inferEventImpact({
        eventType: relevance.eventType,
        title,
        description: oneLine,
      });

      const normalizedEvent: EventItem = {
        id: typeof row.id === 'string' ? row.id : hashId(`${title}-${published}`),
        title,
        what_happened: oneLine,
        ai_summary: oneLine || inferredImpact.whyItMatters,
        why_it_matters:
          typeof row.why_it_matters === 'string'
            ? row.why_it_matters
            : inferredImpact.whyItMatters,
        impacted_sectors:
          affectedSectors.length > 0
            ? affectedSectors.map((sector) => ({ sector, direction: 'unknown' as Direction }))
            : impactedSectors.map((sector) => ({
                sector: typeof sector.sector === 'string' ? sector.sector : 'Unknown',
                direction:
                  sector.direction === 'up' || sector.direction === 'down' || sector.direction === 'mixed' || sector.direction === 'unknown'
                    ? sector.direction
                    : 'unknown',
                rationale: typeof sector.rationale === 'string' ? sector.rationale : undefined,
              })),
        impacted_tickers:
          affectedTickers.length > 0
            ? affectedTickers.map((ticker) => ({ ticker, direction: 'unknown' as Direction }))
            : impactedAssets.map((asset) => ({
                ticker: typeof asset.label === 'string' ? asset.label : 'UNKNOWN',
                direction:
                  asset.dir === 'up' || asset.dir === 'down' || asset.dir === 'mixed' || asset.dir === 'unknown'
                    ? asset.dir
                    : 'unknown',
                rationale: typeof asset.rationale === 'string' ? asset.rationale : undefined,
              })),
        watch_items: [
          'Track rates and volatility confirmation.',
          'Monitor breadth and sector rotation persistence.',
          'Watch incoming macro releases for validation.',
        ],
        sources:
          sourceUrls.length > 0
            ? sourceUrls.map((url) => ({ source: 'cached', title, url, published_at: published }))
            : [],
        confidence,
        published_at: published,
        image_url: typeof row.image_url === 'string' ? row.image_url : undefined,
        image_thumb_url: typeof row.image_thumb_url === 'string' ? row.image_thumb_url : undefined,
        image_provider: typeof row.image_provider === 'string' ? row.image_provider : undefined,
        image_source_url: typeof row.image_source_url === 'string' ? row.image_source_url : undefined,
        image_author: typeof row.image_author === 'string' ? row.image_author : undefined,
        image_author_url: typeof row.image_author_url === 'string' ? row.image_author_url : undefined,
        image_query: typeof row.image_query === 'string' ? row.image_query : undefined,
        image_cached_at: typeof row.image_cached_at === 'string' ? row.image_cached_at : undefined,
        tags,
      };

      return withEventImageFallback(
        makeDetailedEvent({
          ...normalizedEvent,
          ai_summary: normalizedEvent.ai_summary || inferredImpact.whyItMatters,
          why_it_matters: normalizedEvent.why_it_matters || inferredImpact.whyItMatters,
          impacted_sectors:
            normalizedEvent.impacted_sectors.length > 0
              ? normalizedEvent.impacted_sectors
              : inferredImpact.affectedSectors.map((sector) => ({
                  sector: sector.sector,
                  direction: sector.direction as Direction,
                  rationale: sector.rationale,
                })),
          impacted_tickers:
            normalizedEvent.impacted_tickers.length > 0
              ? normalizedEvent.impacted_tickers
              : inferredImpact.affectedTickers.length > 0
                ? inferredImpact.affectedTickers.map((ticker) => ({
                    ticker: ticker.ticker,
                    direction: ticker.direction as Direction,
                    rationale: ticker.rationale,
                  }))
                : [
                    {
                      ticker: 'SPY',
                      direction:
                        inferredImpact.bias === 'Risk-On' || inferredImpact.bias === 'Dovish'
                          ? 'up'
                          : inferredImpact.bias === 'Risk-Off' || inferredImpact.bias === 'Hawkish'
                            ? 'down'
                            : 'mixed',
                      rationale: 'Broad market proxy for first-order event impact.',
                    },
                  ],
        } satisfies EventItem),
        typeof row.event_type === 'string' ? row.event_type : typeof row.title === 'string' ? row.title : null
      );
    });
    return mapped
      .map((event) => ({
        ...event,
        sources: event.sources.filter((source) => isRealNewsUrl(source.url)),
      }))
      .slice(0, params.limit);
  }
  const demo = await supabase
    .from('demo_macro_events')
    .select('*')
    .order('event_date', { ascending: false })
    .limit(params.limit);
  if (demo.error) {
    errors.push(`supabase_read_demo_events:${demo.error.message}`);
    errors.push('supabase_read_events:table_or_columns_unavailable');
    return [];
  }
  const demoRows = Array.isArray(demo.data)
    ? demo.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    : [];
  const mappedDemo = demoRows.map((row, index) => {
    const published = normalizeIso(row.event_date ?? row.created_at);
    const title = typeof row.title === 'string' ? row.title : `Macro Event ${index + 1}`;
    const oneLine = typeof row.one_line === 'string' ? row.one_line : title;
    const confidence: Confidence =
      row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low' ? row.confidence : 'medium';
    const relevance = assessHeadlineRelevance({ title, description: oneLine, source: 'supabase', minScore: 0 });
    const inferredImpact = inferEventImpact({ eventType: relevance.eventType, title, description: oneLine });
    const impactedSectors = Array.isArray(row.impacted_sectors)
      ? row.impacted_sectors.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
      : [];
    const impactedAssets = Array.isArray(row.impacted_assets)
      ? row.impacted_assets.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
      : [];
    const sources = Array.isArray(row.sources)
      ? row.sources
          .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
          .map((src) => ({
            source: typeof src.source === 'string' ? src.source : 'cached',
            title: typeof src.title === 'string' ? src.title : title,
            url: typeof src.url === 'string' ? src.url : '',
            published_at: published,
          }))
          .filter((src) => isRealNewsUrl(src.url))
      : [];

    return withEventImageFallback(
      makeDetailedEvent({
        id: typeof row.id === 'string' ? row.id : hashId(`${title}-${published}`),
        title,
        what_happened: oneLine,
        ai_summary: oneLine || inferredImpact.whyItMatters,
        why_it_matters: typeof row.why_it_matters === 'string' ? row.why_it_matters : inferredImpact.whyItMatters,
        impacted_sectors:
          impactedSectors.length > 0
            ? impactedSectors.map((sector) => ({
                sector: typeof sector.sector === 'string' ? sector.sector : 'Unknown',
                direction:
                  sector.direction === 'up' || sector.direction === 'down' || sector.direction === 'mixed' || sector.direction === 'unknown'
                    ? sector.direction
                    : 'unknown',
                rationale: typeof sector.rationale === 'string' ? sector.rationale : undefined,
              }))
            : inferredImpact.affectedSectors.map((sector) => ({
                sector: sector.sector,
                direction: sector.direction as Direction,
                rationale: sector.rationale,
              })),
        impacted_tickers:
          impactedAssets.length > 0
            ? impactedAssets.map((asset) => ({
                ticker: typeof asset.label === 'string' ? asset.label : 'SPY',
                direction:
                  asset.dir === 'up' || asset.dir === 'down' || asset.dir === 'mixed' || asset.dir === 'unknown'
                    ? asset.dir
                    : 'unknown',
                rationale: typeof asset.rationale === 'string' ? asset.rationale : undefined,
              }))
            : inferredImpact.affectedTickers.map((ticker) => ({
                ticker: ticker.ticker,
                direction: ticker.direction as Direction,
                rationale: ticker.rationale,
              })),
        watch_items: inferredImpact.watchItems,
        sources,
        confidence,
        published_at: published,
        image_url: typeof row.image_url === 'string' ? row.image_url : undefined,
        image_thumb_url: typeof row.image_thumb_url === 'string' ? row.image_thumb_url : undefined,
        image_provider: typeof row.image_provider === 'string' ? row.image_provider : undefined,
        image_source_url: typeof row.image_source_url === 'string' ? row.image_source_url : undefined,
        image_author: typeof row.image_author === 'string' ? row.image_author : undefined,
        image_author_url: typeof row.image_author_url === 'string' ? row.image_author_url : undefined,
        image_query: typeof row.image_query === 'string' ? row.image_query : undefined,
        image_cached_at: typeof row.image_cached_at === 'string' ? row.image_cached_at : undefined,
        tags: Array.from(new Set([relevance.eventType])),
      } satisfies EventItem),
      typeof row.event_type === 'string' ? row.event_type : typeof row.title === 'string' ? row.title : null
    );
  });

  return mappedDemo.slice(0, params.limit);
}

async function handleHeadlines(params: Params): Promise<NewsResponse> {
  const errors: string[] = [];
  const supabase = getSupabaseClient();

  const providerOrder: ProviderName[] = ['perigon', 'benzinga', 'newsapi'];
  const live = await pullLiveHeadlines(params, providerOrder, errors);
  let ingested = 0;
  let provider: ProviderName = live.provider ?? 'supabase';
  const strictLive = evaluateRelevantHeadlines(dedupeHeadlines(live.items), 35);
  const softLive = evaluateRelevantHeadlines(dedupeHeadlines(live.items), 26);
  const looseLive = evaluateRelevantHeadlines(dedupeHeadlines(live.items), 18);
  const livePicked =
    strictLive.accepted.length >= Math.min(params.limit, 8)
      ? strictLive.accepted
      : softLive.accepted.length >= Math.min(params.limit, 5)
      ? softLive.accepted
      : looseLive.accepted;
  const finalLiveItems = await hydrateHeadlineImages(livePicked.map(addRelevanceTags), 6);

  if (isDev()) {
    console.debug('[api/news][headlines][live]', {
      rawCount: live.items.length,
      normalizedCount: dedupeHeadlines(live.items).length,
      relevantCount: strictLive.accepted.length,
      droppedNoiseCount: strictLive.droppedNoiseCount,
      minScoreUsed:
        strictLive.accepted.length >= Math.min(params.limit, 8)
          ? 35
          : softLive.accepted.length >= Math.min(params.limit, 5)
          ? 26
          : 18,
    });
  }

  if (supabase && finalLiveItems.length > 0) {
    ingested = await upsertHeadlines(supabase, finalLiveItems, errors);
  }

  let supabaseItems: HeadlineItem[] = [];
  if (supabase) {
    supabaseItems = await readHeadlinesFromSupabase(supabase, params, errors);
  }
  const strictSupabase = evaluateRelevantHeadlines(dedupeHeadlines(supabaseItems), 35);
  const softSupabase = evaluateRelevantHeadlines(dedupeHeadlines(supabaseItems), 26);
  const looseSupabase = evaluateRelevantHeadlines(dedupeHeadlines(supabaseItems), 18);
  const supabasePicked =
    strictSupabase.accepted.length >= Math.min(params.limit, 8)
      ? strictSupabase.accepted
      : softSupabase.accepted.length >= Math.min(params.limit, 5)
      ? softSupabase.accepted
      : looseSupabase.accepted;
  const finalSupabaseItems = supabasePicked.map(addRelevanceTags);

  if (isDev()) {
    console.debug('[api/news][headlines][supabase]', {
      rawCount: supabaseItems.length,
      normalizedCount: dedupeHeadlines(supabaseItems).length,
      relevantCount: strictSupabase.accepted.length,
      droppedNoiseCount: strictSupabase.droppedNoiseCount,
      minScoreUsed:
        strictSupabase.accepted.length >= Math.min(params.limit, 8)
          ? 35
          : softSupabase.accepted.length >= Math.min(params.limit, 5)
          ? 26
          : 18,
    });
  }

  // Backfill: keep non-noise market-ish items rather than hard-empty.
  const salvage = dedupeHeadlines([...supabaseItems, ...live.items])
    .map((item) => ({
      item,
      relevance: assessHeadlineRelevance({
        title: item.title,
        description: item.description,
        source: item.source,
        minScore: 0,
      }),
    }))
    .filter(
      (entry) =>
        !entry.relevance.reasons.includes('noise:detected') &&
        entry.relevance.eventType !== 'other' &&
        entry.relevance.score >= 18
    )
    .sort((a, b) => b.relevance.score - a.relevance.score)
    .map(({ item, relevance }) =>
      addRelevanceTags({
        ...item,
        relevance,
      })
    )
    .slice(0, params.limit);

  const preferred = dedupeHeadlines([...finalLiveItems, ...finalSupabaseItems]).slice(0, params.limit);
  const minimumTarget = Math.min(params.limit, 6);
  const blended =
    preferred.length >= minimumTarget
      ? preferred
      : dedupeHeadlines([...preferred, ...salvage]).slice(0, params.limit);
  const demoHeadlines = buildDemoHeadlines(params, params.limit);
  const supplemented =
    blended.length >= minimumTarget
      ? blended
      : dedupeHeadlines([...blended, ...demoHeadlines]).slice(0, params.limit);

  if (supplemented.length > 0) {
    const fromSupabaseCount = supplemented.filter((item) => finalSupabaseItems.some((cached) => cached.url === item.url)).length;
    const usedDemoFallback = supplemented.some((item) => (item.tags ?? []).includes('demo'));
    const responseErrors = usedDemoFallback ? [...errors, 'fallback:demo_headlines'] : errors;
    return {
      ok: true,
      provider: live.provider ?? (fromSupabaseCount > 0 ? 'supabase' : usedDemoFallback ? 'demo' : provider),
      items: supplemented,
      meta: { ingested, fromSupabase: fromSupabaseCount, errors: responseErrors },
    };
  }

  return {
    ok: true,
    provider: 'none',
    items: [],
    meta: { ingested: 0, fromSupabase: 0, errors },
  };
}

async function handleEvents(params: Params): Promise<EventsResponse> {
  const errors: string[] = [];
  const supabase = getSupabaseClient();

  const live = await pullLiveHeadlines(params, ['perigon', 'benzinga', 'newsapi'], errors);
  const strictLive = evaluateRelevantHeadlines(dedupeHeadlines(live.items), 35);
  const softLive = evaluateRelevantHeadlines(dedupeHeadlines(live.items), 26);
  const looseLive = evaluateRelevantHeadlines(dedupeHeadlines(live.items), 10);
  const selectedForEvents =
    strictLive.accepted.length >= 8
      ? strictLive.accepted
      : softLive.accepted.length >= 6
      ? softLive.accepted
      : looseLive.accepted;
  const contextSnapshot = buildMarketContextSnapshot(selectedForEvents, params);
  const eventClusters = clusterRelevantHeadlines(selectedForEvents, Math.max(params.limit * 2, 24));
  const baseEvents = dedupeEvents(eventClusters.map(toEventFromCluster)).slice(0, params.limit);
  const secondaryEvents = dedupeEvents(
    eventClusters.flatMap((cluster) =>
      cluster.items.slice(1, 3).map((item) =>
        toEventFromCluster({
          eventType: cluster.eventType,
          theme: cluster.theme,
          items: [item],
        })
      )
    )
  );
  const seededEvents = dedupeEvents([...baseEvents, ...secondaryEvents]).slice(0, params.limit);

  if (isDev()) {
    console.debug('[api/news][events][live]', {
      rawCount: live.items.length,
      normalizedCount: dedupeHeadlines(live.items).length,
      relevantCount: strictLive.accepted.length,
      droppedNoiseCount: strictLive.droppedNoiseCount,
      eventClusterCount: eventClusters.length,
      minScoreUsed: strictLive.accepted.length >= 8 ? 35 : softLive.accepted.length >= 6 ? 26 : 10,
      seededCount: seededEvents.length,
    });
  }
  const derivedLiveEvents = await Promise.all(
    seededEvents.map(async (event) => {
      const primarySource = event.sources[0];
      if (!primarySource) return event;
      try {
        const enrichment = await getEnrichmentForHeadline({
          title: event.title,
          description: `${event.what_happened}\nSources: ${event.sources
            .slice(0, 4)
            .map((source) => `${source.source}: ${source.title}`)
            .join(' | ')}`,
          mode: 'general',
          contextLines: [
            contextSnapshot.summaryLine,
            contextSnapshot.themeLine,
            ...contextSnapshot.headlineLines,
            `Current event to analyze: ${event.title}`,
          ],
          // cache key should be cluster-specific, not just primary source url
          url: `event://${hashId(`${event.id}|${event.title}|${event.sources.map((source) => source.url).join('|')}`)}`,
        });
        return {
          ...event,
          ai_summary: enrichment.ai_summary ?? event.ai_summary,
          why_it_matters: enrichment.why_it_matters ?? event.why_it_matters,
          impacted_sectors:
            enrichment.impacted_sectors.length > 0
              ? enrichment.impacted_sectors
              : event.impacted_sectors,
          impacted_tickers:
            enrichment.impacted_tickers.length > 0
              ? enrichment.impacted_tickers
              : event.impacted_tickers,
          confidence: enrichment.confidence ?? event.confidence,
        } satisfies EventItem;
      } catch (error) {
        if (isDev()) {
          console.error('[api/news] event enrichment failed', {
            title: event.title,
            url: primarySource.url,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return event;
      }
    })
  );
  let ingested = 0;

  if (supabase && derivedLiveEvents.length > 0) {
    ingested = await upsertEvents(supabase, derivedLiveEvents, params, errors, live.provider);
  }

  let supabaseEvents: EventItem[] = [];
  const minimumEvents = Math.min(params.limit, params.range === '1D' ? 4 : params.range === '3D' ? 7 : 9);
  if (supabase && (ingested > 0 || derivedLiveEvents.length < minimumEvents)) {
    supabaseEvents = await readEventsFromSupabase(supabase, params, errors);
  }

  const liveDetailed = derivedLiveEvents.map(makeDetailedEvent);
  const cachedDetailed = supabaseEvents.map(makeDetailedEvent);
  const blended = dedupeEvents([...liveDetailed, ...cachedDetailed]).slice(0, params.limit);
  const demoEvents = buildDemoEvents(params, params.limit);
  const supplemented =
    blended.length >= minimumEvents
      ? blended
      : dedupeEvents([...blended, ...demoEvents]).slice(0, params.limit);

  if (supplemented.length > 0) {
    const fromSupabase = supplemented.filter((event) => cachedDetailed.some((cached) => cached.id === event.id)).length;
    const usedDemoFallback = supplemented.some((event) => (event.tags ?? []).includes('demo'));
    const responseErrors = usedDemoFallback ? [...errors, 'fallback:demo_events'] : errors;
    return {
      ok: true,
      provider: live.provider ?? (fromSupabase > 0 ? 'supabase' : usedDemoFallback ? 'demo' : 'newsapi'),
      items: supplemented,
      events: supplemented,
      meta: { ingested, fromSupabase, errors: responseErrors },
    };
  }

  return {
    ok: true,
    provider: live.provider ?? (supabase ? 'supabase' : 'none'),
    items: [],
    events: [],
    meta: { ingested: 0, fromSupabase: 0, errors },
  };
}

export async function GET(request: NextRequest) {
  const parsed = parseParams(request);
  if (!parsed.ok) {
    return json(
      {
        ok: false,
        error: 'invalid_params',
        details: parsed.details,
        allowed: { type: TYPE_VALUES, range: RANGE_VALUES, limit: '1..100' },
      },
      400
    );
  }

  const params = parsed.value;
  try {
    if (params.type === 'events') {
      const eventsPayload = await handleEvents(params);
      return json(eventsPayload, 200);
    }
    const headlinesPayload = await handleHeadlines(params);
    return json(headlinesPayload, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'route_failed';
    if (isDev()) console.error('[api/news] fatal', message);
    return json(
      {
        ok: false,
        error: 'provider_failed',
        details: { message },
      },
      502
    );
  }
}
