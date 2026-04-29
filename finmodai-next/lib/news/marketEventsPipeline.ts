import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TRIGGER_QUERIES, type TriggerQueryId, PROVIDER_FETCH_LIMIT, MAX_FETCH_PER_QUERY_PROVIDER } from '@/lib/events/queries';
import { gateAndScoreCandidates, type EventCandidate, type GatedCandidate, type GateCategory } from '@/lib/events/gateScore';
import { clusterCandidates, type EventCluster } from '@/lib/events/cluster';
import { classifyClusterWithOpenAI, type ClassifyDiagnostics } from '@/lib/events/classify';
import {
  getSupabaseServiceClient,
  isEventsCacheFresh,
  markStaleEventsResolved,
  readActiveOrResolvedEvents,
  readExistingEventMeta,
  upsertEvents,
  type EventUpsertPayload,
  type ExistingEventMeta,
} from '@/lib/events/store';
import {
  marketEventSchema,
  marketEventsProviderSchema,
  marketEventsViewSchema,
  type MarketEvent,
  type MarketImpact,
  type MarketEventHorizon,
  type MarketEventsProvider,
  type MarketEventsView,
  type MarketEventSource,
  type MarketEventType,
} from '@/lib/news/marketEventsTypes';
import { buildHeadlineImageQuery } from '@/lib/headlineQuery';
import { searchPexelsPhotos } from '@/lib/pexels';

type ProviderKey = 'newsapi' | 'perigon' | 'benzinga' | 'marketaux';

type PipelineDiagnostics = {
  fetched: number;
  deduped: number;
  gated: number;
  clustered: number;
  classified: number;
  stored: number;
  returned: number;
  lastFetchAt?: string;
  cacheHit: boolean;
  openaiCallCount: number;
  openaiErrors: string[];
  schemaParseFailures: number;
  fetchedSampleIds: string[];
  gatedSampleIds: string[];
  clusteredSampleIds: string[];
  classifiedSampleIds: string[];
  persistedSampleIds: string[];
  classifierRawSamples: string[];
};

type ClassifiedThread = {
  fingerprint: string;
  event: MarketEvent;
  keyEntities: string[];
};

const CACHE_FRESH_MS = 2 * 60 * 60 * 1000;
const ACTIVE_LOOKBACK_DAYS = 30;
const ACTIVE_MIN_SEVERITY = 70;
const MAX_ACTIVE_EVENTS = 20;
const MAX_CLUSTER_COUNT = 45;
const MAX_SOURCES_PER_CLUSTER = 8;
const MAX_PEXELS_IMAGE_RESOLVES = 12;

const MATERIAL_KEYWORD_PATTERNS: RegExp[] = [
  /\binvasion\b/i,
  /\bairstrike\b/i,
  /\bmissile\b/i,
  /\bsanctions?\b/i,
  /\bexport controls?\b/i,
  /\bdefault\b/i,
  /\bbank failure\b/i,
  /\brate decision\b/i,
  /\bemergency meeting\b/i,
  /\bliquidity facility\b/i,
  /\bcapital controls?\b/i,
  /\bproduction cut\b/i,
  /\bguidance\b/i,
  /\bearnings\b/i,
  /\bcapex\b/i,
];

const MEGA_CAP_WHITELIST = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA'];

function nowIso(): string {
  return new Date().toISOString();
}

function pushLimited(list: string[], value: string, max = 8): void {
  if (!value || list.length >= max) return;
  list.push(value);
}

function createDiagnostics(): PipelineDiagnostics {
  return {
    fetched: 0,
    deduped: 0,
    gated: 0,
    clustered: 0,
    classified: 0,
    stored: 0,
    returned: 0,
    lastFetchAt: nowIso(),
    cacheHit: false,
    openaiCallCount: 0,
    openaiErrors: [],
    schemaParseFailures: 0,
    fetchedSampleIds: [],
    gatedSampleIds: [],
    clusteredSampleIds: [],
    classifiedSampleIds: [],
    persistedSampleIds: [],
    classifierRawSamples: [],
  };
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return PROVIDER_FETCH_LIMIT;
  return Math.max(20, Math.min(MAX_FETCH_PER_QUERY_PROVIDER, Math.floor(limit)));
}

function parseIso(value: unknown): string {
  if (typeof value !== 'string') return nowIso();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return nowIso();
  return d.toISOString();
}

function stableId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function optionalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizeCandidate(input: {
  title?: unknown;
  description?: unknown;
  url?: unknown;
  source?: unknown;
  imageUrl?: unknown;
  publishedAt?: unknown;
  provider: ProviderKey;
  queryId: TriggerQueryId;
}): EventCandidate | null {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!title || !url) return null;

  return {
    id: stableId(`${url}|${title}`),
    title,
    description: typeof input.description === 'string' && input.description.trim() ? input.description.trim() : null,
    url,
    source: typeof input.source === 'string' && input.source.trim() ? input.source.trim() : input.provider,
    imageUrl: optionalUrl(input.imageUrl),
    provider: input.provider,
    publishedAt: parseIso(input.publishedAt),
    queryId: input.queryId,
  };
}

function dedupeCandidates(candidates: EventCandidate[]): EventCandidate[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: EventCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedUrl = candidate.url.toLowerCase();
    const normalizedTitle = candidate.title.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenUrl.has(normalizedUrl) || seenTitle.has(normalizedTitle)) continue;
    seenUrl.add(normalizedUrl);
    seenTitle.add(normalizedTitle);
    out.push(candidate);
  }

  return out;
}

function buildFromDateIso(days = 30): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

async function fetchNewsApi(query: string, queryId: TriggerQueryId, limit: number): Promise<EventCandidate[]> {
  const apiKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  if (!apiKey) return [];

  const qs = new URLSearchParams({
    apiKey,
    q: query,
    language: 'en',
    sortBy: 'publishedAt',
    from: buildFromDateIso(30),
    pageSize: String(limit),
  });

  const response = await fetch(`https://newsapi.org/v2/everything?${qs.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`NEWSAPI_HTTP_${response.status}`);

  const payload = (await response.json()) as { articles?: Array<Record<string, unknown>> };
  const rows = Array.isArray(payload.articles) ? payload.articles : [];

  return rows
    .map((row) =>
      normalizeCandidate({
        title: row.title,
        description: row.description,
        url: row.url,
        source: (row.source as Record<string, unknown> | undefined)?.name,
        imageUrl: row.urlToImage,
        publishedAt: row.publishedAt,
        provider: 'newsapi',
        queryId,
      })
    )
    .filter((item): item is EventCandidate => item !== null)
    .slice(0, limit);
}

async function fetchPerigon(query: string, queryId: TriggerQueryId, limit: number): Promise<EventCandidate[]> {
  const apiKey = process.env.PERIGON_API_KEY;
  if (!apiKey) return [];

  const qs = new URLSearchParams({
    apiKey,
    q: query,
    from: buildFromDateIso(30),
    sortBy: 'date',
    size: String(limit),
  });

  const perigonOrigin = process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : 'https://capital-base.com';
  const response = await fetch(`https://api.goperigon.com/v1/all?${qs.toString()}`, {
    cache: 'no-store',
    headers: { Referer: perigonOrigin, Origin: perigonOrigin },
  });
  if (!response.ok) throw new Error(`PERIGON_HTTP_${response.status}`);

  const payload = (await response.json()) as { articles?: Array<Record<string, unknown>> };
  const rows = Array.isArray(payload.articles) ? payload.articles : [];

  return rows
    .map((row) =>
      normalizeCandidate({
        title: row.title,
        description: row.summary ?? row.description,
        url: row.url,
        source: row.source ?? row.sourceDomain,
        imageUrl: row.imageUrl ?? row.image_url ?? row.image,
        publishedAt: row.publishedAt,
        provider: 'perigon',
        queryId,
      })
    )
    .filter((item): item is EventCandidate => item !== null)
    .slice(0, limit);
}

