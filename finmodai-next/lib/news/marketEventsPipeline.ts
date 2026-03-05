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
    'middle-east-defense': buildSeedEventImage('Defense / ISR', '#ef4444'),
    'satellite-ai-warfare': buildSeedEventImage('Satellite / AI Warfare', '#3b82f6'),
    'nato-defense-spend': buildSeedEventImage('NATO / Defense Budgets', '#10b981'),
    'ai-cyber-defense': buildSeedEventImage('Cyber / Defense AI', '#8b5cf6'),
    'energy-risk-premium': buildSeedEventImage('Energy / Oil Risk', '#f59e0b'),
  };
  const source = (seed: string, title: string, publishedAt: string): MarketEventSource => ({
    name: 'Demo Seed',
    url: 'https://example.com/demo-seed',
    publishedAt,
    title,
    snippet: 'Structured seeded event for demo mode only.',
    imageUrl: demoImageBySeed[seed],
  });
  const mk = (seed: string, payload: Omit<MarketEvent, 'id' | 'firstSeenAt' | 'lastUpdatedAt' | 'sources'> & { ageHours: number; firstSeenHours: number }) => {
    const updatedAt = isoOffset(payload.ageHours);
    const firstSeenAt = isoOffset(payload.firstSeenHours);
    return marketEventSchema.parse({
      ...payload,
      id: createHash('sha256').update(`demo-seed:${seed}`).digest('hex').slice(0, 24),
      firstSeenAt,
      lastUpdatedAt: updatedAt,
      sources: [source(seed, payload.title, updatedAt)],
    });
  };

  return [
    mk('middle-east-defense', {
      title: 'Escalating Middle East tensions drive defense and ISR bid',
      eventType: 'Geopolitics',
      severity: 89,
      horizon: 'Immediate',
      drivers: [
        'Renewed instability raises the probability of sustained U.S. and allied engagement.',
        'Markets are pricing a longer period of regional tension even without a full-scale war.',
        'Defense and intelligence equities are responding before formal procurement catches up.',
      ],
      marketImpact: {
        equities: 'Defense and intelligence-linked equities gain on expected backlog support.',
        oil: 'Energy risk premia can rise as regional instability extends.',
        sectors: 'PLTR, LMT, NOC, and BKSY are the most sensitive names in the immediate reaction window.',
      },
      transmissionPath: [
        'Regional instability rises -> defense spending expectations move higher -> contract backlog visibility improves -> defense-tech multiples expand',
      ],
      watchNext: ['Watch supplemental defense appropriations and allied spending packages.', 'Watch new ISR, missile defense, and targeting-software contract awards.'],
      status: 'developing',
      ageHours: 4,
      firstSeenHours: 28,
    }),
    mk('satellite-ai-warfare', {
      title: 'Satellite and AI warfare normalization deepens the defense software trade',
      eventType: 'Conflict',
      severity: 84,
      horizon: 'Structural',
      drivers: [
        'Conflicts are increasingly data-centric, with AI-assisted reconnaissance becoming standard infrastructure.',
        'Defense budgets are rotating toward ISR, cyber, predictive logistics, and autonomous coordination.',
        'Software-integrated contractors are taking a larger share of new defense spending.',
      ],
      marketImpact: {
        equities: 'Defense software and federal analytics names trade as structural winners.',
        sectors: 'LDOS, CACI, BBAI, and RDW are the most levered to this budget shift.',
      },
      transmissionPath: [
        'AI-enabled warfare adoption rises -> ISR and cyber budgets expand -> software-heavy defense vendors gain share -> higher long-duration revenue visibility lifts valuations',
      ],
      watchNext: ['Watch ISR and cyber allocations in budget proposals.', 'Watch whether small-cap defense AI names win new agency programs.'],
      status: 'confirmed',
      ageHours: 11,
      firstSeenHours: 120,
    }),
    mk('nato-defense-spend', {
      title: 'NATO and Western defense budget expansion supports multi-year prime backlog growth',
      eventType: 'Macro',
      severity: 83,
      horizon: 'Structural',
      drivers: [
        'European NATO members are accelerating commitments to meet or exceed 2% of GDP defense spend.',
        'The U.S. continues replenishment funding tied to multiple conflict theaters.',
        'Defense spend is sticky, multi-year, and politically durable in a high-risk environment.',
      ],
      marketImpact: {
        equities: 'Large defense primes gain from longer revenue visibility and backlog durability.',
        sectors: 'RTX, GD, and BAESY benefit most from a broadening Western procurement cycle.',
      },
      transmissionPath: [
        'Allied defense budgets rise -> procurement pipelines lengthen -> prime contractor backlog expands -> earnings visibility improves -> multiples rerate modestly higher',
      ],
      watchNext: ['Watch NATO summit commitments and appropriations calendars.', 'Watch replenishment orders tied to missile defense and combat systems.'],
      status: 'confirmed',
      ageHours: 18,
      firstSeenHours: 160,
    }),
    mk('ai-cyber-defense', {
      title: 'AI militarization and cyber escalation reprice defense AI as structural growth',
      eventType: 'RegulatoryShock',
      severity: 86,
      horizon: 'Structural',
      drivers: [
        'Cyber attacks and AI-enabled warfare are increasing in scale and operational relevance.',
        'Governments are integrating AI into cyber, logistics, and battlefield planning.',
        'Defense AI trades more like growth tech than traditional industrials when AI sentiment is strong.',
      ],
      marketImpact: {
        equities: 'Defense AI and federal cybersecurity names can decouple positively from legacy defense valuations.',
        sectors: 'CRWD, BAH, and PLTR are the clearest listed beneficiaries.',
      },
      transmissionPath: [
        'AI militarization expands -> federal cyber and AI budgets rise -> software-heavy defense names gain higher growth multiples -> leadership shifts toward defense-adjacent AI',
      ],
      watchNext: ['Watch federal cyber contract awards and classified AI program commentary.', 'Watch whether AI sentiment broadens beyond pure defense into security software.'],
      status: 'developing',
      ageHours: 7,
      firstSeenHours: 72,
    }),
    mk('energy-risk-premium', {
      title: 'Energy risk premium expands as shipping corridor instability lifts geopolitical oil sensitivity',
      eventType: 'Conflict',
      severity: 81,
      horizon: 'NearTerm',
      drivers: [
        'Shipping corridor risks and regional instability are adding a geopolitical premium to crude.',
        'Markets are treating transport disruption as an inflation-sensitive macro input.',
      ],
      marketImpact: {
        equities: 'Energy equities outperform while growth tech can soften in risk-off periods.',
        rates: 'Inflation expectations can push the long end higher.',
        oil: 'Oil futures face upside pressure as conflict risk remains elevated.',
        sectors: 'XOM and CVX act as direct beneficiaries, while airlines and transports face pressure.',
      },
      transmissionPath: [
        'Conflict risk rises -> oil futures reprice higher -> inflation expectations increase -> energy equities rally while growth-duration assets underperform',
      ],
      watchNext: ['Watch crude futures and shipping insurance rates.', 'Watch whether corridor disruption broadens into sustained supply constraints.'],
      status: 'developing',
      ageHours: 5,
      firstSeenHours: 44,
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
