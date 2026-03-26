import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import { fetchJsonWithRetry } from '@/lib/data/providers/shared';
import { serverEnv } from '@/lib/env/server';
import type { ModelType } from '@/types/models';

export type CatalystRelevance = 'primary' | 'secondary' | 'monitor';
export type CatalystStatus = 'reported' | 'fallback' | 'heuristic' | 'missing';

export type CatalystCalendarItem = {
  kind: 'earnings' | 'economic';
  title: string;
  date: string | null;
  displayDate: string;
  source: string;
  status: CatalystStatus;
  relevance: CatalystRelevance;
  note?: string;
};

export type OwnershipCatalystItem = {
  key:
    | 'nextEarningsEstimate'
    | 'institutionalOwnership'
    | 'institutionalHolderCount'
    | 'insiderSentiment'
    | 'insiderNetShareFlow'
    | 'shareCountChange'
    | 'buybackSignal';
  label: string;
  value: number | string | null;
  displayValue: string;
  source: string;
  asOf: string | null;
  status: CatalystStatus;
  relevance: CatalystRelevance;
  note?: string;
};

export type TranscriptCatalystItem = {
  label: string;
  excerpt: string;
  source: string;
  asOf: string | null;
  status: CatalystStatus;
  relevance: CatalystRelevance;
  note?: string;
};

export type CompanyCatalystContext = {
  asOf: string;
  summary: string;
  warnings: string[];
  calendarItems: CatalystCalendarItem[];
  ownershipItems: OwnershipCatalystItem[];
  transcriptItems: TranscriptCatalystItem[];
};

type CachedContext = {
  expiresAt: number;
  value: CompanyCatalystContext;
};

type EarningsEvent = {
  date: string | null;
  title: string;
  note?: string;
};

type BaseOwnershipSnapshot = {
  latestShares: number | null;
  historicalShares: number | null;
  latestAsOf: string | null;
  historicalAsOf: string | null;
  shareCountChangePct: number | null;
};