async function fetchBenzinga(query: string, queryId: TriggerQueryId, limit: number): Promise<EventCandidate[]> {
  const apiKey = process.env.BENZINGA_API_KEY || process.env.BENZINGA_KEY;
  if (!apiKey) return [];

  const qs = new URLSearchParams({
    token: apiKey,
    channels: 'economics,markets,general,earnings',
    dateFrom: buildFromDateIso(30),
    pageSize: String(limit),
    displayOutput: 'full',
    search: query,
  });

  const response = await fetch(`https://api.benzinga.com/api/v2/news?${qs.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`BENZINGA_HTTP_${response.status}`);

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>>; articles?: Array<Record<string, unknown>> };
  const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.articles) ? payload.articles : [];

  return rows
    .map((row) => {
      const source =
        typeof row.source === 'string'
          ? row.source
          : typeof row.author === 'string'
          ? row.author
          : 'benzinga';
      const publishedAt =
        typeof row.published_at === 'string'
          ? row.published_at
          : typeof row.updated_at === 'string'
          ? row.updated_at
          : row.created;
      return normalizeCandidate({
        title: row.title,
        description: row.description ?? row.teaser,
        url: row.url,
        source,
        imageUrl:
          row.image ??
          row.image_url ??
          row.imageUrl ??
          (Array.isArray(row.images) ? (row.images[0] as Record<string, unknown> | undefined)?.url : undefined),
        publishedAt,
        provider: 'benzinga',
        queryId,
      });
    })
    .filter((item): item is EventCandidate => item !== null)
    .slice(0, limit);
}

async function fetchMarketaux(query: string, queryId: TriggerQueryId, limit: number): Promise<EventCandidate[]> {
  const apiKey = process.env.MARKETAUX_API_KEY;
  if (!apiKey) return [];

  const qs = new URLSearchParams({
    api_token: apiKey,
    search: query,
    language: 'en',
    limit: String(limit),
    published_after: buildFromDateIso(7),
  });

  const response = await fetch(`https://api.marketaux.com/v1/news/all?${qs.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`MARKETAUX_HTTP_${response.status}`);

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows
    .map((row) =>
      normalizeCandidate({
        title: row.title,
        description: row.description,
        url: row.url,
        source: row.source,
        imageUrl: row.image_url,
        publishedAt: row.published_at,
        provider: 'marketaux',
        queryId,
      })
    )
    .filter((item): item is EventCandidate => item !== null)
    .slice(0, limit);
}

async function fetchTriggeredCandidates(diagnostics: PipelineDiagnostics): Promise<EventCandidate[]> {
  const perProviderLimit = clampLimit(PROVIDER_FETCH_LIMIT);
  const tasks: Array<Promise<EventCandidate[]>> = [];

  for (const trigger of TRIGGER_QUERIES) {
    tasks.push(fetchNewsApi(trigger.query, trigger.id, perProviderLimit));
    tasks.push(fetchPerigon(trigger.query, trigger.id, perProviderLimit));
    tasks.push(fetchBenzinga(trigger.query, trigger.id, perProviderLimit));
    tasks.push(fetchMarketaux(trigger.query, trigger.id, perProviderLimit));
  }

  const settled = await Promise.allSettled(tasks);
  const candidates: EventCandidate[] = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      candidates.push(...result.value);
    } else if (diagnostics.openaiErrors.length < 8) {
      diagnostics.openaiErrors.push(`provider_fetch_failed:${String(result.reason).slice(0, 180)}`);
    }
  }

  diagnostics.fetched = candidates.length;
  candidates.slice(0, 8).forEach((item) => pushLimited(diagnostics.fetchedSampleIds, item.id));
  return candidates;
}

function mapDefaultsFromGate(category: Exclude<GateCategory, 'REJECT'>): {
  eventType: MarketEventType;
  horizon: MarketEventHorizon;
  severity: number;
  drivers: string[];
  marketImpact: MarketImpact;
  transmissionPath: string[];
} {
  if (category === 'GEO') {
    return {
      eventType: 'Geopolitics',
      horizon: 'Immediate',
      severity: 82,
      drivers: [
        'Geopolitical escalation raises uncertainty and risk premia.',
        'Cross-border trade and supply chains face disruption risk.',
      ],
      marketImpact: {
        equities: 'Risk-off bias with higher volatility.',
        fx: 'Safe-haven currencies tend to strengthen.',
        oil: 'Upward pressure if the event touches energy supply.',
        credit: 'Spreads can widen as risk appetite fades.',
      },
      transmissionPath: ['Geopolitical escalation -> higher risk premium -> equities softer -> safe havens bid'],
    };
  }
  if (category === 'MACRO') {
    return {
      eventType: 'Macro',
      horizon: 'NearTerm',
      severity: 80,
      drivers: [
        'A macro or policy catalyst is repricing growth and inflation expectations.',
        'Rates and cross-asset positioning adjust as investors reset the policy path.',
      ],
      marketImpact: {
        rates: 'Yields reprice around the policy and inflation signal.',
        fx: 'Currencies move with rate differentials and risk sentiment.',
        equities: 'Equity leadership rotates as discount rates reset.',
        credit: 'Spreads respond to the change in growth and financing conditions.',
      },
      transmissionPath: ['Macro shock -> policy expectations reset -> rates move -> equities and FX reprice'],
    };
  }
  return {
    eventType: 'EarningsMegaCap',
    horizon: 'NearTerm',
    severity: 78,
    drivers: [
      'A mega-cap earnings event is resetting growth expectations.',
      'Capex, margins, or guidance are moving index-level sentiment.',
    ],
    marketImpact: {
      equities: 'Index-level impact through mega-cap weighting.',
      rates: 'Growth-sensitive yields can move modestly on capex/growth read-through.',
      sectors: 'Semis and large-cap tech can reprice in sympathy.',
    },
    transmissionPath: ['Mega-cap earnings surprise -> index leadership reprices -> sector multiples adjust'],
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((item) => item && item.trim().length > 0)));
}

function deriveClusterKeywords(cluster: EventCluster): Set<string> {
  const text = cluster.items.map((item) => `${item.title} ${item.description || ''}`).join(' ').toLowerCase();
  const keywords = new Set<string>();
  for (const pattern of MATERIAL_KEYWORD_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      keywords.add(pattern.source.toLowerCase());
    }
  }
  return keywords;
}

function existingKeywords(existing: ExistingEventMeta): Set<string> {
  const text = `${existing.summaryBullets.join(' ')} ${existing.keyEntities.join(' ')}`.toLowerCase();
  const keywords = new Set<string>();
  for (const pattern of MATERIAL_KEYWORD_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) keywords.add(pattern.source.toLowerCase());
  }
  return keywords;
}

function shouldClassifyCluster(cluster: EventCluster, existing: ExistingEventMeta | undefined): boolean {
  if (!existing) return true;

  const clusterTs = new Date(cluster.lastUpdatedAt).getTime();
  const existingTs = new Date(existing.lastUpdatedAt).getTime();
  const hasNewerTimestamp = Number.isFinite(clusterTs) && Number.isFinite(existingTs) && clusterTs > existingTs;
  if (!hasNewerTimestamp) return false;

  const newUrls = cluster.items.filter((item) => !existing.sourceUrls.has(item.url));
  if (newUrls.length === 0) return false;

  const clusterKeywords = deriveClusterKeywords(cluster);
  const priorKeywords = existingKeywords(existing);
  const hasNewKeyFactKeyword = Array.from(clusterKeywords).some((keyword) => !priorKeywords.has(keyword));
  return hasNewKeyFactKeyword;
}

