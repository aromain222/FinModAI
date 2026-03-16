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

type ProviderKey = 'newsapi' | 'perigon' | 'benzinga';

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

  const response = await fetch(`https://api.goperigon.com/v1/all?${qs.toString()}`, { cache: 'no-store' });
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

async function fetchTriggeredCandidates(diagnostics: PipelineDiagnostics): Promise<EventCandidate[]> {
  const perProviderLimit = clampLimit(PROVIDER_FETCH_LIMIT);
  const tasks: Array<Promise<EventCandidate[]>> = [];

  for (const trigger of TRIGGER_QUERIES) {
    tasks.push(fetchNewsApi(trigger.query, trigger.id, perProviderLimit));
    tasks.push(fetchPerigon(trigger.query, trigger.id, perProviderLimit));
    tasks.push(fetchBenzinga(trigger.query, trigger.id, perProviderLimit));
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

function buildSeedEventImage(label: string, accent: string): string {
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
      <text x="104" y="486" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">${safeLabel}</text>
      <text x="104" y="540" fill="rgba(248,250,252,0.72)" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" letter-spacing="4">CAPITALBASE EVENTS</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildDemoSeedEvents(): MarketEvent[] {
  const now = Date.now();
  const isoOffset = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();
  const demoImageBySeed: Record<string, string> = {
    'hormuz-oil-risk': buildSeedEventImage('Hormuz / Oil Shock', '#ef4444'),
    'tariff-trade-reset': buildSeedEventImage('Tariffs / Trade', '#f59e0b'),
    'fed-boxed-in': buildSeedEventImage('Fed / Boxed In', '#3b82f6'),
    'growth-confidence-cracks': buildSeedEventImage('Growth / Confidence', '#8b5cf6'),
    'nvidia-gtc-checkpoint': buildSeedEventImage('Nvidia / GTC', '#22c55e'),
    'software-ai-reset': buildSeedEventImage('Software / AI Reset', '#06b6d4'),
    'memory-hbm-checkpoint': buildSeedEventImage('Memory / HBM', '#14b8a6'),
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
    return marketEventSchema.parse({
      ...payload,
      id: createHash('sha256').update(`demo-seed:${seed}`).digest('hex').slice(0, 24),
      firstSeenAt,
      lastUpdatedAt: updatedAt,
      sources: [source(seed, payload.source, updatedAt)],
    });
  };

  return [
    mk('hormuz-oil-risk', {
      title: 'Hormuz oil-shock risk puts energy, inflation, and defense back on top of the tape',
      eventType: 'Conflict',
      severity: 93,
      horizon: 'Immediate',
      drivers: [
        'Markets are repricing the risk that a wider Middle East conflict disrupts energy flows and shipping insurance before any physical outage is confirmed.',
        'Brent pushing toward the psychological $100 zone would tighten financial conditions by lifting fuel costs, inflation expectations, and risk aversion together.',
        'Energy, defense, and safe-haven exposures are leading while airlines, transports, and other fuel-sensitive cyclicals lose sponsorship.',
      ],
      marketImpact: {
        equities: 'Energy, defense, and commodity-linked equities should keep outperforming if crude volatility stays elevated, while transports and discretionary exposure remain vulnerable.',
        rates: 'An oil-led inflation shock can keep breakevens firm and make duration harder to own even if growth expectations soften.',
        fx: 'Safe-haven dollar demand can strengthen if cross-border shipping and commodity flows become less predictable.',
        oil: 'Crude risk premium rises first through freight, insurance, and inventory hedging before any confirmed supply loss.',
        sectors: 'Integrated oil, refiners, and defense contractors screen best; airlines, chemicals, and consumer cyclicals carry the cleanest downside read-through.',
      },
      transmissionPath: [
        'Conflict escalation -> shipping and supply risk rise -> crude and inflation expectations move higher -> energy and defense outperform while cyclicals de-rate',
      ],
      watchNext: [
        'Watch Hormuz and Red Sea shipping updates plus tanker insurance pricing.',
        'Watch Brent term structure and whether spot crude breaks and holds above recent highs.',
        'Watch airline and transport management commentary for demand or margin revisions.',
      ],
      status: 'developing',
      ageHours: 2,
      firstSeenHours: 18,
      source: {
        name: 'AP News',
        url: 'https://apnews.com/article/66806b02a000235f1979e591279b6554',
        title: 'Stocks sink worldwide as Iran attacks create a dilemma for central banks: how to cut rates and fight inflation?',
        snippet: 'AP coverage tied the Middle East escalation directly to oil, inflation, and central-bank constraints.',
      },
    }),
    mk('tariff-trade-reset', {
      title: 'Tariff and trade-policy uncertainty keeps cyclicals and multinationals under pressure',
      eventType: 'RegulatoryShock',
      severity: 89,
      horizon: 'NearTerm',
      drivers: [
        'Markets are still treating tariff headlines as a live earnings risk because policy scope, legal durability, and retaliation paths remain unsettled.',
        'Trade-sensitive industrials, retailers, and hardware names face renewed margin and inventory planning pressure when import assumptions keep changing.',
        'The market is rewarding domestically insulated cash flows over globally exposed operating leverage until policy clarity improves.',
      ],
      marketImpact: {
        equities: 'Multinationals, import-heavy retailers, and trade-sensitive industrials stay under pressure while domestic defensives hold up better.',
        fx: 'Trade uncertainty tends to support the dollar against export-sensitive and emerging-market currencies when growth expectations are marked down.',
        credit: 'Lower-visibility cyclicals can see spread pressure if tariffs begin to hit inventory turns and pricing power unevenly.',
        sectors: 'Industrials, autos, retail, and hardware remain the cleanest downside buckets while domestically oriented utilities and staples look relatively safer.',
      },
      transmissionPath: [
        'Tariff uncertainty -> margin and sourcing assumptions worsen -> earnings visibility falls -> cyclicals and globally exposed names underperform',
      ],
      watchNext: [
        'Watch legal and policy clarification on which tariffs survive and when they take effect.',
        'Watch retaliation headlines and sourcing commentary from large import-dependent companies.',
        'Watch whether management teams begin cutting full-year margin or demand guidance.',
      ],
      status: 'developing',
      ageHours: 4,
      firstSeenHours: 28,
      source: {
        name: 'Reuters',
        url: 'https://www.reuters.com/markets/us/',
        title: 'Tariffs and AI concerns dominate U.S. equity tape',
        snippet: 'Reuters market coverage highlighted tariffs as a direct drag on cyclicals and multinational sentiment.',
      },
    }),
    mk('fed-boxed-in', {
      title: 'Fed is boxed in as oil risk revives inflation just as growth momentum cools',
      eventType: 'CentralBank',
      severity: 90,
      horizon: 'Immediate',
      drivers: [
        'Energy-led inflation risk has returned at the same time the economy is showing more visible cracks in hiring, confidence, and consumer durability.',
        'That combination makes a clean easing pivot harder because the Fed cannot ignore higher inflation expectations even if growth is slowing.',
        'Markets are moving toward a slower and more conditional cutting path rather than a straightforward rescue-easing setup.',
      ],
      marketImpact: {
        equities: 'Long-duration growth and lower-quality cyclicals both struggle because the market loses the simple lower-rates offset.',
        rates: 'Front-end yields can stay sticky while the long end trades the stagflation mix of softer growth but worse inflation optics.',
        fx: 'The dollar tends to stay supported when the U.S. still offers relative rate support despite weaker growth headlines.',
        credit: 'Refinancing-sensitive borrowers face pressure if policy relief is delayed while top-line momentum softens.',
        sectors: 'Financials, energy, and selective defensives hold up better than speculative growth and rate-sensitive balance-sheet stories.',
      },
      transmissionPath: [
        'Oil and inflation risk rise -> Fed stays cautious -> real rates and financial conditions stay restrictive -> valuation and refinancing pressure spreads',
      ],
      watchNext: [
        'Watch breakevens, gasoline passthrough, and inflation expectation surveys.',
        'Watch FOMC language for whether energy-driven inflation alters the expected easing path.',
        'Watch front-end futures to see if cuts are merely delayed or meaningfully repriced out.',
      ],
      status: 'developing',
      ageHours: 3,
      firstSeenHours: 24,
      source: {
        name: 'AP News',
        url: 'https://apnews.com/article/66806b02a000235f1979e591279b6554',
        title: 'Iran attacks create a dilemma for central banks: how to cut rates and fight inflation?',
        snippet: 'AP framed the current macro bind as a simultaneous inflation and policy problem, not just a geopolitical headline.',
      },
    }),
    mk('growth-confidence-cracks', {
      title: 'Softening U.S. jobs and confidence data deepen stagflation worries',
      eventType: 'Macro',
      severity: 85,
      horizon: 'NearTerm',
      drivers: [
        'Recent labor and consumer data are pointing to slower underlying demand before the full energy shock has even hit household budgets.',
        'That weakens the case for broad cyclical exposure because revenue expectations can roll over while the cost backdrop stays difficult.',
        'The setup raises the probability of a more selective market led by balance-sheet quality and pricing power rather than beta.',
      ],
      marketImpact: {
        equities: 'Consumer discretionary, travel, and lower-quality cyclicals look most exposed if demand fades while costs remain sticky.',
        rates: 'Long-end yields can struggle to fall cleanly if slower growth is offset by worse inflation optics.',
        credit: 'Lower-tier consumer and cyclical credit can widen as volume risk and margin pressure begin to overlap.',
        sectors: 'Staples, utilities, and quality software hold up better than travel, retail, and economically sensitive cyclicals.',
      },
      transmissionPath: [
        'Jobs and confidence soften -> revenue expectations weaken -> investors crowd into quality and defensives -> cyclical breadth deteriorates',
      ],
      watchNext: [
        'Watch payroll revisions, weekly claims, and any broadening in unemployment.',
        'Watch consumer confidence and spending data for signs that softness is moving beyond surveys.',
        'Watch discretionary and travel management teams for demand language changes.',
      ],
      status: 'confirmed',
      ageHours: 5,
      firstSeenHours: 30,
      source: {
        name: 'AP News',
        url: 'https://apnews.com/article/3172b6d0023717644c173cee94d44a79',
        title: 'Cracks are showing in the U.S. economy and could spell trouble for the labor market',
        snippet: 'AP highlighted slower hiring and softer demand as a separate macro issue that predates the latest oil shock.',
      },
    }),
    mk('nvidia-gtc-checkpoint', {
      title: 'Nvidia GTC becomes the next test of AI infrastructure durability',
      eventType: 'EarningsMegaCap',
      severity: 88,
      horizon: 'NearTerm',
      drivers: [
        'Investors want confirmation that hyperscaler and enterprise AI budgets are still broadening rather than narrowing to a smaller set of projects.',
        'The conference matters because guidance around Blackwell, networking, and inference adoption shapes the entire AI infrastructure stack.',
        'A strong message can re-anchor semiconductor leadership while any signs of digestion would hit the most crowded names quickly.',
      ],
      marketImpact: {
        equities: 'Semis, networking, foundry, and power-exposed infrastructure names should move first because the market is still trading AI as a capex chain.',
        credit: 'Supplier spread tone stays constructive if the event supports another leg of durable capex visibility.',
        sectors: 'GPU, memory, networking, and data-center power beneficiaries all remain directly tied to this checkpoint.',
      },
      transmissionPath: [
        'Management tone on AI demand -> hyperscaler capex confidence adjusts -> semiconductor earnings expectations reset -> AI infrastructure leadership strengthens or fades',
      ],
      watchNext: [
        'Watch Blackwell shipment commentary and any bottleneck language around networking or power.',
        'Watch hyperscaler references for whether inference demand is broadening beyond training clusters.',
        'Watch whether management reinforces 2026 demand durability instead of just near-term backlog strength.',
      ],
      status: 'developing',
      ageHours: 6,
      firstSeenHours: 36,
      source: {
        name: 'NVIDIA Newsroom',
        url: 'https://nvidianews.nvidia.com/news/nvidia-ceo-jensen-huang-and-global-technology-leaders-to-showcase-age-of-ai-at-gtc-2026',
        title: 'NVIDIA CEO Jensen Huang and global technology leaders to showcase the age of AI at GTC 2026',
        snippet: 'NVIDIA framed GTC 2026 as the next major checkpoint for AI compute, networking, and enterprise deployment commentary.',
      },
    }),
    mk('software-ai-reset', {
      title: 'AI disruption fears keep software and services multiples under pressure',
      eventType: 'Macro',
      severity: 83,
      horizon: 'Structural',
      drivers: [
        'The market is becoming less willing to pay peak multiples for application software if AI compresses pricing, feature differentiation, or seat-based expansion.',
        'Services and software names without clear AI monetization are facing a valuation reset even before headline revenue erosion is fully visible.',
        'This is creating a split tape between infrastructure beneficiaries and companies viewed as AI takers rather than AI sellers.',
      ],
      marketImpact: {
        equities: 'Application software and IT services can stay under relative pressure while infrastructure and monetization leaders retain premium support.',
        credit: 'High-multiple software remains an equity story first, but weaker sentiment can widen the gap between premium and average issuers.',
        sectors: 'Software, consulting, and recurring-revenue names with weak AI differentiation are screening worse than semiconductor and cloud-enabler cohorts.',
      },
      transmissionPath: [
        'AI disruption fear rises -> software pricing-power assumptions weaken -> multiples compress -> capital rotates toward infrastructure and proven monetizers',
      ],
      watchNext: [
        'Watch software management teams for AI-driven upsell versus substitution commentary.',
        'Watch whether enterprise customers delay seat expansion or compress renewal pricing.',
        'Watch relative performance between software indices and semiconductor leaders for confirmation.',
      ],
      status: 'developing',
      ageHours: 7,
      firstSeenHours: 40,
      source: {
        name: 'Reuters',
        url: 'https://www.reuters.com/markets/us/',
        title: 'Tech worries dominate as AI disruption fears spread beyond semiconductors',
        snippet: 'Reuters market coverage described a broader tech selloff driven by AI disruption and valuation reset concerns.',
      },
    }),
    mk('memory-hbm-checkpoint', {
      title: 'Memory and HBM pricing are emerging as the next checkpoint for the AI trade',
      eventType: 'EarningsMegaCap',
      severity: 81,
      horizon: 'NearTerm',
      drivers: [
        'After GPUs and networking, the market is rotating toward memory pricing and HBM supply as the next bottleneck in the AI value chain.',
        'Supplier commentary now matters because sustained HBM tightness would support another leg of AI hardware earnings revisions.',
        'Any sign of pricing normalization or inventory digestion would pressure the second tier of AI beneficiaries first.',
      ],
      marketImpact: {
        equities: 'Memory and equipment names can outperform if HBM tightness persists, while broader AI beneficiaries may fade if pricing power rolls over.',
        credit: 'Improving visibility around memory margins supports spread stability for the best-positioned semiconductor suppliers.',
        sectors: 'Memory, foundry equipment, and packaging beneficiaries remain the highest-beta read-through from this checkpoint.',
      },
      transmissionPath: [
        'HBM pricing and supply commentary -> memory margin expectations reset -> second-order AI trade breadth expands or contracts',
      ],
      watchNext: [
        'Watch Micron and other memory suppliers for HBM pricing, mix, and capacity language.',
        'Watch packaging and advanced-memory bottleneck commentary across the semiconductor chain.',
        'Watch whether AI customers prioritize capacity security over near-term cost discipline.',
      ],
      status: 'developing',
      ageHours: 8,
      firstSeenHours: 42,
      source: {
        name: 'Micron Investor Relations',
        url: 'https://investors.micron.com/',
        title: 'Micron investor updates remain a key checkpoint for HBM and memory pricing',
        snippet: 'Micron disclosures are a direct read-through for the memory leg of the AI infrastructure trade.',
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

    const adHoc = filterForView(
      refreshed.classified.map((item) => item.event),
      view,
      requestedLimit
    );
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
    diagnostics.returned = 0;
    return {
      provider: 'live',
      fallback: false,
      events: [],
      error: 'PIPELINE_FAILED',
      warning: message,
      message: 'Live pipeline unavailable',
      diagnostics,
    };
  }
}