const CONTEXT_TTL_MS = 10 * 60 * 1000;
const ECONOMIC_TTL_MS = 6 * 60 * 60 * 1000;
const contextCache = new Map<string, CachedContext>();
let economicCalendarCache: { expiresAt: number; value: CatalystCalendarItem[] } | null = null;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const normalized = value.replace(/,/g, '').replace(/%/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRows<T>(input: unknown): T[] {
  if (Array.isArray(input)) return input as T[];
  if (input && typeof input === 'object') return [input as T];
  return [];
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sortByDateAsc<T extends { date: string | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => String(left.date ?? '').localeCompare(String(right.date ?? '')));
}

function sortByDateDesc<T extends { date: string | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')));
}

function isFutureDate(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.slice(0, 10) >= isoToday();
}

function extractCatalystSentences(text: string, limit = 3): string[] {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/\u2019/g, "'")
    .trim();
  if (!normalized) return [];

  const keywords = [
    'guidance',
    'demand',
    'pricing',
    'margin',
    'margins',
    'capex',
    'backlog',
    'inventory',
    'buyback',
    'repurchase',
    'pipeline',
    'bookings',
    'capacity',
    'supply',
    'regulation',
    'tariff',
    'macro',
    'customer',
    'ai',
    'growth',
  ];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 280);

  const scored = sentences
    .map((sentence) => ({
      sentence,
      score: keywords.reduce((count, keyword) => count + (sentence.toLowerCase().includes(keyword) ? 1 : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.sentence.length - right.sentence.length);

  const unique: string[] = [];
  for (const entry of scored) {
    const normalizedSentence = entry.sentence.toLowerCase();
    if (unique.some((candidate) => candidate.toLowerCase() === normalizedSentence)) continue;
    unique.push(entry.sentence);
    if (unique.length >= limit) break;
  }

  return unique;
}

function calendarRelevance(modelType: ModelType, kind: 'earnings' | 'economic'): CatalystRelevance {
  const primary = new Set<ModelType>(['dcf', 'reverse-dcf', 'three-statement', 'comps', 'football-field', 'precedents', 'scorecard']);
  const econPrimary = new Set<ModelType>(['dcf', 'reverse-dcf', 'lbo', 'debt-capacity-lite', 'merger']);
  if (kind === 'earnings') return primary.has(modelType) ? 'primary' : 'secondary';
  if (kind === 'economic') return econPrimary.has(modelType) ? 'primary' : 'secondary';
  return 'monitor';
}

function ownershipRelevance(modelType: ModelType, key: OwnershipCatalystItem['key']): CatalystRelevance {
  const primaryByModel: Partial<Record<ModelType, OwnershipCatalystItem['key'][]>> = {
    dcf: ['shareCountChange', 'buybackSignal', 'nextEarningsEstimate'],
    'reverse-dcf': ['shareCountChange', 'buybackSignal', 'nextEarningsEstimate'],
    'debt-capacity-lite': ['buybackSignal', 'insiderSentiment'],
    lbo: ['buybackSignal', 'insiderSentiment'],
    merger: ['shareCountChange', 'buybackSignal'],
    comps: ['institutionalOwnership', 'institutionalHolderCount', 'shareCountChange'],
    'football-field': ['institutionalOwnership', 'shareCountChange', 'buybackSignal'],
    precedents: ['shareCountChange', 'institutionalOwnership'],
    'three-statement': ['shareCountChange', 'buybackSignal'],
    operating: ['shareCountChange', 'buybackSignal'],
    scorecard: ['institutionalOwnership', 'insiderSentiment', 'shareCountChange'],
  };

  if (primaryByModel[modelType]?.includes(key)) return 'primary';
  if (key === 'insiderNetShareFlow' || key === 'institutionalHolderCount') return 'secondary';
  return 'monitor';
}

function transcriptRelevance(modelType: ModelType): CatalystRelevance {
  return ['dcf', 'reverse-dcf', 'three-statement', 'comps', 'football-field', 'precedents', 'merger', 'scorecard'].includes(modelType)
    ? 'primary'
    : 'secondary';
}

async function fetchFmpRows<T>(cacheKey: string, url: string): Promise<T[]> {
  if (!serverEnv.FMP_API_KEY) return [];
  const response = await fetchJsonWithRetry<unknown>({
    provider: 'fmp',
    url,
    cacheKey,
    ttlMs: CONTEXT_TTL_MS,
  });
  if (!response.ok) return [];
  return normalizeRows<T>(response.data);
}

async function loadEarningsEvents(ticker: string): Promise<EarningsEvent[]> {
  if (!serverEnv.FMP_API_KEY) return [];
  const rows = await fetchFmpRows<Record<string, unknown>>(
    `fmp:company-catalyst:earnings:${ticker}`,
    `https://financialmodelingprep.com/stable/earnings?symbol=${ticker}&apikey=${serverEnv.FMP_API_KEY}`,
  );

  return sortByDateAsc(
    rows
      .map((row) => ({
        date: pickString(row, ['date', 'fillingDate', 'fiscalDateEnding', 'acceptedDate']),
        title: 'Earnings report',
        note: [
          pickString(row, ['time', 'timeOfDay']),
          pickNumber(row, ['epsEstimated', 'estimatedEps']) !== null ? `EPS est. ${pickNumber(row, ['epsEstimated', 'estimatedEps'])}` : null,
          pickNumber(row, ['revenueEstimated', 'estimatedRevenue']) !== null
            ? `Rev. est. ${pickNumber(row, ['revenueEstimated', 'estimatedRevenue'])}`
            : null,
        ]
          .filter(Boolean)
          .join(' • '),
      }))
      .filter((row) => row.date),
  );
}

const ECONOMIC_EVENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /fomc|fed funds|interest rate decision/i, label: 'Fed decision / FOMC' },
  { pattern: /consumer price|\bcpi\b/i, label: 'CPI release' },
  { pattern: /payroll|nonfarm|jobs report/i, label: 'Nonfarm payrolls' },
  { pattern: /pce/i, label: 'PCE inflation' },
  { pattern: /gross domestic product|\bgdp\b/i, label: 'GDP release' },
  { pattern: /retail sales/i, label: 'Retail sales' },
];

async function loadEconomicCalendar(): Promise<CatalystCalendarItem[]> {
  if (economicCalendarCache && economicCalendarCache.expiresAt > Date.now()) {
    return economicCalendarCache.value;
  }

  const fallback = ECONOMIC_EVENT_PATTERNS.slice(0, 4).map((entry) => ({
    kind: 'economic' as const,
    title: entry.label,
    date: null,
    displayDate: 'Watch next scheduled release',
    source: 'macro watchlist fallback',
    status: 'heuristic' as const,
    relevance: 'monitor' as const,
    note: 'Exact date unavailable from provider in this run.',
  }));

  if (!serverEnv.FMP_API_KEY) {
    economicCalendarCache = { expiresAt: Date.now() + ECONOMIC_TTL_MS, value: fallback };
    return fallback;
  }

  const rows = await fetchFmpRows<Record<string, unknown>>(
    'fmp:company-catalyst:economic-calendar',
    `https://financialmodelingprep.com/stable/economic-calendar?apikey=${serverEnv.FMP_API_KEY}`,
  );

  const today = isoToday();
  const upcoming = rows
    .map((row) => ({
      date: pickString(row, ['date']),
      event: pickString(row, ['event', 'name']),
      country: pickString(row, ['country', 'countryName']),
    }))
    .filter((row) => row.event && (!row.country || /united states|us/i.test(row.country)))
    .filter((row) => row.date && row.date.slice(0, 10) >= today);

  const items: CatalystCalendarItem[] = [];
  for (const matcher of ECONOMIC_EVENT_PATTERNS) {
    const match = upcoming.find((row) => matcher.pattern.test(row.event ?? ''));
    if (!match) continue;
    items.push({
      kind: 'economic',
      title: matcher.label,
      date: match.date,
      displayDate: formatDate(match.date),
      source: 'FMP economic-calendar',
      status: 'reported',
      relevance: 'monitor',
      note: match.event ?? undefined,
    });
  }

  const value = items.length > 0 ? items : fallback;
  economicCalendarCache = { expiresAt: Date.now() + ECONOMIC_TTL_MS, value };
  return value;
}

async function loadOwnershipSnapshot(ticker: string): Promise<BaseOwnershipSnapshot> {
  const profile = await resolveCompanyProfile({ ticker });
  const latest = profile?.snapshot?.sharesOutstanding ?? null;
  const latestAsOf = profile?.snapshot?.asOfDate ?? null;

  const historicalRows = profile?.company?.id
    ? await (async () => {
        const supabaseClient = (await import('@/lib/events/store')).getSupabaseServiceClient();
        if (!supabaseClient) return [] as Array<{ as_of_date: string | null; shares_outstanding: number | null }>;
        const result = await supabaseClient
          .from('company_snapshots')
          .select('as_of_date, shares_outstanding')
          .eq('company_id', profile.company.id)
          .not('shares_outstanding', 'is', null)
          .order('as_of_date', { ascending: false })
          .limit(8);
        return Array.isArray(result.data) ? (result.data as Array<{ as_of_date: string | null; shares_outstanding: number | null }>) : [];
      })()
    : [];

  const older = historicalRows.find((row, index) => index > 0 && typeof row.shares_outstanding === 'number' && Number.isFinite(row.shares_outstanding));
  const historicalShares = typeof older?.shares_outstanding === 'number' ? older.shares_outstanding : null;
  const historicalAsOf = older?.as_of_date ?? null;
  const shareCountChangePct = latest !== null && historicalShares !== null && historicalShares > 0 ? latest / historicalShares - 1 : null;

  return {
    latestShares: latest,
    historicalShares,
    latestAsOf,
    historicalAsOf,
    shareCountChangePct,
  };
}

async function loadInstitutionalOwnershipItems(ticker: string, modelType: ModelType): Promise<OwnershipCatalystItem[]> {
  if (!serverEnv.FMP_API_KEY) return [];

  const today = new Date();
  const year = today.getUTCFullYear();
  const quarter = Math.floor(today.getUTCMonth() / 3) + 1;
  const rows = await fetchFmpRows<Record<string, unknown>>(
    `fmp:company-catalyst:positions-summary:${ticker}:${year}:Q${quarter}`,
    `https://financialmodelingprep.com/stable/institutional-ownership/positions-summary?symbol=${ticker}&year=${year}&quarter=${quarter}&apikey=${serverEnv.FMP_API_KEY}`,
  );
  const row = rows[0];
  if (!row) return [];

  const ownershipPctRaw = pickNumber(row, ['ownershipPercent', 'ownership', 'ownershipPercentage']);
  const holderCount = pickNumber(row, ['investorsHolding', 'investorsHoldingCount', 'holdersCount', 'numberOfInvestorsHolding']);
  const ownershipPct = ownershipPctRaw !== null && ownershipPctRaw > 1 ? ownershipPctRaw / 100 : ownershipPctRaw;
  const asOf = pickString(row, ['date', 'filingDate', 'asOfDate']);

  const items: OwnershipCatalystItem[] = [];
  if (ownershipPct !== null) {
    items.push({
      key: 'institutionalOwnership',
      label: 'Institutional ownership',
      value: ownershipPct,
      displayValue: `${(ownershipPct * 100).toFixed(1)}%`,
      source: 'FMP positions-summary',
      asOf,
      status: 'reported',
      relevance: ownershipRelevance(modelType, 'institutionalOwnership'),
    });
  }
  if (holderCount !== null) {
    items.push({
      key: 'institutionalHolderCount',
      label: 'Institutional holders',
      value: holderCount,
      displayValue: holderCount.toFixed(0),
      source: 'FMP positions-summary',
      asOf,
      status: 'reported',
      relevance: ownershipRelevance(modelType, 'institutionalHolderCount'),
    });
  }
  return items;
}

async function loadInsiderItems(ticker: string, modelType: ModelType): Promise<OwnershipCatalystItem[]> {
  if (!serverEnv.FMP_API_KEY) return [];
  const rows = await fetchFmpRows<Record<string, unknown>>(
    `fmp:company-catalyst:insider-stats:${ticker}`,
    `https://financialmodelingprep.com/stable/insider-trading/statistics?symbol=${ticker}&apikey=${serverEnv.FMP_API_KEY}`,
  );
  const row = rows[0];
  if (!row) return [];

  const ratioRaw = pickNumber(row, ['acquiredDisposedRatio', 'acquisitionDispositionRatio', 'buySellRatio']);
  const ratio = ratioRaw !== null && ratioRaw > 25 ? ratioRaw / 100 : ratioRaw;
  const acquiredShares = pickNumber(row, ['sharesAcquired', 'acquiredShares', 'totalSharesAcquired', 'totalAcquiredShares']);
  const disposedShares = pickNumber(row, ['sharesDisposed', 'disposedShares', 'totalSharesDisposed', 'totalDisposedShares']);
  const netShares = acquiredShares !== null || disposedShares !== null ? (acquiredShares ?? 0) - (disposedShares ?? 0) : null;
  const asOf = pickString(row, ['date', 'asOfDate', 'filingDate']);

  const items: OwnershipCatalystItem[] = [];
  if (ratio !== null) {
    const sentiment = ratio > 1.1 ? 'Net insider buying bias' : ratio < 0.9 ? 'Net insider selling bias' : 'Balanced insider activity';
    items.push({
      key: 'insiderSentiment',
      label: 'Insider sentiment',
      value: ratio,
      displayValue: sentiment,
      source: 'FMP insider-trading/statistics',
      asOf,
      status: 'reported',
      relevance: ownershipRelevance(modelType, 'insiderSentiment'),
      note: `Acquired / disposed ratio ${ratio.toFixed(2)}x`,
    });
  }
  if (netShares !== null) {
    items.push({
      key: 'insiderNetShareFlow',
      label: 'Net insider share flow',
      value: netShares,
      displayValue: `${netShares >= 0 ? '+' : ''}${Math.round(netShares).toLocaleString()} shares`,
      source: 'FMP insider-trading/statistics',
      asOf,
      status: 'reported',
      relevance: ownershipRelevance(modelType, 'insiderNetShareFlow'),
    });
  }
  return items;
}

async function loadTranscriptItems(ticker: string, modelType: ModelType): Promise<TranscriptCatalystItem[]> {
  if (!serverEnv.FMP_API_KEY) return [];

  const dateRows = await fetchFmpRows<Record<string, unknown>>(
    `fmp:company-catalyst:transcript-dates:${ticker}`,
    `https://financialmodelingprep.com/stable/earning-call-transcript-dates?symbol=${ticker}&apikey=${serverEnv.FMP_API_KEY}`,
  );
  const latest = sortByDateDesc(
    dateRows
      .map((row) => ({
        date: pickString(row, ['date']),
        year: pickNumber(row, ['year']),
        quarter: pickNumber(row, ['quarter']),
      }))
      .filter((row) => row.date && row.year !== null && row.quarter !== null),
  )[0];

  if (!latest || latest.year === null || latest.quarter === null) return [];

  const transcriptRows = await fetchFmpRows<Record<string, unknown>>(
    `fmp:company-catalyst:transcript:${ticker}:${latest.year}:Q${latest.quarter}`,
    `https://financialmodelingprep.com/stable/earning-call-transcript?symbol=${ticker}&year=${latest.year}&quarter=${latest.quarter}&apikey=${serverEnv.FMP_API_KEY}`,
  );
  const transcriptRow = transcriptRows[0] ?? {};
  const transcriptText = pickString(transcriptRow, ['content', 'transcript', 'text']) ?? '';
  const highlights = extractCatalystSentences(transcriptText, 3);

  return highlights.map((excerpt, index) => ({
    label: index === 0 ? `Latest transcript catalyst (Q${latest.quarter} ${latest.year})` : `Transcript catalyst ${index + 1}`,
    excerpt,
    source: 'FMP earning-call-transcript',
    asOf: latest.date,
    status: 'reported',
    relevance: transcriptRelevance(modelType),
  }));
}

function buildShareCountItems(snapshot: BaseOwnershipSnapshot, modelType: ModelType): OwnershipCatalystItem[] {
  const items: OwnershipCatalystItem[] = [];
  if (snapshot.shareCountChangePct !== null) {
    items.push({
      key: 'shareCountChange',
      label: 'Share count change',
      value: snapshot.shareCountChangePct,
      displayValue: `${snapshot.shareCountChangePct >= 0 ? '+' : ''}${(snapshot.shareCountChangePct * 100).toFixed(1)}%`,
      source: 'company_snapshots',
      asOf: snapshot.latestAsOf,
      status: 'reported',
      relevance: ownershipRelevance(modelType, 'shareCountChange'),
      note:
        snapshot.historicalAsOf && snapshot.latestAsOf
          ? `${formatDate(snapshot.historicalAsOf)} to ${formatDate(snapshot.latestAsOf)}`
          : undefined,
    });

    const direction = snapshot.shareCountChangePct <= -0.01
      ? 'Net buyback tailwind'
      : snapshot.shareCountChangePct >= 0.01
        ? 'Net dilution headwind'
        : 'Share count broadly stable';

    items.push({
      key: 'buybackSignal',
      label: 'Buyback / dilution signal',
      value: snapshot.shareCountChangePct,
      displayValue: direction,
      source: 'company_snapshots',
      asOf: snapshot.latestAsOf,
      status: 'reported',
      relevance: ownershipRelevance(modelType, 'buybackSignal'),
      note: snapshot.latestShares !== null ? `Latest diluted shares ${snapshot.latestShares.toFixed(1)}M` : undefined,
    });
  }
  return items;
}

function buildSummary(calendarItems: CatalystCalendarItem[], ownershipItems: OwnershipCatalystItem[], transcriptItems: TranscriptCatalystItem[]): string {
  const parts: string[] = [];
  const nextEarnings = calendarItems.find((item) => item.kind === 'earnings' && item.date);
  if (nextEarnings) parts.push(`Next earnings on ${nextEarnings.displayDate}`);
  const primaryEconomic = calendarItems.find((item) => item.kind === 'economic');
  if (primaryEconomic) parts.push(`macro watch item: ${primaryEconomic.title}`);
  const buybackSignal = ownershipItems.find((item) => item.key === 'buybackSignal');
  if (buybackSignal) parts.push(`capital allocation read: ${buybackSignal.displayValue.toLowerCase()}`);
  const insiderSignal = ownershipItems.find((item) => item.key === 'insiderSentiment');
  if (insiderSignal) parts.push(`insider tape: ${insiderSignal.displayValue.toLowerCase()}`);
  const transcriptSignal = transcriptItems[0];
  if (transcriptSignal) parts.push(`latest transcript still points to ${transcriptSignal.excerpt.toLowerCase()}`);

  return parts.length > 0
    ? parts.join('; ')
    : 'No company-specific catalyst context was available from the current provider and cache set.';
}

export async function getCompanyCatalystContext(
  ticker: string | null | undefined,
  modelType: ModelType,
): Promise<CompanyCatalystContext | null> {
  const normalizedTicker = String(ticker ?? '').trim().toUpperCase();
  if (!normalizedTicker) return null;

  const cacheKey = `${modelType}:${normalizedTicker}`;
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const warnings: string[] = [];
  const [earningsEvents, economicCalendar, ownershipSnapshot, institutionalItems, insiderItems, transcriptItems] = await Promise.all([
    loadEarningsEvents(normalizedTicker).catch(() => []),
    loadEconomicCalendar().catch(() => []),
    loadOwnershipSnapshot(normalizedTicker).catch(() => ({
      latestShares: null,
      historicalShares: null,
      latestAsOf: null,
      historicalAsOf: null,
      shareCountChangePct: null,
    })),
    loadInstitutionalOwnershipItems(normalizedTicker, modelType).catch(() => []),
    loadInsiderItems(normalizedTicker, modelType).catch(() => []),
    loadTranscriptItems(normalizedTicker, modelType).catch(() => []),
  ]);

  const nextEarnings = earningsEvents.find((event) => isFutureDate(event.date));
  const lastEarnings = sortByDateDesc(earningsEvents.filter((event) => !isFutureDate(event.date)))[0];

  const calendarItems: CatalystCalendarItem[] = [];
  if (nextEarnings) {
    calendarItems.push({
      kind: 'earnings',
      title: 'Next earnings date',
      date: nextEarnings.date,
      displayDate: formatDate(nextEarnings.date),
      source: 'FMP earnings',
      status: 'reported',
      relevance: calendarRelevance(modelType, 'earnings'),
      note: nextEarnings.note,
    });
  }
  if (lastEarnings) {
    calendarItems.push({
      kind: 'earnings',
      title: 'Latest reported quarter',
      date: lastEarnings.date,
      displayDate: formatDate(lastEarnings.date),
      source: 'FMP earnings',
      status: 'reported',
      relevance: 'secondary',
      note: lastEarnings.note,
    });
  }
  calendarItems.push(
    ...economicCalendar.slice(0, 4).map((item) => ({
      ...item,
      relevance: calendarRelevance(modelType, 'economic'),
    })),
  );

  const ownershipItems = [
    ...institutionalItems,
    ...insiderItems,
    ...buildShareCountItems(ownershipSnapshot, modelType),
  ];

  if (calendarItems.length === 0) warnings.push('No earnings or economic calendar events were available from the current provider set.');
  if (ownershipItems.length === 0) warnings.push('No ownership, insider, or buyback signals were available for this ticker.');
  if (transcriptItems.length === 0) warnings.push('No transcript catalyst context was available for this ticker.');

  const context: CompanyCatalystContext = {
    asOf: isoToday(),
    summary: buildSummary(calendarItems, ownershipItems, transcriptItems),
    warnings,
    calendarItems,
    ownershipItems,
    transcriptItems,
  };

  contextCache.set(cacheKey, {
    expiresAt: Date.now() + CONTEXT_TTL_MS,
    value: context,
  });

  return context;
}

export function __private__extractCatalystSentences(text: string, limit = 3): string[] {
  return extractCatalystSentences(text, limit);
}