function deterministicStatus(cluster: EventCluster): 'developing' | 'confirmed' | 'resolved' {
  const text = cluster.items.map((item) => item.title.toLowerCase()).join(' ');
  if (/\b(resolved|settled|de-escalation|withdrawn)\b/.test(text)) return 'resolved';
  if (/\b(confirmed|approved|official|passed)\b/.test(text)) return 'confirmed';
  return 'developing';
}

function buildSources(cluster: EventCluster): MarketEventSource[] {
  return cluster.items.slice(0, MAX_SOURCES_PER_CLUSTER).map((item) => ({
    name: item.source,
    url: item.url,
    title: item.title,
    snippet: item.description || undefined,
    imageUrl: item.imageUrl,
    publishedAt: item.publishedAt,
  }));
}

function buildClassifyDiagnostics(diagnostics: PipelineDiagnostics): ClassifyDiagnostics {
  return {
    openaiCallCount: diagnostics.openaiCallCount,
    openaiErrors: diagnostics.openaiErrors,
    schemaParseFailures: diagnostics.schemaParseFailures,
    rawSamples: diagnostics.classifierRawSamples,
  };
}

function inferImageCategory(cluster: EventCluster): string {
  const text = cluster.items.map((item) => `${item.title} ${item.description || ''}`).join(' ').toLowerCase();
  if (/\b(oil|opec|brent|wti|crude|refinery|tanker)\b/.test(text)) return 'energy';
  if (/\b(ship|shipping|strait|canal|cargo|port|freight|route)\b/.test(text)) return 'supply_chain';
  if (/\b(crypto|bitcoin|ether|token|stablecoin)\b/.test(text)) return 'crypto';
  if (/\b(chip|chips|gpu|gpus|semiconductor|semis|datacenter|data center|ai)\b/.test(text)) return 'ai_semis';
  const firstItem = cluster.items[0];
  if (!firstItem) return 'default';
  if (firstItem.gateCategory === 'GEO') return 'geopolitics';
  if (firstItem.gateCategory === 'MACRO') return 'rates_inflation';
  if (firstItem.gateCategory === 'EARNINGS') return 'ai_semis';
  return 'default';
}

async function resolveClusterImageUrl(cluster: EventCluster): Promise<string | undefined> {
  const query = buildHeadlineImageQuery({
    headline: cluster.canonicalTitle,
    category: inferImageCategory(cluster),
  });

  try {
    const photos = await searchPexelsPhotos(query);
    const first = photos.find((photo) => {
      const src = photo.src;
      return Boolean(src.landscape || src.large || src.large2x || src.medium || src.original);
    });
    return (
      first?.src.landscape ||
      first?.src.large ||
      first?.src.large2x ||
      first?.src.medium ||
      first?.src.original
    );
  } catch {
    return undefined;
  }
}

function absorbClassifyDiagnostics(target: PipelineDiagnostics, source: ClassifyDiagnostics): void {
  target.openaiCallCount = source.openaiCallCount;
  target.schemaParseFailures = source.schemaParseFailures;
  target.openaiErrors = source.openaiErrors.slice(0, 8);
  target.classifierRawSamples = source.rawSamples ? source.rawSamples.slice(0, 5) : [];
}

type DemoSeedImageKind =
  | 'oil'
  | 'fed'
  | 'trade'
  | 'growth';

function buildSeedIllustration(kind: DemoSeedImageKind, accent: string): string {
  switch (kind) {
    case 'oil':
      return `
        <path d="M170 430C250 360 360 340 450 370C520 392 585 442 655 446C748 450 820 388 900 360C968 336 1034 334 1095 356L1095 595L170 595Z" fill="rgba(15,23,42,0.72)" />
        <path d="M330 470C390 435 447 422 510 438C574 454 621 492 685 503C760 516 830 486 890 450C955 412 1025 401 1095 422" stroke="rgba(248,250,252,0.18)" stroke-width="10" fill="none" stroke-linecap="round" />
        <rect x="260" y="286" width="242" height="88" rx="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" />
        <rect x="502" y="308" width="118" height="66" rx="16" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" />
        <rect x="620" y="330" width="180" height="44" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" />
        <circle cx="415" cy="330" r="24" fill="${accent}" opacity="0.24" />
        <path d="M910 208C944 252 969 281 969 319C969 364 935 396 892 396C849 396 815 364 815 319C815 282 858 250 892 208Z" fill="${accent}" opacity="0.76" />
      `;
    case 'fed':
      return `
        <rect x="250" y="250" width="380" height="210" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" />
        <polygon points="440,180 220,252 660,252" fill="rgba(255,255,255,0.08)" />
        <rect x="286" y="282" width="40" height="126" rx="10" fill="rgba(248,250,252,0.12)" />
        <rect x="362" y="282" width="40" height="126" rx="10" fill="rgba(248,250,252,0.12)" />
        <rect x="438" y="282" width="40" height="126" rx="10" fill="rgba(248,250,252,0.12)" />
        <rect x="514" y="282" width="40" height="126" rx="10" fill="rgba(248,250,252,0.12)" />
        <path d="M735 440L815 370L884 396L949 310L1030 336" stroke="${accent}" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="735" cy="440" r="11" fill="${accent}" />
        <circle cx="815" cy="370" r="11" fill="${accent}" />
        <circle cx="884" cy="396" r="11" fill="${accent}" />
        <circle cx="949" cy="310" r="11" fill="${accent}" />
        <circle cx="1030" cy="336" r="11" fill="${accent}" />
      `;
    case 'trade':
      return `
        <rect x="240" y="305" width="170" height="98" rx="16" fill="rgba(249,115,22,0.18)" stroke="rgba(249,115,22,0.34)" />
        <rect x="418" y="280" width="170" height="123" rx="16" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" />
        <rect x="596" y="322" width="170" height="81" rx="16" fill="rgba(249,115,22,0.14)" stroke="rgba(249,115,22,0.28)" />
        <path d="M322 230H725" stroke="rgba(248,250,252,0.18)" stroke-width="12" stroke-linecap="round" />
        <path d="M725 230L680 194" stroke="rgba(248,250,252,0.18)" stroke-width="12" stroke-linecap="round" />
        <path d="M725 230L680 266" stroke="rgba(248,250,252,0.18)" stroke-width="12" stroke-linecap="round" />
        <path d="M918 404H786" stroke="${accent}" stroke-width="14" stroke-linecap="round" />
        <path d="M918 404L872 368" stroke="${accent}" stroke-width="14" stroke-linecap="round" />
        <path d="M918 404L872 440" stroke="${accent}" stroke-width="14" stroke-linecap="round" />
      `;
    case 'growth':
      return `
        <rect x="250" y="430" width="88" height="100" rx="16" fill="rgba(255,255,255,0.08)" />
        <rect x="372" y="378" width="88" height="152" rx="16" fill="rgba(255,255,255,0.07)" />
        <rect x="494" y="330" width="88" height="200" rx="16" fill="rgba(255,255,255,0.06)" />
        <rect x="616" y="286" width="88" height="244" rx="16" fill="rgba(255,255,255,0.05)" />
        <path d="M274 258L404 286L548 318L684 366L832 436L988 490" stroke="${accent}" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M988 490L955 444" stroke="${accent}" stroke-width="16" stroke-linecap="round" />
        <path d="M988 490L930 500" stroke="${accent}" stroke-width="16" stroke-linecap="round" />
      `;
  }
}

function buildSeedEventImage(label: string, accent: string, kind: DemoSeedImageKind): string {
  const safeLabel = label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#09111f" />
          <stop offset="100%" stop-color="#020617" />
        </linearGradient>
        <radialGradient id="glow" cx="78%" cy="18%" r="46%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.38" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="675" fill="url(#bg)" />
      <rect width="1200" height="675" fill="url(#glow)" />
      <rect x="76" y="76" width="1048" height="523" rx="28" fill="none" stroke="rgba(255,255,255,0.12)" />
      <rect x="104" y="118" width="240" height="14" rx="7" fill="rgba(255,255,255,0.10)" />
      <rect x="104" y="156" width="132" height="10" rx="5" fill="rgba(255,255,255,0.07)" />
      <circle cx="1000" cy="156" r="84" fill="${accent}" opacity="0.14" />
      <circle cx="208" cy="522" r="68" fill="#ffffff" opacity="0.05" />
      ${buildSeedIllustration(kind, accent)}
      <text x="104" y="486" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">${safeLabel}</text>
      <text x="104" y="540" fill="rgba(248,250,252,0.72)" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" letter-spacing="4">CAPITALBASE EVENTS</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const BLOOMBERG_STYLE_DEMO_COPY: Record<string, Pick<MarketEvent, 'title' | 'drivers'>> = {
  'hormuz-oil-shock': {
    title: 'Oil Risk Premium Jumps as Hormuz Threat Revives Inflation Trade',
    drivers: [
      'Energy supply risk is back in focus as Middle East escalation raises shipping and insurance costs.',
      'Higher crude prices threaten to slow the disinflation path and delay policy relief.',
      'Energy, defense, and safe-haven assets screen best while fuel-sensitive cyclicals remain exposed.',
    ],
  },
  'us-tariff-broadening': {
    title: 'Tariff Shock Puts Margin Risk Back on the Tape',
    drivers: [
      'Broader import duties lift landed-cost uncertainty across semis, autos, retail, and industrial supply chains.',
      'Pass-through risk raises the odds that goods inflation stays sticky into the next CPI cycle.',
      'Domestic defensives hold an edge while multinationals and import-heavy cyclicals face earnings pressure.',
    ],
  },
  'fed-higher-for-longer': {
    title: 'Fed Cut Bets Fade as Oil, Tariffs Keep Inflation Risk Alive',
    drivers: [
      'Policy makers have less room to ease while supply shocks keep inflation expectations firm.',
      'Front-end rates remain sticky as markets reprice away from a clean rescue-cut path.',
      'Quality balance sheets and cash-flow durability matter more as refinancing relief gets delayed.',
    ],
  },
  'ecb-energy-inflation-pause': {
    title: 'ECB Pause Turns Hawkish as Energy Shock Clouds Growth Outlook',
    drivers: [
      'Energy inflation complicates the case for easier policy even as European growth remains soft.',
      'Short-end euro rates stay firmer than a pure slowdown would imply.',
      'European cyclicals and lower-quality credit remain vulnerable to a policy-growth squeeze.',
    ],
  },
  'boj-normalization-volatility': {
    title: 'BOJ Normalization Keeps Global Duration Volatility in Play',
    drivers: [
      'Higher JGB yields pressure carry trades and global duration positioning.',
      'Yen sensitivity rises as Japan narrows the policy gap with other developed markets.',
      'Duration-heavy equities and balance-sheet-sensitive assets remain the cleanest downside channels.',
    ],
  },
  'china-policy-support': {
    title: 'China Stimulus Signal Puts a Floor Under Cyclical Demand',
    drivers: [
      'More proactive fiscal and monetary support reduces the risk of a sharper China demand downdraft.',
      'Commodity and Asia-linked assets get relief if policy follow-through improves credit confidence.',
      'The read-through is stabilization, not a full recovery call.',
    ],
  },
  'imf-shadow-of-war': {
    title: 'IMF Downgrade Reprices the Stagflation Playbook',
    drivers: [
      'Lower growth paired with higher inflation risk weakens the case for broad cyclical beta.',
      'Policy relief becomes less certain when supply shocks keep price pressure elevated.',
      'Quality, pricing power, and defensives screen better than lower-quality cyclicals.',
    ],
  },
  'iea-oil-buffer-release': {
    title: 'IEA Stock Release Caps Oil Panic Without Killing Risk Premium',
    drivers: [
      'Emergency reserves reduce near-term physical shortage risk but do not resolve the underlying supply shock.',
      'Crude upside tail risk eases at the margin while inflation pressure remains relevant.',
      'Airlines and importers get tactical relief, but energy cash-flow strength persists.',
    ],
  },
  'fiscal-term-premia': {
    title: 'Debt Supply Keeps Term-Premium Risk Alive',
    drivers: [
      'Rising public debt and defense spending keep sovereign issuance pressure elevated.',
      'Higher term premia weigh on long-duration equities and levered cyclicals.',
      'Balance-sheet strength and lower-duration cash flows remain favored.',
    ],
  },
  'china-reflation-turn': {
    title: 'China Reflation Signal Lifts Commodity Demand Read-Through',
    drivers: [
      'Firmer CPI and PPI data reduce the prior global disinflation impulse.',
      'Commodity producers and industrial exporters benefit if nominal demand keeps improving.',
      'The signal supports cyclical leadership but still needs confirmation from metals and order data.',
    ],
  },
};

function buildDemoSeedEvents(): MarketEvent[] {
  const now = Date.now();
  const isoOffset = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();
  const demoImageBySeed: Record<string, string> = {
    'hormuz-oil-shock': buildSeedEventImage('Hormuz Oil Shock', '#fb923c', 'oil'),
    'us-tariff-broadening': buildSeedEventImage('Tariff Broadening', '#f97316', 'trade'),
    'fed-higher-for-longer': buildSeedEventImage('Fed Restrictive Bias', '#22c55e', 'fed'),
    'ecb-energy-inflation-pause': buildSeedEventImage('ECB Inflation Pause', '#38bdf8', 'fed'),
    'boj-normalization-volatility': buildSeedEventImage('BOJ Yield Volatility', '#a78bfa', 'fed'),
    'china-policy-support': buildSeedEventImage('China Policy Support', '#14b8a6', 'growth'),
    'imf-shadow-of-war': buildSeedEventImage('IMF Shadow of War', '#f59e0b', 'growth'),
    'iea-oil-buffer-release': buildSeedEventImage('Oil Buffer Release', '#f97316', 'oil'),
    'fiscal-term-premia': buildSeedEventImage('Fiscal Term Premia', '#ef4444', 'growth'),
    'china-reflation-turn': buildSeedEventImage('China Reflation Turn', '#06b6d4', 'growth'),
  };
  const source = (
    seed: string,
    article: {
      name: string;
      url: string;
      title: string;
      snippet: string;
    },
    publishedAt: string
  ): MarketEventSource => ({
    name: article.name,
    url: article.url,
    publishedAt,
    title: article.title,
    snippet: article.snippet,
    imageUrl: demoImageBySeed[seed],
  });
  const mk = (
    seed: string,
    payload: Omit<MarketEvent, 'id' | 'firstSeenAt' | 'lastUpdatedAt' | 'sources'> & {
      ageHours: number;
      firstSeenHours: number;
      source: {
        name: string;
        url: string;
        title: string;
        snippet: string;
      };
    }
  ) => {
    const updatedAt = isoOffset(payload.ageHours);
    const firstSeenAt = isoOffset(payload.firstSeenHours);
    const bloombergStyleCopy = BLOOMBERG_STYLE_DEMO_COPY[seed];
    return marketEventSchema.parse({
      ...payload,
      ...bloombergStyleCopy,
      id: createHash('sha256').update(`demo-seed:${seed}`).digest('hex').slice(0, 24),
      firstSeenAt,
      lastUpdatedAt: updatedAt,
      sources: [source(seed, payload.source, updatedAt)],
    });
  };

  return [
    mk('hormuz-oil-shock', {
      title: 'Hormuz supply shock puts oil, inflation, and shipping risk back at the center of the macro tape',
      eventType: 'Conflict',
      severity: 96,
      horizon: 'Immediate',
      drivers: [
        'The dominant macro shock of the last quarter has been the widening Middle East conflict and the risk that Strait of Hormuz disruption turns into a true energy supply event.',
        'The inflation impulse matters as much as the commodity move because higher fuel and shipping costs tighten financial conditions before central banks are ready to ease.',
        'Cross-asset leadership shifts toward energy, defense, and safe havens while airlines, importers, and fuel-sensitive cyclicals take the first hit.',
      ],
      marketImpact: {
        equities: 'Energy, defense, and commodity-linked equities should keep leading if the conflict remains unresolved, while transports, airlines, and discretionary cyclicals remain vulnerable.',
        rates: 'Oil-led inflation pressure can hold breakevens and real rates up even as growth expectations soften.',
        fx: 'Safe-haven dollar demand and importer-currency pressure both strengthen if commodity and shipping volatility stay elevated.',
        oil: 'Crude risk premium should move first through freight, insurance, and inventory hedging before any confirmed physical outage.',
        sectors: 'Integrated oils, refiners, shipping insurers, and defense names screen best; airlines, chemicals, and import-heavy cyclicals screen worst.',
      },
      transmissionPath: [
        'Conflict escalation -> shipping and energy supply risk rise -> oil and inflation expectations move higher -> policy easing gets harder -> cyclicals and duration de-rate',
      ],
      watchNext: [
        'Watch Strait of Hormuz and Red Sea shipping updates plus tanker insurance pricing.',
        'Watch Brent term structure, diesel cracks, and whether the spot risk premium stays elevated.',
        'Watch whether central banks start treating the oil shock as persistent rather than temporary.',
      ],
      status: 'confirmed',
      ageHours: 12,
      firstSeenHours: 36,
      source: {
        name: 'IEA',
        url: 'https://www.iea.org/reports/oil-market-report-march-2026',
        title: 'Oil Market Report - March 2026',
        snippet: 'The IEA described the Middle East war disruption as the largest supply disruption in the history of the global oil market.',
      },
    }),
    mk('us-tariff-broadening', {
      title: 'U.S. tariff broadening resets the trade regime and reintroduces goods-inflation risk',
      eventType: 'RegulatoryShock',
      severity: 94,
      horizon: 'NearTerm',
      drivers: [
        'The February import surcharge and subsequent tariff broadening across semis, pharmaceuticals, and metals turned trade policy into a primary macro variable again.',
        'That matters through landed costs, supply-chain rerouting, and weaker capex confidence rather than through headlines alone.',
        'Markets are paying up for domestic cash-flow visibility and punishing globally exposed operating leverage until pass-through and retaliation risk look contained.',
      ],
      marketImpact: {
        equities: 'Multinationals, import-heavy retailers, autos, and trade-sensitive industrials stay under pressure while domestic defensives hold up better.',
        fx: 'Trade uncertainty and stickier U.S. inflation risk tend to support the dollar against export-sensitive and emerging-market currencies.',
        credit: 'Lower-visibility cyclicals and margin-sensitive importers can see spread pressure if pass-through hits demand unevenly.',
        sectors: 'Industrials, autos, retail, semis, and hardware remain the cleanest downside buckets while domestic defensives and utilities look safer.',
      },
      transmissionPath: [
        'Tariffs broaden -> landed costs and sourcing uncertainty rise -> pass-through and inflation risk increase -> earnings visibility and trade volumes weaken',
      ],
      watchNext: [
        'Watch whether the current tariff framework broadens beyond current sectors or survives legal challenge intact.',
        'Watch CPI, PPI, and retailer or industrial commentary for signs of tariff pass-through reaching end demand.',
        'Watch retaliation, inventory rerouting, and capex delays across trade-sensitive sectors.',
      ],
      status: 'confirmed',
      ageHours: 72,
      firstSeenHours: 120,
      source: {
        name: 'The White House',
        url: 'https://www.whitehouse.gov/presidential-actions/2026/02/imposing-a-temporary-import-surcharge-to-address-fundamental-international-payments-problems/',
        title: 'Imposing a Temporary Import Surcharge to Address Fundamental International Payments Problems',
        snippet: 'The White House imposed a 10 percent temporary import surcharge, marking a clear broadening of U.S. trade-policy tightening.',
      },
    }),
    mk('fed-higher-for-longer', {
      title: 'Fed stays restrictive as oil and geopolitical uncertainty make a clean easing pivot harder',
      eventType: 'CentralBank',
      severity: 90,
      horizon: 'Immediate',
      drivers: [
        'The March FOMC outcome reinforced higher-for-longer by holding policy restrictive while explicitly flagging Middle East uncertainty.',
        'Oil risk, tariff pass-through, and uneven disinflation make it harder for the Fed to deliver a simple growth-supportive easing cycle.',
        'Markets are repricing toward fewer or later cuts rather than a straightforward rescue-easing path.',
      ],
      marketImpact: {
        equities: 'Long-duration growth and lower-quality cyclicals both struggle when the market loses the simple lower-rates offset.',
        rates: 'Front-end yields can stay sticky while the long end trades the stagflation mix of softer growth but worse inflation optics.',
        fx: 'The dollar remains supported when U.S. rates stay relatively firm despite weaker growth headlines.',
        credit: 'Refinancing-sensitive borrowers face pressure if policy relief is delayed while top-line momentum softens.',
        sectors: 'Financials, energy, and selective defensives hold up better than speculative growth and rate-sensitive balance-sheet stories.',
      },
      transmissionPath: [
        'Oil and geopolitical uncertainty persist -> Fed remains cautious -> real rates and financial conditions stay restrictive -> valuation and refinancing pressure spread',
      ],
      watchNext: [
        'Watch breakevens, gasoline passthrough, and inflation-expectation surveys.',
        'Watch whether FOMC language shifts from uncertainty management to renewed inflation concern.',
        'Watch front-end futures to see whether cuts are merely delayed or meaningfully repriced out.',
      ],
      status: 'confirmed',
      ageHours: 168,
      firstSeenHours: 192,
      source: {
        name: 'Federal Reserve',
        url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260318a.htm',
        title: 'Federal Reserve issues FOMC statement',
        snippet: 'The Fed held rates at 3.50% to 3.75% and flagged uncertainty tied to the Middle East conflict and inflation risk.',
      },
    }),
    mk('ecb-energy-inflation-pause', {
      title: 'ECB pauses but turns more hawkish on near-term inflation risk from energy',
      eventType: 'CentralBank',
      severity: 84,
      horizon: 'Immediate',
      drivers: [
        'The ECB held rates steady in March but explicitly acknowledged that the conflict would have a material near-term inflation impact through higher energy prices.',
        'That creates a tougher European policy mix because growth is already soft while inflation optics are worsening.',
        'European rate-sensitive equities and credit lose the clean lower-rates relief case when energy and geopolitics dominate the policy reaction function.',
      ],
      marketImpact: {
        equities: 'European cyclicals and rate-sensitive sectors remain exposed if the ECB cannot lean dovish into a softer growth backdrop.',
        rates: 'Short-end euro rates remain firmer than a pure growth slowdown would imply.',
        fx: 'The euro gets support from firmer rates but remains vulnerable if growth slows faster than inflation cools.',
        credit: 'European credit can widen if policy stays cautious while demand weakens.',
        sectors: 'Utilities and defensives hold up better than consumer cyclicals, housing-linked exposure, and lower-quality industrials.',
      },
      transmissionPath: [
        'Energy shock lifts near-term inflation -> ECB stays cautious -> European demand sentiment weakens -> cyclicals and lower-quality credit underperform',
      ],
      watchNext: [
        'Watch euro-area inflation prints and whether energy pressure broadens into core pricing.',
        'Watch ECB communication for any move from pause to renewed tightening bias.',
        'Watch European credit spreads and consumer-demand indicators for policy-stress confirmation.',
      ],
      status: 'confirmed',
      ageHours: 696,
      firstSeenHours: 720,
      source: {
        name: 'ECB',
        url: 'https://www.ecb.europa.eu/press/press_conference/monetary-policy-statement/2026/html/ecb.is260319~93b1cbad97.en.html',
        title: 'Monetary policy statement, March 19 2026',
        snippet: 'The ECB said the conflict would have a material impact on near-term inflation through higher energy prices while weighing on growth.',
      },
    }),
    mk('boj-normalization-volatility', {
      title: 'BOJ normalization keeps global bond volatility alive even as oil risk rises',
      eventType: 'CentralBank',
      severity: 79,
      horizon: 'NearTerm',
      drivers: [
        'The BOJ kept moving its normalization process forward while still flagging crude oil and Middle East risks to underlying inflation.',
        'That matters globally because higher JGB yields can disturb carry trades, global duration positioning, and FX funding assumptions.',
        'The result is another source of bond volatility layered on top of the oil and tariff shock already hitting global markets.',
      ],
      marketImpact: {
        equities: 'Global risk assets can wobble when yen-funded carry and duration positioning are forced to adjust together.',
        rates: 'JGB yield pressure can spill into global bond markets and complicate the bullish-duration case elsewhere.',
        fx: 'Yen sensitivity rises when BOJ normalization narrows the gap with other developed-market policy paths.',
        credit: 'Credit sentiment weakens if bond volatility feeds a broader de-risking move across global portfolios.',
        sectors: 'Duration-heavy equities and balance-sheet-sensitive risk assets are the cleanest downstream victims.',
      },
      transmissionPath: [
        'BOJ normalization continues -> JGB yields and yen sensitivity rise -> carry trade and bond volatility increase -> duration-heavy assets de-rate',
      ],
      watchNext: [
        'Watch JGB yields, cross-currency basis, and yen moves for signs of broader funding stress.',
        'Watch whether BOJ communication leans more hawkish if oil keeps underlying CPI firm.',
        'Watch spillover into global duration and carry-trade proxies.',
      ],
      status: 'confirmed',
      ageHours: 696,
      firstSeenHours: 720,
      source: {
        name: 'Bank of Japan',
        url: 'https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2026/k260319a.pdf',
        title: 'Statement on Monetary Policy',
        snippet: 'The BOJ kept the overnight call rate around 0.75% and explicitly cited crude oil and Middle East risks to inflation dynamics.',
      },
    }),
    mk('china-policy-support', {
      title: 'China shifts to stronger policy support to stabilize growth and credit confidence',
      eventType: 'Macro',
      severity: 82,
      horizon: 'NearTerm',
      drivers: [
        'March policy signaling from Beijing turned more openly supportive through proactive fiscal policy, larger bond issuance, and a moderately loose monetary stance.',
        'That puts a floor under commodities and Asian trade cyclicals even if the global backdrop remains difficult.',
        'The macro read-through is less about a clean recovery than about preventing a harder China-led demand downdraft.',
      ],
      marketImpact: {
        equities: 'Materials, industrial exporters, and China-sensitive cyclicals get a relative bid when Beijing leans more aggressively into support.',
        rates: 'China stimulus can soften the global growth scare and steepen commodity-linked inflation expectations at the margin.',
        fx: 'China-sensitive Asian currencies and commodity FX get relief if policy support looks credible.',
        credit: 'China and Asia credit sentiment improves if policy support reduces fears of a deeper domestic slowdown.',
        sectors: 'Metals, machinery, transport, and luxury-adjacent cyclicals benefit most from incremental China support.',
      },
      transmissionPath: [
        'China policy support rises -> demand floor improves for Asia and commodity chains -> global cyclical downside is partly cushioned',
      ],
      watchNext: [
        'Watch fiscal implementation, local-government funding, and issuance follow-through.',
        'Watch commodity demand, credit creation, and property stabilization indicators.',
        'Watch whether policy support improves external demand confidence or merely slows deterioration.',
      ],
      status: 'confirmed',
      ageHours: 336,
      firstSeenHours: 360,
      source: {
        name: 'The State Council Information Office of China',
        url: 'https://english.scio.gov.cn/pressroom/2026-03/06/content_118366257.html',
        title: 'Officials discuss more proactive fiscal policy and stronger support measures',
        snippet: 'Chinese officials outlined more proactive fiscal policy and stronger macro support following the March policy meetings.',
      },
    }),
    mk('imf-shadow-of-war', {
      title: 'IMF downgrade hardens the stagflation regime by pairing weaker growth with higher inflation risk',
      eventType: 'Macro',
      severity: 88,
      horizon: 'NearTerm',
      drivers: [
        'The IMF framed the world economy as operating in the shadow of war, with weaker global growth and renewed inflation pressure.',
        'That is a harder backdrop for risk assets because slower growth no longer guarantees easier central-bank policy.',
        'Markets respond by paying up for quality balance sheets, pricing power, and defensiveness rather than broad cyclical beta.',
      ],
      marketImpact: {
        equities: 'Broad cyclicals and small caps come under pressure when slower growth is paired with renewed inflation risk rather than clean disinflation.',
        rates: 'Duration gets a mixed signal because weaker growth is offset by inflation and supply-shock uncertainty.',
        fx: 'Trade-linked and imported-energy currencies remain vulnerable if the downgrade broadens risk aversion.',
        credit: 'Lower-quality credit can widen as slower growth and tighter financing conditions begin to overlap.',
        sectors: 'Defensives, quality compounders, and energy cash-flow beneficiaries screen better than cyclical beta and balance-sheet-sensitive growth.',
      },
      transmissionPath: [
        'Global growth is downgraded while inflation risk rises -> policy relief looks less certain -> cyclicals and lower-quality risk assets underperform',
      ],
      watchNext: [
        'Watch whether major developed-market forecasts follow the IMF lower over coming weeks.',
        'Watch cross-asset confirmation from small caps, cyclicals, breakevens, and credit spreads.',
        'Watch whether management commentary shifts from resilience to explicit caution on demand and inventory.',
      ],
      status: 'confirmed',
      ageHours: 72,
      firstSeenHours: 96,
      source: {
        name: 'IMF',
        url: 'https://www.imf.org/en/publications/weo/issues/2026/04/14/world-economic-outlook-april-2026',
        title: 'World Economic Outlook, April 2026',
        snippet: 'The IMF cut its 2026 global growth view and warned that the conflict backdrop would also raise inflation pressure.',
      },
    }),
    mk('iea-oil-buffer-release', {
      title: 'Emergency oil-buffer release becomes the policy response to a genuine supply shock',
      eventType: 'Macro',
      severity: 81,
      horizon: 'NearTerm',
      drivers: [
        'The IEA announced the largest coordinated oil stock release in its history while OPEC+ resumed gradual output increases for April.',
        'That is a policy acknowledgment that the energy shock is systemically important, not just a transient market scare.',
        'The release caps some extreme upside tail risk in crude but does not eliminate the inflation impulse if conflict risk persists.',
      ],
      marketImpact: {
        equities: 'The release tempers the most extreme tail-risk pricing in oil while still leaving energy and defense leadership intact.',
        rates: 'Inflation breakevens can cool at the margin if markets believe the stock release will smooth physical shortages.',
        fx: 'Importer currencies get some relief if the release limits the near-term spike in crude and freight stress.',
        oil: 'The release caps upside oil panic but cannot erase the risk premium if the underlying conflict remains unresolved.',
        sectors: 'Airlines and importers get tactical relief, but energy cash-flow beneficiaries still hold a structural edge if conflict risk persists.',
      },
      transmissionPath: [
        'Supply shock triggers emergency buffer release -> oil tail risk is capped at the margin -> panic pricing eases but inflation pressure remains elevated',
      ],
      watchNext: [
        'Watch whether the release meaningfully changes inventory draws and front-end crude tightness.',
        'Watch OPEC+ supply follow-through and whether geopolitical disruption offsets the added barrels.',
        'Watch inflation breakevens and transport margins for signs that the policy response is buying time.',
      ],
      status: 'confirmed',
      ageHours: 504,
      firstSeenHours: 528,
      source: {
        name: 'IEA',
        url: 'https://www.iea.org/news/iea-member-countries-to-carry-out-largest-ever-oil-stock-release-amid-market-disruptions-from-middle-east-conflict',
        title: 'IEA member countries to carry out largest-ever oil stock release',
        snippet: 'The IEA announced a 400 million barrel coordinated stock release in response to the Middle East conflict disruption.',
      },
    }),
    mk('fiscal-term-premia', {
      title: 'Rising global debt and defense spending keep term premia and sovereign-risk concerns alive',
      eventType: 'Macro',
      severity: 76,
      horizon: 'Structural',
      drivers: [
        'The IMF warned that global public debt is rising toward 100 percent of GDP, with interest burdens and defense spending amplifying refinancing risk.',
        'That matters for equities through higher term premia and more persistent multiple pressure rather than through a single growth print.',
        'A more fragile sovereign backdrop raises the cost of policy mistakes and leaves less room for clean stimulus responses to future shocks.',
      ],
      marketImpact: {
        equities: 'Higher term premia weigh on market multiples, especially for long-duration equities and heavily levered cyclicals.',
        rates: 'Sovereign term premia stay elevated as debt supply and inflation risk complicate the lower-yield case.',
        fx: 'Currencies with weaker fiscal credibility remain more exposed when sovereign-risk pricing becomes more discriminating.',
        credit: 'Credit spreads widen more easily when sovereign funding conditions deteriorate and risk-free rates stay high.',
        sectors: 'Lower-duration cash generators and balance-sheet strength screen better than leveraged, rate-sensitive sectors.',
      },
      transmissionPath: [
        'Public debt and fiscal stress rise -> sovereign term premia stay elevated -> risk-free rates and discount rates remain higher -> equity multiples compress',
      ],
      watchNext: [
        'Watch sovereign issuance calendars, auction tails, and fiscal commentary from major developed markets.',
        'Watch whether higher defense spending is paired with weaker fiscal anchors.',
        'Watch whether term premia remain elevated even if growth data weaken.',
      ],
      status: 'confirmed',
      ageHours: 48,
      firstSeenHours: 72,
      source: {
        name: 'IMF',
        url: 'https://www.imf.org/en/publications/fm/issues/2026/04/15/fiscal-monitor-april-2026',
        title: 'Fiscal Monitor, April 2026',
        snippet: 'The IMF said global public debt reached just under 94 percent of GDP in 2025 and is on track to approach 100 percent by 2029.',
      },
    }),
    mk('china-reflation-turn', {
      title: 'China reflation signals reduce the global disinflation impulse and support commodity demand',
      eventType: 'Macro',
      severity: 73,
      horizon: 'NearTerm',
      drivers: [
        'March China CPI and PPI data pointed to a modest reflation turn after a long period of weak pricing power.',
        'That matters globally because stronger China nominal demand supports commodities and industrial exporters while reducing a prior disinflation tailwind for importers.',
        'The signal is not a full recovery call, but it is relevant for the global inflation-growth mix and commodity-linked equity leadership.',
      ],
      marketImpact: {
        equities: 'Commodity producers, machinery, and industrial exporters benefit if China nominal demand keeps improving.',
        rates: 'A China reflation turn weakens the global disinflation case at the margin and supports commodity-linked inflation expectations.',
        fx: 'Commodity FX and Asia-sensitive currencies improve if China demand expectations stabilize.',
        credit: 'China and Asia cyclical credit sentiment improves if the reflation turn proves durable.',
        sectors: 'Metals, mining, industrials, and capital-goods exposure benefit most from stronger China pricing power.',
      },
      transmissionPath: [
        'China CPI and PPI turn firmer -> nominal demand outlook improves -> commodity and industrial demand expectations stabilize -> global disinflation impulse weakens',
      ],
      watchNext: [
        'Watch whether China PPI stays positive and broadens beyond base effects.',
        'Watch iron ore, copper, and industrial export order data for confirmation.',
        'Watch whether stronger pricing power feeds through to a firmer global commodity tape.',
      ],
      status: 'confirmed',
      ageHours: 96,
      firstSeenHours: 120,
      source: {
        name: 'National Bureau of Statistics of China',
        url: 'https://www.stats.gov.cn/english/PressRelease/202604/t20260413_1963289.html',
        title: 'Producer price index for industrial products, March 2026',
        snippet: 'China PPI turned positive in March, reinforcing the view that the economy is moving away from persistent producer-price deflation.',
      },
    }),
  ];
}

function score(event: MarketEvent): number {
  return event.severity;
}

function filterForView(events: MarketEvent[], view: MarketEventsView, limit: number): MarketEvent[] {
  const cutoffMs = Date.now() - ACTIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const selected = events.filter((event) => {
    if (view === 'resolved') return event.status === 'resolved';
    const updatedMs = new Date(event.lastUpdatedAt).getTime();
    if (event.status === 'resolved') return false;
    if (!Number.isFinite(updatedMs) || updatedMs < cutoffMs) return false;
    return event.severity >= ACTIVE_MIN_SEVERITY;
  });

  selected.sort((a, b) => {
    if (score(b) !== score(a)) return score(b) - score(a);
    return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
  });

  const cap = view === 'active' ? Math.min(limit, MAX_ACTIVE_EVENTS) : limit;
  return selected.slice(0, cap);
}

function liveClassifierUnavailable(diagnostics: PipelineDiagnostics, classifiedCount: number): boolean {
  if (classifiedCount > 0) return false;
  if (diagnostics.openaiCallCount <= 0) return false;
  return (
    diagnostics.openaiErrors.some((error) => /^(provider_call_failed|classifier_no_response):/.test(error)) ||
    diagnostics.schemaParseFailures >= diagnostics.openaiCallCount
  );
}

function buildClassifierFallbackResult(params: {
  view: MarketEventsView;
  requestedLimit: number;
  diagnostics: PipelineDiagnostics;
}): {
  provider: MarketEventsProvider;
  fallback: boolean;
  events: MarketEvent[];
  warning: string;
  message: string;
  diagnostics: PipelineDiagnostics;
} {
  const events = filterForView(buildDemoSeedEvents(), params.view, params.requestedLimit);
  params.diagnostics.returned = events.length;
  return {
    provider: 'demo-seed',
    fallback: true,
    events,
    warning: 'Live classifier unavailable',
    message: 'Live classifier unavailable',
    diagnostics: params.diagnostics,
  };
}

function filterClassifiedThreadsForView(
  threads: ClassifiedThread[],
  view: MarketEventsView,
  requestedLimit: number
): MarketEvent[] {
  return filterForView(
    threads.map((item) => item.event),
    view,
    requestedLimit
  );
}

async function refreshLivePipeline(params: {
  supabase: SupabaseClient | null;
  debug: boolean;
  diagnostics: PipelineDiagnostics;
}): Promise<{ classified: ClassifiedThread[]; warning?: string; error?: string }> {
  const { supabase, debug, diagnostics } = params;

  const fetched = await fetchTriggeredCandidates(diagnostics);
  const deduped = dedupeCandidates(fetched);
  diagnostics.deduped = deduped.length;

  const gated = gateAndScoreCandidates(deduped);
  diagnostics.gated = gated.length;
  gated.slice(0, 8).forEach((item) => pushLimited(diagnostics.gatedSampleIds, item.id));

  const clusters = clusterCandidates(gated).slice(0, MAX_CLUSTER_COUNT);
  diagnostics.clustered = clusters.length;
  clusters.slice(0, 8).forEach((cluster) => pushLimited(diagnostics.clusteredSampleIds, cluster.fingerprint.slice(0, 12)));

  if (clusters.length === 0) {
    return { classified: [], warning: 'No events passed filters' };
  }

  const existingByFingerprint =
    supabase !== null ? await readExistingEventMeta(supabase, clusters.map((cluster) => cluster.fingerprint)) : new Map<string, ExistingEventMeta>();

  const classifyDiagnostics = buildClassifyDiagnostics(diagnostics);
  const classified: ClassifiedThread[] = [];
  let pexelsResolves = 0;

  for (const cluster of clusters) {
    const existing = existingByFingerprint.get(cluster.fingerprint);
    if (!shouldClassifyCluster(cluster, existing)) continue;

    const firstItem = cluster.items[0];
    if (!firstItem) continue;

    const defaults = mapDefaultsFromGate(firstItem.gateCategory);
    const classification = await classifyClusterWithOpenAI(
      cluster,
      {
        title: cluster.canonicalTitle,
        eventType: defaults.eventType,
        horizon: defaults.horizon,
        severity: Math.max(defaults.severity, firstItem.score),
        drivers: defaults.drivers,
        marketImpact: defaults.marketImpact,
        transmissionPath: defaults.transmissionPath,
      },
      classifyDiagnostics,
      debug
    );

    if (!classification || !classification.marketMoving) continue;

    const sources = buildSources(cluster);
    if (!sources.some((source) => Boolean(source.imageUrl)) && pexelsResolves < MAX_PEXELS_IMAGE_RESOLVES) {
      const resolvedImageUrl = await resolveClusterImageUrl(cluster);
      if (resolvedImageUrl) {
        pexelsResolves += 1;
        sources[0] = {
          ...sources[0],
          imageUrl: resolvedImageUrl,
        };
      }
    }

    const event = marketEventSchema.parse({
      id: cluster.fingerprint,
      title: classification.title,
      eventType: classification.eventType,
      severity: classification.severity,
      horizon: classification.horizon,
      drivers: classification.drivers,
      marketImpact: classification.marketImpact,
      transmissionPath: classification.transmissionPath,
      watchNext: classification.watchNext,
      status: classification.status ?? deterministicStatus(cluster),
      firstSeenAt: cluster.firstSeenAt,
      lastUpdatedAt: cluster.lastUpdatedAt,
      sources,
    });

    classified.push({
      fingerprint: cluster.fingerprint,
      event,
      keyEntities: unique(classification.keyEntities.length > 0 ? classification.keyEntities : cluster.keyEntities),
    });
    pushLimited(diagnostics.classifiedSampleIds, cluster.fingerprint.slice(0, 12));
  }

  absorbClassifyDiagnostics(diagnostics, classifyDiagnostics);
  diagnostics.classified = classified.length;

  if (supabase && classified.length > 0) {
    const payloads: EventUpsertPayload[] = classified.map((item) => ({
      fingerprint: item.fingerprint,
      event: item.event,
      keyEntities: item.keyEntities,
      sources: item.event.sources,
    }));
    const persisted = await upsertEvents(supabase, payloads);
    diagnostics.stored = persisted.stored;
    diagnostics.persistedSampleIds = persisted.sampleFingerprints;
  }

  return {
    classified,
    warning: classified.length === 0 ? 'No events passed filters' : undefined,
  };
}

export async function getMarketEvents(params: {
  origin: string;
  view: string;
  limit: number;
  provider?: string;
  debug?: boolean;
  force?: boolean;
}): Promise<{
  provider: MarketEventsProvider;
  fallback: boolean;
  events: MarketEvent[];
  warning?: string;
  message?: string;
  error?: string;
  diagnostics: PipelineDiagnostics;
}> {
  const viewParsed = marketEventsViewSchema.safeParse(params.view);
  const view: MarketEventsView = viewParsed.success ? viewParsed.data : 'active';
  const requestedLimit = Number.isFinite(params.limit) ? Math.max(1, Math.min(100, Math.floor(params.limit))) : 25;
  const debug = Boolean(params.debug);
  const force = Boolean(params.force);
  const providerParsed = marketEventsProviderSchema.safeParse(params.provider);
  const provider: MarketEventsProvider = providerParsed.success ? providerParsed.data : 'live';

  const diagnostics = createDiagnostics();

  if (provider === 'demo-seed') {
    const events = filterForView(buildDemoSeedEvents(), view, requestedLimit);
    diagnostics.classified = events.length;
    diagnostics.returned = events.length;
    return {
      provider: 'demo-seed',
      fallback: true,
      events,
      warning: 'Demo Seed Mode — not live intelligence',
      message: 'Demo Seed Mode — not live intelligence',
      diagnostics,
    };
  }

  const supabase = getSupabaseServiceClient();

  try {
    if (supabase && !force) {
      const fresh = await isEventsCacheFresh(supabase, CACHE_FRESH_MS);
      if (fresh) {
        diagnostics.cacheHit = true;
        const cached = await readActiveOrResolvedEvents(supabase, {
          view,
          limit: view === 'active' ? Math.min(requestedLimit, MAX_ACTIVE_EVENTS) : requestedLimit,
          minSeverity: ACTIVE_MIN_SEVERITY,
          maxLookbackDays: ACTIVE_LOOKBACK_DAYS,
        });
        diagnostics.returned = cached.length;
        return {
          provider: 'live',
          fallback: false,
          events: cached,
          diagnostics,
        };
      }
    }

    const refreshed = await refreshLivePipeline({ supabase, debug, diagnostics });
    if (liveClassifierUnavailable(diagnostics, refreshed.classified.length)) {
      return buildClassifierFallbackResult({ view, requestedLimit, diagnostics });
    }

    if (supabase) {
      await markStaleEventsResolved(supabase, ACTIVE_LOOKBACK_DAYS);
      const stored = await readActiveOrResolvedEvents(supabase, {
        view,
        limit: view === 'active' ? Math.min(requestedLimit, MAX_ACTIVE_EVENTS) : requestedLimit,
        minSeverity: ACTIVE_MIN_SEVERITY,
        maxLookbackDays: ACTIVE_LOOKBACK_DAYS,
      });
      diagnostics.returned = stored.length;
      if (stored.length > 0) {
        return {
          provider: 'live',
          fallback: false,
          events: stored,
          warning: refreshed.warning,
          diagnostics,
        };
      }

      const refreshedEvents = filterClassifiedThreadsForView(refreshed.classified, view, requestedLimit);
      if (refreshedEvents.length > 0) {
        diagnostics.returned = refreshedEvents.length;
        if (diagnostics.openaiErrors.length < 8) {
          diagnostics.openaiErrors.push('persistence_unavailable:using_fresh_classified_events');
        }
        return {
          provider: 'live',
          fallback: false,
          events: refreshedEvents,
          warning: refreshed.warning || 'Live event store unavailable; showing current refresh results',
          diagnostics,
        };
      }

      return {
        provider: 'live',
        fallback: false,
        events: [],
        warning: refreshed.warning || 'No events passed filters',
        message: refreshed.warning || 'No active market-moving events detected',
        error: refreshed.error,
        diagnostics,
      };
    }

    const adHoc = filterClassifiedThreadsForView(refreshed.classified, view, requestedLimit);
    diagnostics.returned = adHoc.length;
    return {
      provider: 'live',
      fallback: false,
      events: adHoc,
      warning: adHoc.length === 0 ? refreshed.warning || 'No events passed filters' : refreshed.warning,
      message: adHoc.length === 0 ? 'No active market-moving events detected' : undefined,
      error: refreshed.error,
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PIPELINE_FAILED';
    if (diagnostics.openaiErrors.length < 8) diagnostics.openaiErrors.push(`pipeline_failed:${message.slice(0, 180)}`);
    return {
      ...buildClassifierFallbackResult({ view, requestedLimit, diagnostics }),
      error: 'PIPELINE_FAILED',
      warning: message || 'Live classifier unavailable',
    };
  }
}
