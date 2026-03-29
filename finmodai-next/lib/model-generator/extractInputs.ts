import { inferTickerFromPrompt } from '@/lib/analyst/retrieval';
import type { AttachmentStatementSnapshot } from '@/lib/analyst/pdfFinancialStatements';
import type { ProvenanceSummary } from '@/lib/model-generator/runHistory';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import {
  CAP_TABLE_DEFAULTS,
  COMPS_DEFAULTS,
  DCF_DEFAULTS,
  DEBT_CAPACITY_LITE_DEFAULTS,
  FOOTBALL_FIELD_DEFAULTS,
  LBO_DEFAULTS,
  MERGER_DEFAULTS,
  PRECEDENTS_DEFAULTS,
  SAAS_OPERATING_DEFAULTS,
  THREE_STATEMENT_DEFAULTS,
} from '@/lib/model-generator/defaults';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import {
  getQualityPublicCompanyUniverse,
  type MarketCompanyListing,
} from '@/lib/data/company/companyUniverse';
import { evaluateCriticalInputs } from '@/lib/model-generator/inputRequirements';
import { loadDemoSnapshots, type DemoCompanySnapshot } from '@/lib/demo/demoSnapshotStore';
import { DEMO_COMPANY_META, DEMO_TICKERS } from '@/lib/demo/demoUniverse';
import { buildSeededFallbackLtm } from '@/lib/demo/seededTickerFallback';

export type DcfModelInputs = {
  modelType: 'DCF';
  companyName: string;
  companyType?: string;
  ticker?: string;
  source: string;
  years: number;
  baseRevenue: number;
  cash: number;
  debt: number;
  sharesOutstanding: number;
  sharePrice: number | null;
  marketCap: number | null;
  revenueGrowth: number[];
  ebitMargin: number[];
  taxRate: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  wacc: number;
  terminalGrowth: number;
};

export type ThreeStatementModelInputs = {
  modelType: 'THREE_STATEMENT';
  companyName: string;
  companyType?: string;
  ticker?: string;
  source: string;
  years: number;
  baseRevenue: number;
  revenueGrowth: number[];
  grossMargin: number;
  opexPctRevenue: number;
  taxRate: number;
  capexPctRevenue: number;
  daPctRevenue: number;
  debt: number;
  cash: number;
};

export type CapTableModelInputs = {
  modelType: 'CAP_TABLE';
  roundType: string;
  preMoney: number;
  raiseAmount: number;
  founderShares: number;
  optionPoolRefresh: number;
};

export type CompsPeerInputs = {
  ticker: string;
  name: string;
  marketCap: number | null;
  price: number | null;
  sharesOutstanding: number | null;
  totalDebt: number | null;
  cash: number | null;
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
};

export type CompsModelInputs = {
  modelType: 'COMPS';
  companyName: string;
  companyType?: string;
  ticker?: string;
  source: string;
  peerSetLabel: string;
  valuationMultiples: string[];
  selectedMultiples?: {
    evToRevenue: number | null;
    evToEbitda: number | null;
    peRatio: number | null;
  };
  subject: CompsPeerInputs;
  peers: CompsPeerInputs[];
};

export type DebtCapacityLiteModelInputs = {
  modelType: 'DEBT_CAPACITY_LITE';
  companyName: string;
  companyType?: string;
  ticker?: string;
  source: string;
  ebitda: number | null;
  currentNetDebt: number | null;
  maxLeverage: number;
  minInterestCoverage: number;
  interestRate: number;
};

export type FootballFieldRangeInputs = {
  label: string;
  basis: 'revenue' | 'ebitda';
  lowMultiple: number | null;
  midMultiple: number | null;
  highMultiple: number | null;
  lowValue: number | null;
  midValue: number | null;
  highValue: number | null;
  commentary: string;
};

export type FootballFieldModelInputs = {
  modelType: 'FOOTBALL_FIELD';
  companyName: string;
  companyType?: string;
  ticker?: string;
  source: string;
  sharePrice: number | null;
  sharesOutstanding: number | null;
  netDebt: number | null;
  revenue: number | null;
  ebitda: number | null;
  peerSetLabel: string;
  ranges: FootballFieldRangeInputs[];
};

export type MergerModelInputs = {
  modelType: 'MERGER';
  companyName: string;
  ticker?: string;
  source: string;
  acquirerTicker: string | null;
  acquirerName: string;
  acquirerRevenue: number | null;
  acquirerEbitda: number | null;
  acquirerEbit: number | null;
  acquirerNetIncome: number | null;
  acquirerShares: number | null;
  acquirerMarketCap: number | null;
  acquirerPrice: number | null;
  targetTicker: string | null;
  targetName: string;
  targetRevenue: number | null;
  targetEbitda: number | null;
  targetEbit: number | null;
  targetNetIncome: number | null;
  targetShares: number | null;
  targetMarketCap: number | null;
  targetPrice: number | null;
  purchasePrice: number | null;
  dealStructure: 'cash' | 'stock' | 'mixed';
  cashPct: number;
  stockPct: number;
  debtPct: number;
  forecastYears: number;
  newDebt: number;
  newDebtRate: number;
  synergies: number;
  oneTimeCosts: number;
  taxRate: number;
};

export type PrecedentTransactionInputs = {
  transaction: string;
  target: string;
  acquirer: string;
  announcementYear: number;
  enterpriseValue: number;
  revenueMultiple: number;
  ebitdaMultiple: number;
  premium: number;
};

export type PrecedentsModelInputs = {
  modelType: 'PRECEDENTS';
  companyName: string;
  companyType?: string;
  ticker?: string;
  source: string;
  subjectRevenue: number | null;
  subjectEbitda: number | null;
  transactions: PrecedentTransactionInputs[];
  transactionCount: number;
  revenueMultiple: number;
  ebitdaMultiple: number;
};

export type LboModelInputs = {
  modelType: 'LBO';
  companyName: string;
  companyType?: string;
  ticker?: string;
  source: string;
  revenue: number;
  ebitda: number;
  netDebt: number;
  entryMultiple: number;
  exitMultiple: number;
  debtPercent: number;
  equityPercent: number;
  interestRate: number;
  amortizationPercent: number;
  cashSweepPercent: number;
  revenueGrowth: number[];
  ebitdaMargin: number;
  capexPctRevenue: number;
  deltaNwcPctRevenue: number;
  taxRate: number;
  holdingPeriodYears: number;
  sharesOutstanding: number | null;
  sharePrice: number | null;
};

export type SaasOperatingModelInputs = {
  modelType: 'SAAS_OPERATING_MODEL';
  companyName: string;
  companyType?: string;
  companyScale?: string;
  years: number;
  source: string;
  startingArr: number;
  growthRate: number;
  grossMargin: number;
  churn: number;
  cac: number;
  arpu: number;
};

export type ExtractedModelInputs =
  | DcfModelInputs
  | ThreeStatementModelInputs
  | CapTableModelInputs
  | CompsModelInputs
  | DebtCapacityLiteModelInputs
  | FootballFieldModelInputs
  | MergerModelInputs
  | PrecedentsModelInputs
  | LboModelInputs
  | SaasOperatingModelInputs;

export type ExtractInputsResult = {
  extractedInputs: ExtractedModelInputs;
  defaultsUsed: Record<string, unknown>;
  missingInputs: string[];
  missingCriticalInputs: string[];
  provenanceSummary: ProvenanceSummary;
};

export type ExtractInputsOptions = {
  clarificationAnswer?: string;
  inputOverrides?: Record<string, unknown>;
  demoSnapshotsOverride?: Record<string, DemoCompanySnapshot>;
  marketCompanyUniverseOverride?: MarketCompanyListing[];
  attachmentStatementSnapshot?: AttachmentStatementSnapshot | null;
};

type CompanyProfile = {
  dcfRevenueGrowth?: number[];
  dcfEbitMargin?: number[];
  threeRevenueGrowth?: number[];
  threeGrossMargin?: number;
  threeOpexPct?: number;
  saasGrowthRate?: number;
  saasGrossMargin?: number;
  saasChurn?: number;
  saasCac?: number;
  saasArpu?: number;
};

type ScaleProfile = {
  startingArr: number;
  growthRate: number;
  churn: number;
  cac: number;
  arpu: number;
};

const COMPANY_TYPE_MATCHERS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Semiconductors', pattern: /\b(?:semiconductor|chip|gpu|ai infrastructure)\b/i },
  { label: 'SaaS', pattern: /\b(?:saas|software|cloud)\b/i },
  { label: 'Fintech', pattern: /\b(?:fintech|payments|banking|lending)\b/i },
  { label: 'Consumer', pattern: /\b(?:consumer|retail|e-?commerce|marketplace)\b/i },
  { label: 'Industrial', pattern: /\b(?:industrial|manufacturing|logistics)\b/i },
  { label: 'Healthcare', pattern: /\b(?:healthcare|medtech|biotech|pharma)\b/i },
];

const COMPANY_SCALE_MATCHERS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Seed', pattern: /\bseed\b|\bearly stage\b|\bstartup\b/i },
  { label: 'Series A', pattern: /\bseries a\b|\bgrowth stage\b/i },
  { label: 'Mid-Market', pattern: /\bmid[-\s]?market\b|\bscale-up\b/i },
  { label: 'Enterprise', pattern: /\benterprise\b|\blarge[-\s]?cap\b|\bpublic\b/i },
];

const COMPANY_PROFILES: Record<string, CompanyProfile> = {
  Semiconductors: {
    dcfRevenueGrowth: [0.18, 0.16, 0.13, 0.1, 0.08],
    dcfEbitMargin: [0.32, 0.33, 0.34, 0.34, 0.35],
    threeRevenueGrowth: [0.16, 0.14, 0.12, 0.1, 0.08],
    threeGrossMargin: 0.66,
    threeOpexPct: 0.28,
  },
  SaaS: {
    dcfRevenueGrowth: [0.24, 0.2, 0.16, 0.12, 0.09],
    dcfEbitMargin: [0.2, 0.22, 0.24, 0.26, 0.28],
    threeRevenueGrowth: [0.24, 0.2, 0.16, 0.12, 0.1],
    threeGrossMargin: 0.76,
    threeOpexPct: 0.44,
    saasGrowthRate: 0.45,
    saasGrossMargin: 0.79,
    saasChurn: 0.07,
    saasCac: 14000,
    saasArpu: 22000,
  },
  Fintech: {
    dcfRevenueGrowth: [0.2, 0.18, 0.14, 0.11, 0.09],
    dcfEbitMargin: [0.22, 0.24, 0.25, 0.27, 0.28],
    threeRevenueGrowth: [0.2, 0.17, 0.14, 0.11, 0.09],
    threeGrossMargin: 0.68,
    threeOpexPct: 0.36,
    saasGrowthRate: 0.35,
    saasGrossMargin: 0.74,
    saasChurn: 0.08,
    saasCac: 16000,
    saasArpu: 24000,
  },
  Consumer: {
    dcfRevenueGrowth: [0.12, 0.1, 0.08, 0.06, 0.05],
    dcfEbitMargin: [0.15, 0.16, 0.16, 0.17, 0.17],
    threeRevenueGrowth: [0.12, 0.1, 0.08, 0.07, 0.06],
    threeGrossMargin: 0.48,
    threeOpexPct: 0.24,
  },
  Industrial: {
    dcfRevenueGrowth: [0.1, 0.08, 0.07, 0.06, 0.05],
    dcfEbitMargin: [0.18, 0.19, 0.2, 0.2, 0.21],
    threeRevenueGrowth: [0.1, 0.08, 0.07, 0.06, 0.05],
    threeGrossMargin: 0.42,
    threeOpexPct: 0.18,
  },
  Healthcare: {
    dcfRevenueGrowth: [0.14, 0.12, 0.1, 0.08, 0.07],
    dcfEbitMargin: [0.19, 0.21, 0.22, 0.23, 0.24],
    threeRevenueGrowth: [0.14, 0.12, 0.1, 0.08, 0.07],
    threeGrossMargin: 0.58,
    threeOpexPct: 0.3,
  },
};

const SCALE_PROFILES: Record<string, ScaleProfile> = {
  Seed: {
    startingArr: 1500000,
    growthRate: 0.7,
    churn: 0.1,
    cac: 9000,
    arpu: 12000,
  },
  'Series A': {
    startingArr: 5000000,
    growthRate: 0.4,
    churn: 0.08,
    cac: 12000,
    arpu: 18000,
  },
  'Mid-Market': {
    startingArr: 15000000,
    growthRate: 0.28,
    churn: 0.07,
    cac: 15000,
    arpu: 26000,
  },
  Enterprise: {
    startingArr: 40000000,
    growthRate: 0.18,
    churn: 0.05,
    cac: 24000,
    arpu: 52000,
  },
};

const MARKET_UNIVERSE_CACHE_TTL_MS = 5 * 60 * 1000;
let marketUniverseCache: { loadedAt: number; rows: MarketCompanyListing[] } | null = null;

export async function extractInputs(
  prompt: string,
  modelType: ModelGeneratorType,
  options: ExtractInputsOptions = {}
): Promise<ExtractInputsResult> {
  const fullPrompt = [prompt, options.clarificationAnswer].filter(Boolean).join(' ').trim();

  let result: ExtractInputsResult;
  switch (modelType) {
    case 'DCF':
      result = await buildDcfInputs(fullPrompt, options);
      break;
    case 'THREE_STATEMENT':
      result = await buildThreeStatementInputs(fullPrompt, options);
      break;
    case 'CAP_TABLE':
      result = await buildCapTableInputs(fullPrompt);
      break;
    case 'COMPS':
      result = await buildCompsInputs(fullPrompt, options);
      break;
    case 'DEBT_CAPACITY_LITE':
      result = await buildDebtCapacityLiteInputs(fullPrompt);
      break;
    case 'FOOTBALL_FIELD':
      result = await buildFootballFieldInputs(fullPrompt, options);
      break;
    case 'MERGER':
      result = await buildMergerInputs(fullPrompt, options);
      break;
    case 'PRECEDENTS':
      result = await buildPrecedentsInputs(fullPrompt, options);
      break;
    case 'LBO':
      result = await buildLboInputs(fullPrompt, options);
      break;
    case 'SAAS_OPERATING_MODEL':
      result = await buildSaasInputs(fullPrompt);
      break;
  }

  if (options.inputOverrides && Object.keys(options.inputOverrides).length > 0) {
    result = {
      ...result,
      extractedInputs: applyInputOverrides(result.extractedInputs, options.inputOverrides),
    };
  }

  return result;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSeededDemoSnapshots(baseSnapshots: Record<string, DemoCompanySnapshot>): Record<string, DemoCompanySnapshot> {
  const merged = { ...baseSnapshots };

  for (const ticker of DEMO_TICKERS) {
    if (merged[ticker]) continue;

    const seeded = buildSeededFallbackLtm(ticker);
    const meta = DEMO_COMPANY_META[ticker];
    merged[ticker] = {
      ticker,
      companyName: meta?.name ?? seeded.companyName ?? ticker,
      sector: meta?.sector ?? seeded.sector ?? null,
      revenueLtm: seeded.revenue ?? null,
      ebitdaLtm: seeded.ebitda ?? null,
      netIncomeLtm: seeded.netIncome ?? null,
      cash: seeded.cash ?? null,
      totalDebt: seeded.totalDebt ?? null,
      sharesOutstanding: seeded.sharesOutstanding ?? null,
      marketCap: seeded.marketCap ?? null,
      sharePrice:
        seeded.marketCap && seeded.sharesOutstanding ? seeded.marketCap / seeded.sharesOutstanding : null,
      updatedAt: seeded.lastUpdated ?? null,
    };
  }

  return merged;
}

function marketListingToDemoSnapshot(row: MarketCompanyListing): DemoCompanySnapshot {
  return {
    ticker: row.ticker,
    companyName: row.companyName ?? row.ticker,
    sector: row.sector ?? row.companyType ?? null,
    revenueLtm: row.revenueLtm ?? null,
    ebitdaLtm: row.ebitdaLtm ?? null,
    netIncomeLtm: row.netIncomeLtm ?? null,
    cash: row.cash ?? null,
    totalDebt: row.totalDebt ?? null,
    sharesOutstanding: row.sharesOutstanding ?? null,
    sharePrice: row.sharePrice ?? null,
    marketCap: row.marketCap ?? null,
    updatedAt: row.updatedAt ?? row.asOfDate ?? null,
    sourceMap: {
      listing: row.source,
    },
  };
}

function preferSnapshotMetric<T extends string | number>(
  primary: T | null | undefined,
  fallback: T | null | undefined,
  options: { requirePositive?: boolean } = {}
): T | null | undefined {
  if (typeof primary === 'number') {
    if (Number.isFinite(primary) && (!options.requirePositive || primary > 0)) return primary;
  } else if (typeof primary === 'string' && primary.trim().length > 0) {
    return primary;
  }

  if (typeof fallback === 'number') {
    if (Number.isFinite(fallback) && (!options.requirePositive || fallback > 0)) return fallback;
  } else if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback;
  }

  return primary ?? fallback;
}

function mergeMarketListingsIntoDemoSnapshots(
  baseSnapshots: Record<string, DemoCompanySnapshot>,
  listings: MarketCompanyListing[]
): Record<string, DemoCompanySnapshot> {
  const merged = buildSeededDemoSnapshots(baseSnapshots);

  for (const listing of listings) {
    const ticker = listing.ticker.trim().toUpperCase();
    if (!ticker) continue;
    const current = merged[ticker];
    const candidate = marketListingToDemoSnapshot(listing);

    merged[ticker] = {
      ticker,
      companyName: preferSnapshotMetric(candidate.companyName, current?.companyName) ?? ticker,
      sector: preferSnapshotMetric(candidate.sector, current?.sector) ?? null,
      revenueLtm: preferSnapshotMetric(candidate.revenueLtm, current?.revenueLtm, { requirePositive: true }) ?? null,
      ebitdaLtm: preferSnapshotMetric(candidate.ebitdaLtm, current?.ebitdaLtm) ?? null,
      netIncomeLtm: preferSnapshotMetric(candidate.netIncomeLtm, current?.netIncomeLtm) ?? null,
      cash: preferSnapshotMetric(candidate.cash, current?.cash) ?? null,
      totalDebt: preferSnapshotMetric(candidate.totalDebt, current?.totalDebt) ?? null,
      sharesOutstanding:
        preferSnapshotMetric(candidate.sharesOutstanding, current?.sharesOutstanding, { requirePositive: true }) ?? null,
      sharePrice: preferSnapshotMetric(candidate.sharePrice, current?.sharePrice, { requirePositive: true }) ?? null,
      marketCap: preferSnapshotMetric(candidate.marketCap, current?.marketCap, { requirePositive: true }) ?? null,
      updatedAt: preferSnapshotMetric(candidate.updatedAt, current?.updatedAt) ?? null,
      sourceMap: {
        ...(current?.sourceMap ?? {}),
        ...(candidate.sourceMap ?? {}),
      },
    };
  }

  return merged;
}

async function loadQualityMarketUniverse(
  options: ExtractInputsOptions = {}
): Promise<MarketCompanyListing[]> {
  if (options.marketCompanyUniverseOverride) {
    return options.marketCompanyUniverseOverride;
  }

  if (marketUniverseCache && Date.now() - marketUniverseCache.loadedAt < MARKET_UNIVERSE_CACHE_TTL_MS) {
    return marketUniverseCache.rows;
  }

  const rows = await getQualityPublicCompanyUniverse(1000);
  marketUniverseCache = {
    loadedAt: Date.now(),
    rows,
  };
  return rows;
}

async function loadExpandedModelUniverseSnapshots(
  options: ExtractInputsOptions = {}
): Promise<Record<string, DemoCompanySnapshot>> {
  const [baseSnapshots, marketUniverse] = await Promise.all([
    options.demoSnapshotsOverride ? Promise.resolve(options.demoSnapshotsOverride) : loadDemoSnapshots(),
    loadQualityMarketUniverse(options),
  ]);

  return mergeMarketListingsIntoDemoSnapshots(baseSnapshots, marketUniverse);
}

function extractEntityList(raw: string): string[] {
  return raw
    .split(/\band\b|\bversus\b|\bvs\.?\b|\bagainst\b|,|;/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveDemoTickersFromList(raw: string, snapshots: Record<string, DemoCompanySnapshot>): string[] {
  const candidates = extractEntityList(raw);
  const resolved = new Set<string>();

  for (const candidate of candidates) {
    const upper = candidate.toUpperCase();
    if (snapshots[upper]) {
      resolved.add(upper);
      continue;
    }

    const normalizedCandidate = normalizeText(candidate);
    for (const [ticker, snapshot] of Object.entries(snapshots)) {
      const normalizedName = normalizeText(snapshot.companyName || '');
      if (normalizedName && (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName))) {
        resolved.add(ticker);
        break;
      }
    }
  }

  return Array.from(resolved);
}

function resolveDemoTickerFromEntity(entity: string, snapshots: Record<string, DemoCompanySnapshot>): string | null {
  const direct = resolveDemoTickersFromList(entity, snapshots);
  return direct[0] ?? null;
}

function sanitizeEntityCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\b(build|create|generate|analyze)\b/gi, ' ')
    .replace(/\b(?:a|an|the)\s+(?:merger|m&a|accretion(?:\s*\/\s*|\s+and\s+|\s+)dilution)\s+model\b/gi, ' ')
    .replace(/\bmodel\b/gi, ' ')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function extractMergerEntities(prompt: string): { acquirerRaw: string | null; targetRaw: string | null } {
  const patterns = [
    /\bfor\s+(.+?)\s+(?:acquiring|to acquire|acquire|buying|to buy|buy|merging with|merge with)\s+(.+?)(?:\s+(?:at|for|with|using|assuming|under)\b|$)/i,
    /\b(.+?)\s+(?:acquiring|to acquire|acquire|buying|to buy|buy|merging with|merge with)\s+(.+?)(?:\s+(?:at|for|with|using|assuming|under)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const acquirerRaw = sanitizeEntityCandidate(match?.[1] ?? null);
    const targetRaw = sanitizeEntityCandidate(match?.[2] ?? null);
    if (acquirerRaw && targetRaw) {
      return { acquirerRaw, targetRaw };
    }
  }

  return { acquirerRaw: null, targetRaw: null };
}

function extractDealValue(text: string): number | undefined {
  const match =
    text.match(/(?:purchase\s+price|deal\s+value)\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i) ||
    text.match(/\b(?:at|for)\s+\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)(?:\s+purchase price|\s+deal value)?/i);
  return parseMoneyToken(match?.[1]);
}

type ResolvedMergerParty = {
  ticker: string | null;
  companyName: string | null;
  companyType: string | null;
  revenue: number | null;
  ebitda: number | null;
  ebit: number | null;
  netIncome: number | null;
  sharesOutstanding: number | null;
  cash: number | null;
  totalDebt: number | null;
  marketCap: number | null;
  sharePrice: number | null;
  source: string;
  asOfDate: string | null;
  lastSynced: string | null;
};

async function resolveMergerParty(
  entity: string | null,
  snapshots: Record<string, DemoCompanySnapshot>
): Promise<ResolvedMergerParty | null> {
  if (!entity) return null;

  const stored = await resolveCompanyProfile({ prompt: entity });
  if (stored?.company) {
    return {
      ticker: stored.company.ticker,
      companyName: stored.company.name,
      companyType: stored.company.companyType ?? stored.company.sector ?? null,
      revenue: stored.snapshot?.revenueLtm ?? null,
      ebitda: stored.snapshot?.ebitdaLtm ?? null,
      ebit: stored.snapshot?.ebitLtm ?? null,
      netIncome: stored.snapshot?.netIncomeLtm ?? null,
      sharesOutstanding: stored.snapshot?.sharesOutstanding ?? null,
      cash: stored.snapshot?.cash ?? null,
      totalDebt: stored.snapshot?.totalDebt ?? null,
      marketCap: stored.snapshot?.marketCap ?? null,
      sharePrice:
        stored.latestPrice?.close ??
        (stored.snapshot?.marketCap && stored.snapshot?.sharesOutstanding
          ? stored.snapshot.marketCap / stored.snapshot.sharesOutstanding
          : null),
      source: stored.snapshot?.source ?? 'company_snapshots',
      asOfDate: stored.snapshot?.asOfDate ?? null,
      lastSynced: stored.snapshot?.createdAt ?? stored.latestPrice?.createdAt ?? null,
    };
  }

  const fallbackTicker = resolveDemoTickerFromEntity(entity, snapshots);
  if (!fallbackTicker) return null;
  const snapshot = snapshots[fallbackTicker];
  const sharePrice =
    snapshot.sharePrice ??
    (snapshot.marketCap && snapshot.sharesOutstanding ? snapshot.marketCap / snapshot.sharesOutstanding : null);
  const ebitdaLtm = snapshot.ebitdaLtm ?? null;
  return {
    ticker: fallbackTicker,
    companyName: snapshot.companyName ?? fallbackTicker,
    companyType: snapshot.sector ?? null,
    revenue: snapshot.revenueLtm ?? null,
    ebitda: ebitdaLtm,
    ebit: ebitdaLtm !== null ? Number((ebitdaLtm * 0.9).toFixed(2)) : null,
    netIncome: snapshot.netIncomeLtm ?? null,
    sharesOutstanding: snapshot.sharesOutstanding ?? null,
    cash: snapshot.cash ?? null,
    totalDebt: snapshot.totalDebt ?? null,
    marketCap: snapshot.marketCap ?? null,
    sharePrice,
    source: 'demo_company_snapshots',
    asOfDate: snapshot.updatedAt ?? null,
    lastSynced: snapshot.updatedAt ?? null,
  };
}

function sanitizeCompsSubjectPrompt(prompt: string): string {
  return prompt
    .replace(/\bcomparable company analysis\b/gi, ' ')
    .replace(/\bcomps\b/gi, ' ')
    .replace(/\binclude\s+.+?\s+in\s+(?:its|the)\s+peer group\b/gi, ' ')
    .replace(/\badd\s+.+?\s+to\s+(?:its|the)\s+peers?\b/gi, ' ')
    .replace(/\b(?:replace|set|change|update)\s+(?:its|the)\s+peers?\s+(?:to|with)\s+.+$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExplicitPeerTickers(prompt: string, snapshots: Record<string, DemoCompanySnapshot>): string[] {
  const patterns = [
    /include\s+(.+?)\s+in\s+(?:its|the)\s+peer group/i,
    /add\s+(.+?)\s+to\s+(?:its|the)\s+peers?/i,
    /(?:set|replace|change|update)\s+(?:its|the)\s+peers?\s+(?:to|with)\s+([^.\n]+)/i,
    /peer group\s+(?:with|including)\s+([^.\n]+)/i,
    /compare\s+(.+?)(?:\s+as\s+investments?\b|\s+on\s+valuation\b|\s+and\s+tell\s+me\b|\s+assuming\b|\s+under\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match?.[1]) continue;
    const tickers = resolveDemoTickersFromList(match[1], snapshots);
    if (tickers.length > 0) return tickers;
  }

  return [];
}

function isInstructionContaminatedName(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\b(include|peer group|peers|comparable|analysis|transaction|precedent|with microsoft|with peers?)\b/i.test(value);
}

function cloneArray(values: readonly number[]): number[] {
  return [...values];
}

function applyInputOverrides<T extends ExtractedModelInputs>(inputs: T, overrides: Record<string, unknown>): T {
  const merged = { ...inputs } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in merged)) continue;
    merged[key] = value;
  }
  return merged as T;
}

function fadeGrowthSeries(start: number, floor: number, years: number): number[] {
  if (years <= 1) return [Number(start.toFixed(4))];
  return Array.from({ length: years }, (_, index) => {
    const step = (start - floor) / (years - 1);
    return Number(Math.max(start - step * index, floor).toFixed(4));
  });
}

function parseMoneyToken(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/\$/g, '').replace(/,/g, '').replace(/\s+/g, '');
  const match = cleaned.match(/^(-?\d*\.?\d+)([kmb])?$/i);
  if (!match) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1;
  return base * multiplier;
}

function parsePercentToken(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/%/g, '').trim();
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed > 1 ? parsed / 100 : parsed;
}

function parseMultipleToken(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/x/gi, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractCompanyName(prompt: string): string | null {
  const match =
    prompt.match(/for\s+([A-Za-z0-9.'& -]+?)(?:\s+(?:with|at|growing|using|based|assuming|starting|raising)\b|$)/i) ||
    prompt.match(/model\s+for\s+([A-Za-z0-9.'& -]+)$/i);

  const candidate = match?.[1]?.trim().replace(/[.,]+$/, '') || '';
  if (!candidate) return null;
  if (/^(a|an)\s+/i.test(candidate)) return null;
  if (/^(company|business|startup)$/i.test(candidate)) return null;
  if (extractCompanyType(candidate)) return null;
  return candidate;
}

function extractCompanyType(text: string): string | null {
  for (const matcher of COMPANY_TYPE_MATCHERS) {
    if (matcher.pattern.test(text)) {
      return matcher.label;
    }
  }
  return null;
}

function extractCompanyScale(text: string): string | null {
  for (const matcher of COMPANY_SCALE_MATCHERS) {
    if (matcher.pattern.test(text)) {
      return matcher.label;
    }
  }
  return null;
}

function extractBaseRevenue(text: string): number | undefined {
  const match =
    text.match(/(?:base\s+revenue|revenue|sales)\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i) ||
    text.match(/\$([\d.,]+(?:\.\d+)?\s*[kmb]?)\s*(?:revenue|sales)/i);
  return parseMoneyToken(match?.[1]);
}

function extractGrowthRate(text: string): number | undefined {
  const match =
    text.match(/growing\s+(\d+(?:\.\d+)?)\s*%\s*(?:per year|annually|a year)?/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:growth|revenue growth|arr growth)/i);
  return parsePercentToken(match?.[1]);
}

function extractWacc(text: string): number | undefined {
  const match = text.match(/wacc\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  return parsePercentToken(match?.[1]);
}

function extractTerminalGrowth(text: string): number | undefined {
  const match = text.match(/terminal\s+growth\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  return parsePercentToken(match?.[1]);
}

function extractMargin(text: string, labelPattern: RegExp): number | undefined {
  const match = text.match(labelPattern);
  return parsePercentToken(match?.[1]);
}

function extractHoldingPeriodYears(text: string): number | undefined {
  const match = text.match(/(\d+)\s*[- ]?(?:year|yr)\b/i) || text.match(/hold(?:ing)? period\s+(?:of\s+)?(\d+)/i);
  const parsed = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractMultiple(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  return parseMultipleToken(match?.[1]);
}

function extractRoundType(text: string): string | undefined {
  if (/series c/i.test(text)) return 'Series C';
  if (/series b/i.test(text)) return 'Series B';
  if (/series a/i.test(text)) return 'Series A';
  if (/seed/i.test(text)) return 'Seed';
  return undefined;
}

function deriveCompanyLabel(companyType: string | null, fallback: string): string {
  if (!companyType) return fallback;
  if (companyType === 'SaaS') return 'SaaS Co.';
  return `${companyType} Business`;
}

function normalizeSectorBucket(value: string | null | undefined): string | null {
  const normalized = normalizeText(value || '');
  if (!normalized) return null;
  if (/\b(software|cloud|internet|technology|tech|semiconductor|chip|communication)\b/.test(normalized)) return 'Technology';
  if (/\b(bank|financial|payments|fintech|insurance|broker)\b/.test(normalized)) return 'Financials';
  if (/\b(consumer|retail|e commerce|ecommerce|marketplace|discretionary|staples)\b/.test(normalized)) return 'Consumer';
  if (/\b(industrial|manufacturing|transport|logistics|aerospace|defense)\b/.test(normalized)) return 'Industrial';
  if (/\b(healthcare|medtech|biotech|pharma)\b/.test(normalized)) return 'Healthcare';
  if (/\b(energy|oil|gas|utilities|power)\b/.test(normalized)) return 'Energy';
  if (/\b(materials|mining|chemicals)\b/.test(normalized)) return 'Materials';
  return value?.trim() || null;
}

function hasCompsCoreFields(snapshot: DemoCompanySnapshot): boolean {
  const marketCap =
    snapshot.marketCap ?? (snapshot.sharePrice && snapshot.sharesOutstanding ? snapshot.sharePrice * snapshot.sharesOutstanding : null);
  return typeof marketCap === 'number' && marketCap > 0 && typeof snapshot.revenueLtm === 'number' && snapshot.revenueLtm > 0;
}

function pickRankedCompsPeers(params: {
  snapshots: Record<string, DemoCompanySnapshot>;
  subjectTicker?: string;
  subjectSector?: string | null;
  subjectMarketCap?: number | null;
  peerCount: number;
}): Array<readonly [string, DemoCompanySnapshot]> {
  const subjectBucket = normalizeSectorBucket(params.subjectSector);
  const targetCap = typeof params.subjectMarketCap === 'number' && params.subjectMarketCap > 0 ? params.subjectMarketCap : null;

  return Object.entries(params.snapshots)
    .filter(([candidateTicker, snapshot]) => candidateTicker !== params.subjectTicker && hasCompsCoreFields(snapshot))
    .map(([candidateTicker, snapshot]) => {
      const candidateBucket = normalizeSectorBucket(snapshot.sector);
      const exactSector = params.subjectSector && snapshot.sector && normalizeText(snapshot.sector) === normalizeText(params.subjectSector) ? 3 : 0;
      const bucketMatch = subjectBucket && candidateBucket && subjectBucket === candidateBucket ? 2 : 0;
      const marketCap = snapshot.marketCap ?? (snapshot.sharePrice && snapshot.sharesOutstanding ? snapshot.sharePrice * snapshot.sharesOutstanding : null);
      const capDistance =
        targetCap && marketCap && targetCap > 0 && marketCap > 0 ? Math.abs(Math.log(marketCap / targetCap)) : Number.POSITIVE_INFINITY;

      return {
        candidateTicker,
        snapshot,
        marketCap: marketCap ?? 0,
        sectorScore: exactSector + bucketMatch,
        capDistance,
      };
    })
    .sort((left, right) => {
      if (right.sectorScore !== left.sectorScore) return right.sectorScore - left.sectorScore;
      if (left.capDistance !== right.capDistance) return left.capDistance - right.capDistance;
      return right.marketCap - left.marketCap;
    })
    .slice(0, params.peerCount)
    .map(({ candidateTicker, snapshot }) => [candidateTicker, snapshot] as const);
}

function toPeerInputs(ticker: string, snapshot: DemoCompanySnapshot): CompsPeerInputs {
  const marketCap = snapshot.marketCap ?? (snapshot.sharePrice && snapshot.sharesOutstanding ? snapshot.sharePrice * snapshot.sharesOutstanding : null);
  return {
    ticker,
    name: snapshot.companyName || ticker,
    marketCap,
    price: snapshot.sharePrice ?? null,
    sharesOutstanding: snapshot.sharesOutstanding ?? null,
    totalDebt: snapshot.totalDebt ?? null,
    cash: snapshot.cash ?? null,
    revenue: snapshot.revenueLtm ?? null,
    ebitda: snapshot.ebitdaLtm ?? null,
    netIncome: snapshot.netIncomeLtm ?? null,
  };
}

function mergeSnapshotValue<T>(primary: T | null | undefined, fallback: T | null | undefined): T | null | undefined {
  if (primary !== null && primary !== undefined) return primary;
  return fallback;
}

function attachmentHasAnyFinancials(snapshot: AttachmentStatementSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  return [
    snapshot.revenue,
    snapshot.grossProfit,
    snapshot.operatingIncome,
    snapshot.ebitda,
    snapshot.netIncome,
    snapshot.cash,
    snapshot.totalDebt,
    snapshot.sharesOutstanding,
    snapshot.capex,
    snapshot.depreciationAndAmortization,
  ].some((value) => typeof value === 'number' && Number.isFinite(value));
}

function attachmentMarginNumerator(
  snapshot: AttachmentStatementSnapshot | null | undefined,
  key: 'grossProfit' | 'operatingIncome' | 'ebitda',
): number | null {
  if (!snapshot || typeof snapshot.revenue !== 'number' || !(snapshot.revenue > 0)) return null;
  const numerator = snapshot[key];
  if (typeof numerator !== 'number' || !Number.isFinite(numerator)) return null;
  return numerator / snapshot.revenue;
}

function buildMarginSeriesFromObservedMargin(baseMargin: number, years: number, cap = 0.4): number[] {
  return Array.from({ length: years }, (_, index) =>
    Number(Math.min(baseMargin + index * 0.005, cap).toFixed(4)),
  );
}

function buildMergedCompsSubjectSnapshot(params: {
  ticker: string;
  companyName: string;
  companyType?: string | null;
  storedSnapshot?: {
    revenueLtm?: number | null;
    ebitdaLtm?: number | null;
    netIncomeLtm?: number | null;
    cash?: number | null;
    totalDebt?: number | null;
    sharesOutstanding?: number | null;
    marketCap?: number | null;
    asOfDate?: string | null;
    createdAt?: string | null;
    source?: string | null;
  } | null;
  latestPrice?: {
    close?: number | null;
  } | null;
  demoSnapshot?: DemoCompanySnapshot | null;
}): DemoCompanySnapshot {
  const { ticker, companyName, companyType, storedSnapshot, latestPrice, demoSnapshot } = params;
  return {
    ticker,
    companyName: mergeSnapshotValue(storedSnapshot ? companyName : null, demoSnapshot?.companyName) ?? companyName,
    sector: mergeSnapshotValue(companyType ?? null, demoSnapshot?.sector) ?? null,
    revenueLtm: mergeSnapshotValue(storedSnapshot?.revenueLtm, demoSnapshot?.revenueLtm) ?? null,
    ebitdaLtm: mergeSnapshotValue(storedSnapshot?.ebitdaLtm, demoSnapshot?.ebitdaLtm) ?? null,
    netIncomeLtm: mergeSnapshotValue(storedSnapshot?.netIncomeLtm, demoSnapshot?.netIncomeLtm) ?? null,
    cash: mergeSnapshotValue(storedSnapshot?.cash, demoSnapshot?.cash) ?? null,
    totalDebt: mergeSnapshotValue(storedSnapshot?.totalDebt, demoSnapshot?.totalDebt) ?? null,
    sharesOutstanding: mergeSnapshotValue(storedSnapshot?.sharesOutstanding, demoSnapshot?.sharesOutstanding) ?? null,
    sharePrice: mergeSnapshotValue(latestPrice?.close, demoSnapshot?.sharePrice) ?? null,
    marketCap: mergeSnapshotValue(storedSnapshot?.marketCap, demoSnapshot?.marketCap) ?? null,
    updatedAt: mergeSnapshotValue(storedSnapshot?.asOfDate, demoSnapshot?.updatedAt) ?? null,
  };
}

function buildProvenanceSummary(params: {
  source: string;
  asOfDate?: string | null;
  lastSynced?: string | null;
  fallbackUsed?: string[];
}): ProvenanceSummary {
  const source = params.source;
  const sourceType =
    source.includes('demo')
      ? 'demo_fallback'
      : source.includes('default') || source.includes('profile')
        ? 'prompt_defaults'
        : source.includes('inferred')
          ? 'inferred'
          : 'cached_real';

  return {
    sourceType,
    sources: [source],
    asOfDate: params.asOfDate ?? null,
    lastSynced: params.lastSynced ?? null,
    fallbackUsed: params.fallbackUsed ?? [],
  };
}

function getCompanyProfile(companyType: string | null): CompanyProfile {
  return companyType ? COMPANY_PROFILES[companyType] ?? {} : {};
}

function getScaleProfile(companyScale: string | null): ScaleProfile | null {
  return companyScale ? SCALE_PROFILES[companyScale] ?? null : null;
}

async function resolveStoredCompany(prompt: string) {
  return resolveCompanyProfile({ prompt });
}

async function resolveDemoCompany(
  prompt: string,
  options: ExtractInputsOptions = {}
): Promise<{ snapshot: DemoCompanySnapshot; ticker: string } | null> {
  const snapshots = await loadExpandedModelUniverseSnapshots(options);
  const ticker = inferTickerFromPrompt(prompt);
  if (ticker && snapshots[ticker]) {
    return { snapshot: snapshots[ticker], ticker };
  }

  const entityCandidate =
    extractCompanyName(prompt) ??
    sanitizeCompsSubjectPrompt(prompt) ??
    sanitizeEntityCandidate(prompt) ??
    prompt;
  const normalizedPrompt = normalizeText(entityCandidate);
  const promptTokens = normalizedPrompt.split(' ').filter((token) => token.length >= 3);
  let best: { snapshot: DemoCompanySnapshot; ticker: string; score: number } | null = null;

  for (const [candidateTicker, snapshot] of Object.entries(snapshots)) {
    const name = normalizeText(snapshot.companyName || '');
    if (!name) continue;
    const matchesFullName = normalizedPrompt.includes(name);
    const matchesEntityTokens =
      promptTokens.length > 0 && promptTokens.every((token) => name.includes(token));
    if (!matchesFullName && !matchesEntityTokens) continue;

    const score = matchesFullName ? name.length + 1000 : promptTokens.join(' ').length;
    if (!best || score > best.score) {
      best = { snapshot, ticker: candidateTicker, score };
    }
  }

  return best ? { snapshot: best.snapshot, ticker: best.ticker } : null;
}

function buildMissingList(fields: Array<[key: string, isProvided: boolean]>): string[] {
  return fields.filter(([, isProvided]) => !isProvided).map(([key]) => key);
}

async function buildDcfInputs(prompt: string, options: ExtractInputsOptions = {}): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {
    years: DCF_DEFAULTS.years,
    taxRate: DCF_DEFAULTS.taxRate,
    daPctRevenue: DCF_DEFAULTS.daPctRevenue,
    capexPctRevenue: DCF_DEFAULTS.capexPctRevenue,
    nwcPctRevenue: DCF_DEFAULTS.nwcPctRevenue,
  };

  const attachmentSnapshot = options.attachmentStatementSnapshot ?? null;
  const stored = await resolveStoredCompany(prompt);
  const resolved = stored?.snapshot ? null : await resolveDemoCompany(prompt, options);
  const companyType =
    extractCompanyType(prompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    null;
  if (companyType) providedInputs.add('companyType');
  const profile = getCompanyProfile(companyType);

  const parsedCompanyName = extractCompanyName(prompt);
  if (parsedCompanyName || stored?.company.name || resolved?.snapshot.companyName) providedInputs.add('companyName');
  const companyName =
    parsedCompanyName ||
    attachmentSnapshot?.companyName ||
    stored?.company.name ||
    resolved?.snapshot.companyName ||
    deriveCompanyLabel(companyType, 'Demo Company');

  const revenueGrowthInput = extractGrowthRate(prompt);
  const ebitMarginInput = extractMargin(prompt, /(?:ebit|operating)\s+margin\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  const waccInput = extractWacc(prompt);
  const terminalGrowthInput = extractTerminalGrowth(prompt);
  const baseRevenueInput = extractBaseRevenue(prompt);

  if (revenueGrowthInput !== undefined) providedInputs.add('revenueGrowth');
  if (ebitMarginInput !== undefined) providedInputs.add('ebitMargin');
  if (waccInput !== undefined) providedInputs.add('wacc');
  if (terminalGrowthInput !== undefined) providedInputs.add('terminalGrowth');
  if (baseRevenueInput !== undefined || attachmentSnapshot?.revenue != null || stored?.snapshot?.revenueLtm !== null || resolved?.snapshot.revenueLtm !== undefined) {
    providedInputs.add('baseRevenue');
  }

  const observedAttachmentEbitMargin = attachmentMarginNumerator(attachmentSnapshot, 'operatingIncome');
  const revenueGrowth =
    revenueGrowthInput !== undefined
      ? fadeGrowthSeries(revenueGrowthInput, Math.max(0.05, revenueGrowthInput * 0.4), DCF_DEFAULTS.years)
      : profile.dcfRevenueGrowth
        ? cloneArray(profile.dcfRevenueGrowth)
        : cloneArray(DCF_DEFAULTS.revenueGrowth);
  if (revenueGrowthInput === undefined) defaultsUsed.revenueGrowth = revenueGrowth;

  const ebitMargin =
    ebitMarginInput !== undefined
      ? Array.from({ length: DCF_DEFAULTS.years }, (_, index) => Number(Math.min(ebitMarginInput + index * 0.01, 0.4).toFixed(4)))
      : observedAttachmentEbitMargin !== null
        ? buildMarginSeriesFromObservedMargin(observedAttachmentEbitMargin, DCF_DEFAULTS.years)
      : profile.dcfEbitMargin
        ? cloneArray(profile.dcfEbitMargin)
        : cloneArray(DCF_DEFAULTS.ebitMargin);
  if (ebitMarginInput === undefined) defaultsUsed.ebitMargin = ebitMargin;
  if (observedAttachmentEbitMargin !== null) providedInputs.add('ebitMargin');

  const wacc = waccInput ?? DCF_DEFAULTS.wacc;
  if (waccInput === undefined) defaultsUsed.wacc = DCF_DEFAULTS.wacc;

  const terminalGrowth = terminalGrowthInput ?? DCF_DEFAULTS.terminalGrowth;
  if (terminalGrowthInput === undefined) defaultsUsed.terminalGrowth = DCF_DEFAULTS.terminalGrowth;

  const baseRevenue = baseRevenueInput ?? attachmentSnapshot?.revenue ?? stored?.snapshot?.revenueLtm ?? resolved?.snapshot.revenueLtm ?? DCF_DEFAULTS.baseRevenue;
  if (baseRevenueInput === undefined && attachmentSnapshot?.revenue == null && stored?.snapshot?.revenueLtm === null && resolved?.snapshot.revenueLtm === undefined) {
    defaultsUsed.baseRevenue = DCF_DEFAULTS.baseRevenue;
  }

  const cash = attachmentSnapshot?.cash ?? stored?.snapshot?.cash ?? resolved?.snapshot.cash ?? DCF_DEFAULTS.cash;
  const debt = attachmentSnapshot?.totalDebt ?? stored?.snapshot?.totalDebt ?? resolved?.snapshot.totalDebt ?? DCF_DEFAULTS.debt;
  const sharesOutstanding = attachmentSnapshot?.sharesOutstanding ?? stored?.snapshot?.sharesOutstanding ?? resolved?.snapshot.sharesOutstanding ?? DCF_DEFAULTS.sharesOutstanding;
  const sharePrice = stored?.latestPrice?.close ?? resolved?.snapshot.sharePrice ?? null;
  const marketCap = stored?.snapshot?.marketCap ?? resolved?.snapshot.marketCap ?? null;

  if (attachmentSnapshot?.cash == null && stored?.snapshot?.cash === null && (resolved?.snapshot.cash === undefined || resolved.snapshot.cash === null)) {
    defaultsUsed.cash = DCF_DEFAULTS.cash;
  }
  if (attachmentSnapshot?.totalDebt == null && stored?.snapshot?.totalDebt === null && (resolved?.snapshot.totalDebt === undefined || resolved.snapshot.totalDebt === null)) {
    defaultsUsed.debt = DCF_DEFAULTS.debt;
  }
  if (attachmentSnapshot?.sharesOutstanding == null && stored?.snapshot?.sharesOutstanding === null && (resolved?.snapshot.sharesOutstanding === undefined || resolved.snapshot.sharesOutstanding === null)) {
    defaultsUsed.sharesOutstanding = DCF_DEFAULTS.sharesOutstanding;
  }
  if (!parsedCompanyName && !attachmentSnapshot?.companyName && !stored?.company.name && !resolved?.snapshot.companyName && companyType) {
    defaultsUsed.companyName = companyName;
  }

  const missingInputs = buildMissingList([
    ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
    ['revenueGrowth', providedInputs.has('revenueGrowth')],
    ['ebitMargin', providedInputs.has('ebitMargin')],
    ['wacc', providedInputs.has('wacc')],
    ['terminalGrowth', providedInputs.has('terminalGrowth')],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('DCF', providedInputs);

  return {
    extractedInputs: {
      modelType: 'DCF',
      companyName,
      companyType: companyType ?? undefined,
      ticker: stored?.company.ticker ?? attachmentSnapshot?.ticker ?? resolved?.ticker,
      source:
        attachmentHasAnyFinancials(attachmentSnapshot)
          ? attachmentSnapshot?.source ?? 'attachment_pdf_statement'
          : stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      years: DCF_DEFAULTS.years,
      baseRevenue,
      cash,
      debt,
      sharesOutstanding,
      sharePrice,
      marketCap,
      revenueGrowth,
      ebitMargin,
      taxRate: DCF_DEFAULTS.taxRate,
      daPctRevenue: DCF_DEFAULTS.daPctRevenue,
      capexPctRevenue: DCF_DEFAULTS.capexPctRevenue,
      nwcPctRevenue: DCF_DEFAULTS.nwcPctRevenue,
      wacc,
      terminalGrowth,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source:
        attachmentHasAnyFinancials(attachmentSnapshot)
          ? attachmentSnapshot?.source ?? 'attachment_pdf_statement'
          : stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      asOfDate: attachmentSnapshot?.reportEndDate ?? stored?.snapshot?.asOfDate ?? resolved?.snapshot.updatedAt ?? null,
      lastSynced: stored?.snapshot?.createdAt ?? stored?.latestPrice?.createdAt ?? resolved?.snapshot.updatedAt ?? null,
    }),
  };
}

async function buildThreeStatementInputs(prompt: string, options: ExtractInputsOptions = {}): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {
    years: THREE_STATEMENT_DEFAULTS.years,
    taxRate: THREE_STATEMENT_DEFAULTS.taxRate,
    capexPctRevenue: THREE_STATEMENT_DEFAULTS.capexPctRevenue,
    daPctRevenue: THREE_STATEMENT_DEFAULTS.daPctRevenue,
  };

  const attachmentSnapshot = options.attachmentStatementSnapshot ?? null;
  const stored = await resolveStoredCompany(prompt);
  const resolved = await resolveDemoCompany(prompt, options);
  const storedSnapshot = stored?.snapshot ?? null;
  const demoSnapshot = resolved?.snapshot ?? null;
  const companyType =
    extractCompanyType(prompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    demoSnapshot?.sector ??
    null;
  if (companyType) providedInputs.add('companyType');
  const profile = getCompanyProfile(companyType);

  const parsedCompanyName = extractCompanyName(prompt);
  if (parsedCompanyName || attachmentSnapshot?.companyName || stored?.company.name || demoSnapshot?.companyName) providedInputs.add('companyName');
  const companyName =
    parsedCompanyName ||
    attachmentSnapshot?.companyName ||
    stored?.company.name ||
    demoSnapshot?.companyName ||
    deriveCompanyLabel(companyType, 'Demo Company');

  const baseRevenueInput = extractBaseRevenue(prompt);
  const growthInput = extractGrowthRate(prompt);
  const grossMarginInput = extractMargin(prompt, /gross\s+margin\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  const opexInput = extractMargin(prompt, /(?:opex|operating\s+expense(?:s)?)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);

  if (baseRevenueInput !== undefined || attachmentSnapshot?.revenue != null || storedSnapshot?.revenueLtm != null || demoSnapshot?.revenueLtm != null || companyType) {
    providedInputs.add('baseRevenue');
  }
  if (growthInput !== undefined) providedInputs.add('revenueGrowth');
  if (grossMarginInput !== undefined) providedInputs.add('grossMargin');
  if (opexInput !== undefined) providedInputs.add('opexPctRevenue');

  const baseRevenue =
    baseRevenueInput ??
    attachmentSnapshot?.revenue ??
    mergeSnapshotValue(storedSnapshot?.revenueLtm, demoSnapshot?.revenueLtm) ??
    THREE_STATEMENT_DEFAULTS.baseRevenue;
  if (attachmentSnapshot?.revenue == null && storedSnapshot?.revenueLtm == null && demoSnapshot?.revenueLtm == null && baseRevenueInput === undefined) {
    defaultsUsed.baseRevenue = THREE_STATEMENT_DEFAULTS.baseRevenue;
  }

  const revenueGrowth =
    growthInput !== undefined
      ? fadeGrowthSeries(growthInput, Math.max(0.05, growthInput * 0.45), THREE_STATEMENT_DEFAULTS.years)
      : profile.threeRevenueGrowth
        ? cloneArray(profile.threeRevenueGrowth)
        : cloneArray(THREE_STATEMENT_DEFAULTS.revenueGrowth);
  if (growthInput === undefined) defaultsUsed.revenueGrowth = revenueGrowth;

  const attachmentGrossMargin = attachmentMarginNumerator(attachmentSnapshot, 'grossProfit');
  const snapshotGrossMargin =
    storedSnapshot?.grossProfitLtm && storedSnapshot?.revenueLtm
      ? storedSnapshot.grossProfitLtm / storedSnapshot.revenueLtm
      : null;
  const grossMargin = grossMarginInput ?? attachmentGrossMargin ?? snapshotGrossMargin ?? profile.threeGrossMargin ?? THREE_STATEMENT_DEFAULTS.grossMargin;
  if (grossMarginInput === undefined) defaultsUsed.grossMargin = grossMargin;
  if (attachmentGrossMargin !== null) providedInputs.add('grossMargin');

  const attachmentOpexPctRevenue =
    attachmentSnapshot &&
    typeof attachmentSnapshot.revenue === 'number' &&
    attachmentSnapshot.revenue > 0 &&
    typeof attachmentSnapshot.grossProfit === 'number' &&
    typeof attachmentSnapshot.operatingIncome === 'number'
      ? (attachmentSnapshot.grossProfit - attachmentSnapshot.operatingIncome) / attachmentSnapshot.revenue
      : null;
  const opexPctRevenue = opexInput ?? attachmentOpexPctRevenue ?? profile.threeOpexPct ?? THREE_STATEMENT_DEFAULTS.opexPctRevenue;
  if (opexInput === undefined) defaultsUsed.opexPctRevenue = opexPctRevenue;
  if (attachmentOpexPctRevenue !== null) providedInputs.add('opexPctRevenue');

  const attachmentCapexPctRevenue =
    attachmentSnapshot &&
    typeof attachmentSnapshot.revenue === 'number' &&
    attachmentSnapshot.revenue > 0 &&
    typeof attachmentSnapshot.capex === 'number'
      ? attachmentSnapshot.capex / attachmentSnapshot.revenue
      : null;
  const attachmentDaPctRevenue =
    attachmentSnapshot &&
    typeof attachmentSnapshot.revenue === 'number' &&
    attachmentSnapshot.revenue > 0 &&
    typeof attachmentSnapshot.depreciationAndAmortization === 'number'
      ? attachmentSnapshot.depreciationAndAmortization / attachmentSnapshot.revenue
      : null;
  if (attachmentCapexPctRevenue !== null) delete defaultsUsed.capexPctRevenue;
  if (attachmentDaPctRevenue !== null) delete defaultsUsed.daPctRevenue;

  const debt = attachmentSnapshot?.totalDebt ?? mergeSnapshotValue(storedSnapshot?.totalDebt, demoSnapshot?.totalDebt) ?? THREE_STATEMENT_DEFAULTS.debt;
  const cash = attachmentSnapshot?.cash ?? mergeSnapshotValue(storedSnapshot?.cash, demoSnapshot?.cash) ?? THREE_STATEMENT_DEFAULTS.cash;
  if (attachmentSnapshot?.totalDebt == null && storedSnapshot?.totalDebt == null && demoSnapshot?.totalDebt == null) {
    defaultsUsed.debt = THREE_STATEMENT_DEFAULTS.debt;
  }
  if (attachmentSnapshot?.cash == null && storedSnapshot?.cash == null && demoSnapshot?.cash == null) {
    defaultsUsed.cash = THREE_STATEMENT_DEFAULTS.cash;
  }
  if (!parsedCompanyName && !attachmentSnapshot?.companyName && !stored?.company.name && !demoSnapshot?.companyName && companyType) {
    defaultsUsed.companyName = companyName;
  }

  const missingInputs = buildMissingList([
    ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
    ['baseRevenue or companyType', providedInputs.has('baseRevenue') || providedInputs.has('companyType')],
    ['revenueGrowth', providedInputs.has('revenueGrowth')],
    ['grossMargin', providedInputs.has('grossMargin')],
    ['opexPctRevenue', providedInputs.has('opexPctRevenue')],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('THREE_STATEMENT', providedInputs);

  return {
    extractedInputs: {
      modelType: 'THREE_STATEMENT',
      companyName,
      companyType: companyType ?? undefined,
      ticker: stored?.company.ticker ?? attachmentSnapshot?.ticker ?? resolved?.ticker,
      source:
        attachmentHasAnyFinancials(attachmentSnapshot)
          ? attachmentSnapshot?.source ?? 'attachment_pdf_statement'
          : storedSnapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      years: THREE_STATEMENT_DEFAULTS.years,
      baseRevenue,
      revenueGrowth,
      grossMargin,
      opexPctRevenue,
      taxRate: THREE_STATEMENT_DEFAULTS.taxRate,
      capexPctRevenue: attachmentCapexPctRevenue ?? THREE_STATEMENT_DEFAULTS.capexPctRevenue,
      daPctRevenue: attachmentDaPctRevenue ?? THREE_STATEMENT_DEFAULTS.daPctRevenue,
      debt,
      cash,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source:
        attachmentHasAnyFinancials(attachmentSnapshot)
          ? attachmentSnapshot?.source ?? 'attachment_pdf_statement'
          : stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      asOfDate: attachmentSnapshot?.reportEndDate ?? stored?.snapshot?.asOfDate ?? resolved?.snapshot.updatedAt ?? null,
      lastSynced: stored?.snapshot?.createdAt ?? stored?.latestPrice?.createdAt ?? resolved?.snapshot.updatedAt ?? null,
    }),
  };
}

async function buildCapTableInputs(prompt: string): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const raiseMatch =
    prompt.match(/(?:raising|raise|round)\s+\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i) ||
    prompt.match(/\$([\d.,]+(?:\.\d+)?\s*[kmb]?)\s*(?:raise|financing)/i);
  const preMoneyMatch =
    prompt.match(/\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)\s*pre-money/i) ||
    prompt.match(/pre-money valuation\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);
  const founderSharesMatch = prompt.match(/founder shares\s+(?:of\s+)?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);
  const optionPoolMatch = prompt.match(/option pool(?:\s+refresh)?\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);

  const roundType = extractRoundType(prompt) ?? CAP_TABLE_DEFAULTS.roundType;
  const raiseAmount = parseMoneyToken(raiseMatch?.[1]) ?? CAP_TABLE_DEFAULTS.raiseAmount;
  const preMoney = parseMoneyToken(preMoneyMatch?.[1]) ?? CAP_TABLE_DEFAULTS.preMoney;
  const founderShares = parseMoneyToken(founderSharesMatch?.[1]) ?? CAP_TABLE_DEFAULTS.founderShares;
  const optionPoolRefresh = parsePercentToken(optionPoolMatch?.[1]) ?? CAP_TABLE_DEFAULTS.optionPoolRefresh;

  if (extractRoundType(prompt)) providedInputs.add('roundType');
  if (raiseMatch) providedInputs.add('raiseAmount');
  if (preMoneyMatch) providedInputs.add('preMoney');
  if (founderSharesMatch) providedInputs.add('founderShares');
  if (optionPoolMatch) providedInputs.add('optionPoolRefresh');

  const defaultsUsed: Record<string, unknown> = {};
  if (!extractRoundType(prompt)) defaultsUsed.roundType = CAP_TABLE_DEFAULTS.roundType;
  if (!raiseMatch) defaultsUsed.raiseAmount = CAP_TABLE_DEFAULTS.raiseAmount;
  if (!preMoneyMatch) defaultsUsed.preMoney = CAP_TABLE_DEFAULTS.preMoney;
  if (!founderSharesMatch) defaultsUsed.founderShares = CAP_TABLE_DEFAULTS.founderShares;
  if (!optionPoolMatch) defaultsUsed.optionPoolRefresh = CAP_TABLE_DEFAULTS.optionPoolRefresh;

  const missingInputs = buildMissingList([
    ['roundType', providedInputs.has('roundType')],
    ['raiseAmount', providedInputs.has('raiseAmount')],
    ['preMoney', providedInputs.has('preMoney')],
    ['founderShares', providedInputs.has('founderShares')],
    ['optionPoolRefresh', providedInputs.has('optionPoolRefresh')],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('CAP_TABLE', providedInputs);

  return {
    extractedInputs: {
      modelType: 'CAP_TABLE',
      roundType,
      preMoney,
      raiseAmount,
      founderShares,
      optionPoolRefresh,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source: 'prompt_inputs',
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

async function buildCompsInputs(prompt: string, options: ExtractInputsOptions = {}): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const attachmentSnapshot = options.attachmentStatementSnapshot ?? null;
  const stored = await resolveStoredCompany(prompt);
  const resolved = stored?.snapshot ? null : await resolveDemoCompany(prompt, options);
  const storedSnapshot = stored?.snapshot ?? null;
  const demoSnapshot = resolved?.snapshot ?? null;
  const snapshots = await loadExpandedModelUniverseSnapshots(options);
  const subjectPrompt = sanitizeCompsSubjectPrompt(prompt);
  const explicitPeerTickers = extractExplicitPeerTickers(prompt, snapshots);
  const isComparePrompt = /\b(compare|comparison|versus|vs\.?|against)\b/i.test(prompt);
  const explicitSubjectTicker =
    isComparePrompt && explicitPeerTickers.length > 0
      ? explicitPeerTickers[0]
      : !stored?.company.ticker && !resolved?.ticker && explicitPeerTickers.length > 0
        ? explicitPeerTickers[0]
        : null;
  const explicitPeerUniverseTickers = explicitSubjectTicker ? explicitPeerTickers.slice(1) : explicitPeerTickers;
  const explicitSubjectSnapshot = explicitSubjectTicker ? snapshots[explicitSubjectTicker] ?? null : null;
  const subjectStoredSnapshot = explicitSubjectTicker ? null : stored?.snapshot ?? null;
  const subjectLatestPrice = explicitSubjectTicker ? null : stored?.latestPrice ?? null;
  const subjectResolvedSnapshot = explicitSubjectTicker ? explicitSubjectSnapshot : resolved?.snapshot ?? null;

  const companyType =
    extractCompanyType(subjectPrompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    explicitSubjectSnapshot?.sector ??
    demoSnapshot?.sector ??
    null;
  const parsedCompanyNameRaw = extractCompanyName(subjectPrompt) ?? extractCompanyName(prompt);
  const parsedCompanyName = isInstructionContaminatedName(parsedCompanyNameRaw) ? null : parsedCompanyNameRaw;
  const ticker = explicitSubjectTicker ?? stored?.company.ticker ?? attachmentSnapshot?.ticker ?? resolved?.ticker ?? undefined;
  const companyName =
    stored?.company.name ||
    attachmentSnapshot?.companyName ||
    explicitSubjectSnapshot?.companyName ||
    demoSnapshot?.companyName ||
    parsedCompanyName ||
    deriveCompanyLabel(companyType, 'Subject Company');
  const subjectSnapshot = buildMergedCompsSubjectSnapshot({
    ticker: ticker ?? 'SUBJECT',
    companyName,
    companyType,
    storedSnapshot: subjectStoredSnapshot,
    latestPrice: subjectLatestPrice,
    demoSnapshot: subjectResolvedSnapshot ?? (ticker ? snapshots[ticker] : undefined) ?? null,
  });
  const subjectMarketCap =
    subjectStoredSnapshot?.marketCap ??
    subjectSnapshot?.marketCap ??
    (subjectLatestPrice?.close && subjectStoredSnapshot?.sharesOutstanding
      ? subjectLatestPrice.close * subjectStoredSnapshot.sharesOutstanding
      : null);
  if (companyType) providedInputs.add('companyType');
  if (parsedCompanyName || attachmentSnapshot?.companyName || stored?.company.name || explicitSubjectSnapshot?.companyName || resolved?.snapshot.companyName) {
    providedInputs.add('companyName');
  }
  if (explicitPeerUniverseTickers.length > 0) providedInputs.add('peerSet');

  const peerUniverse =
    explicitPeerUniverseTickers.length > 0
      ? explicitPeerUniverseTickers
          .filter((peerTicker) => peerTicker !== ticker && snapshots[peerTicker])
          .map((peerTicker) => [peerTicker, snapshots[peerTicker]] as const)
      : pickRankedCompsPeers({
          snapshots,
          subjectTicker: ticker,
          subjectSector: stored?.company.sector ?? stored?.company.companyType ?? companyType ?? subjectSnapshot?.sector ?? null,
          subjectMarketCap,
          peerCount: COMPS_DEFAULTS.peerCount,
        });

  const subject: CompsPeerInputs = toPeerInputs(
    ticker ?? 'SUBJECT',
    subjectSnapshot
  );
  if (attachmentHasAnyFinancials(attachmentSnapshot)) {
    subject.revenue = attachmentSnapshot?.revenue ?? subject.revenue;
    subject.ebitda = attachmentSnapshot?.ebitda ?? subject.ebitda;
    subject.netIncome = attachmentSnapshot?.netIncome ?? subject.netIncome;
    subject.cash = attachmentSnapshot?.cash ?? subject.cash;
    subject.totalDebt = attachmentSnapshot?.totalDebt ?? subject.totalDebt;
    subject.sharesOutstanding = attachmentSnapshot?.sharesOutstanding ?? subject.sharesOutstanding;
  }

  const peerInputs = peerUniverse.map(([peerTicker, snapshot]) => toPeerInputs(peerTicker, snapshot));
  if (peerInputs.length === 0) {
    defaultsUsed.peerSet = explicitPeerUniverseTickers.length > 0 ? 'requested_peers_unavailable' : 'demo_peer_universe_unavailable';
  }
  defaultsUsed.valuationMultiples = COMPS_DEFAULTS.valuationMultiples;

  const missingInputs = buildMissingList([
    ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
    ['peerSet', peerInputs.length > 0],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('COMPS', providedInputs);

  return {
    extractedInputs: {
      modelType: 'COMPS',
      companyName,
      companyType: companyType ?? undefined,
      ticker,
      source:
        attachmentHasAnyFinancials(attachmentSnapshot)
          ? attachmentSnapshot?.source ?? 'attachment_pdf_statement'
          : subjectStoredSnapshot?.source ??
        (subjectResolvedSnapshot ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      peerSetLabel:
        explicitPeerUniverseTickers.length > 0
          ? `${peerInputs.length} requested peers`
          : companyType
            ? `${companyType} peers`
            : 'Selected peers',
      valuationMultiples: [...COMPS_DEFAULTS.valuationMultiples],
      selectedMultiples: undefined,
      subject,
      peers: peerInputs,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source:
        attachmentHasAnyFinancials(attachmentSnapshot)
          ? attachmentSnapshot?.source ?? 'attachment_pdf_statement'
          : subjectStoredSnapshot?.source ??
        (subjectResolvedSnapshot ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      asOfDate: attachmentSnapshot?.reportEndDate ?? subjectStoredSnapshot?.asOfDate ?? subjectResolvedSnapshot?.updatedAt ?? null,
      lastSynced: subjectStoredSnapshot?.createdAt ?? subjectLatestPrice?.createdAt ?? subjectResolvedSnapshot?.updatedAt ?? null,
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

function medianNumber(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentileNumber(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

async function buildFootballFieldInputs(prompt: string, options: ExtractInputsOptions = {}): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const attachmentSnapshot = options.attachmentStatementSnapshot ?? null;
  const stored = await resolveStoredCompany(prompt);
  const resolved = stored?.snapshot ? null : await resolveDemoCompany(prompt, options);
  const snapshots = await loadExpandedModelUniverseSnapshots(options);

  const companyType =
    extractCompanyType(prompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    resolved?.snapshot.sector ??
    null;
  const parsedCompanyName = extractCompanyName(prompt);
  const companyName =
    parsedCompanyName ||
    attachmentSnapshot?.companyName ||
    stored?.company.name ||
    resolved?.snapshot.companyName ||
    deriveCompanyLabel(companyType, 'Subject Company');
  const ticker = stored?.company.ticker ?? attachmentSnapshot?.ticker ?? resolved?.ticker;
  if (companyType) providedInputs.add('companyType');
  if (parsedCompanyName || attachmentSnapshot?.companyName || stored?.company.name || resolved?.snapshot.companyName) providedInputs.add('companyName');

  const subjectRevenue = attachmentSnapshot?.revenue ?? stored?.snapshot?.revenueLtm ?? resolved?.snapshot.revenueLtm ?? null;
  const subjectEbitda = attachmentSnapshot?.ebitda ?? stored?.snapshot?.ebitdaLtm ?? resolved?.snapshot.ebitdaLtm ?? null;
  const subjectCash = attachmentSnapshot?.cash ?? stored?.snapshot?.cash ?? resolved?.snapshot.cash ?? null;
  const subjectDebt = attachmentSnapshot?.totalDebt ?? stored?.snapshot?.totalDebt ?? resolved?.snapshot.totalDebt ?? null;
  const subjectNetDebt =
    subjectDebt !== null && subjectCash !== null
      ? subjectDebt - subjectCash
      : attachmentSnapshot?.totalDebt ?? stored?.snapshot?.totalDebt ?? resolved?.snapshot.totalDebt ?? null;
  const subjectPrice =
    stored?.latestPrice?.close ??
    (stored?.snapshot?.marketCap && stored?.snapshot?.sharesOutstanding
      ? stored.snapshot.marketCap / stored.snapshot.sharesOutstanding
      : null) ??
    resolved?.snapshot.sharePrice ??
    null;
  const subjectShares = attachmentSnapshot?.sharesOutstanding ?? stored?.snapshot?.sharesOutstanding ?? resolved?.snapshot.sharesOutstanding ?? null;

  if (subjectRevenue !== null) providedInputs.add('revenue');
  if (subjectEbitda !== null) providedInputs.add('ebitda');
  if (subjectPrice !== null) providedInputs.add('sharePrice');

  const peerUniverse = Object.entries(snapshots)
    .filter(([candidateTicker, snapshot]) => candidateTicker !== ticker && (!companyType || snapshot.sector === companyType))
    .sort(([, left], [, right]) => (right.marketCap ?? 0) - (left.marketCap ?? 0))
    .slice(0, FOOTBALL_FIELD_DEFAULTS.peerCount);

  const evRevenueValues: number[] = [];
  const evEbitdaValues: number[] = [];
  peerUniverse.forEach(([, snapshot]) => {
    const enterpriseValue = (snapshot.marketCap ?? 0) + (snapshot.totalDebt ?? 0) - (snapshot.cash ?? 0);
    if (enterpriseValue > 0 && (snapshot.revenueLtm ?? 0) > 0) {
      evRevenueValues.push(enterpriseValue / (snapshot.revenueLtm as number));
    }
    if (enterpriseValue > 0 && (snapshot.ebitdaLtm ?? 0) > 0) {
      evEbitdaValues.push(enterpriseValue / (snapshot.ebitdaLtm as number));
    }
  });

  const tradingRevenueLow = percentileNumber(evRevenueValues, 0.25);
  const tradingRevenueMid = medianNumber(evRevenueValues);
  const tradingRevenueHigh = percentileNumber(evRevenueValues, 0.75);
  const tradingEbitdaLow = percentileNumber(evEbitdaValues, 0.25);
  const tradingEbitdaMid = medianNumber(evEbitdaValues);
  const tradingEbitdaHigh = percentileNumber(evEbitdaValues, 0.75);

  const controlPremiumUplift = FOOTBALL_FIELD_DEFAULTS.controlPremiumUplift;
  defaultsUsed.controlPremiumUplift = controlPremiumUplift;
  defaultsUsed.peerCount = FOOTBALL_FIELD_DEFAULTS.peerCount;

  const makeRange = (
    label: string,
    basis: 'revenue' | 'ebitda',
    lowMultiple: number | null,
    midMultiple: number | null,
    highMultiple: number | null,
    driver: number | null,
    commentary: string
  ): FootballFieldRangeInputs => ({
    label,
    basis,
    lowMultiple,
    midMultiple,
    highMultiple,
    lowValue: lowMultiple !== null && driver !== null ? lowMultiple * driver : null,
    midValue: midMultiple !== null && driver !== null ? midMultiple * driver : null,
    highValue: highMultiple !== null && driver !== null ? highMultiple * driver : null,
    commentary,
  });

  const ranges: FootballFieldRangeInputs[] = [
    makeRange(
      'Trading Comps EV / Revenue',
      'revenue',
      tradingRevenueLow,
      tradingRevenueMid,
      tradingRevenueHigh,
      subjectRevenue,
      'Uses peer-trading quartiles to frame where the subject could trade on topline scale.'
    ),
    makeRange(
      'Trading Comps EV / EBITDA',
      'ebitda',
      tradingEbitdaLow,
      tradingEbitdaMid,
      tradingEbitdaHigh,
      subjectEbitda,
      'Uses peer-trading quartiles to frame where the subject could trade on operating earnings.'
    ),
    makeRange(
      'Precedents EV / Revenue',
      'revenue',
      tradingRevenueLow !== null ? tradingRevenueLow * (1 + controlPremiumUplift) : null,
      tradingRevenueMid !== null ? tradingRevenueMid * (1 + controlPremiumUplift) : null,
      tradingRevenueHigh !== null ? tradingRevenueHigh * (1 + controlPremiumUplift) : null,
      subjectRevenue,
      'Applies a control-premium uplift to trading revenue ranges to approximate transaction framing.'
    ),
    makeRange(
      'Precedents EV / EBITDA',
      'ebitda',
      tradingEbitdaLow !== null ? tradingEbitdaLow * (1 + controlPremiumUplift) : null,
      tradingEbitdaMid !== null ? tradingEbitdaMid * (1 + controlPremiumUplift) : null,
      tradingEbitdaHigh !== null ? tradingEbitdaHigh * (1 + controlPremiumUplift) : null,
      subjectEbitda,
      'Applies a control-premium uplift to trading EBITDA ranges to approximate sponsor / strategic transaction framing.'
    ),
  ];

  const missingInputs = buildMissingList([
    ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
    ['revenue or EBITDA anchors', subjectRevenue !== null || subjectEbitda !== null],
    ['valuation range set', ranges.some((range) => range.midValue !== null)],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('FOOTBALL_FIELD', providedInputs);

  return {
    extractedInputs: {
      modelType: 'FOOTBALL_FIELD',
      companyName,
      companyType: companyType ?? undefined,
      ticker,
      source: 'demo_football_field_framework',
      sharePrice: subjectPrice,
      sharesOutstanding: subjectShares,
      netDebt: subjectNetDebt,
      revenue: subjectRevenue,
      ebitda: subjectEbitda,
      peerSetLabel: `${peerUniverse.length} selected peers`,
      ranges,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source: 'demo_football_field_framework',
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

async function buildDebtCapacityLiteInputs(prompt: string, options: ExtractInputsOptions = {}): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const parsedCompanyName = extractCompanyName(prompt);
  const resolutionPrompt = parsedCompanyName ?? prompt;
  const stored = await resolveStoredCompany(resolutionPrompt);
  const resolved =
    stored?.snapshot
      ? null
      : (await resolveDemoCompany(resolutionPrompt, options)) ??
        (resolutionPrompt === prompt ? null : await resolveDemoCompany(prompt, options));

  const companyType =
    extractCompanyType(prompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    resolved?.snapshot.sector ??
    null;
  const companyName =
    parsedCompanyName || stored?.company.name || resolved?.snapshot.companyName || deriveCompanyLabel(companyType, 'Credit Subject');
  const ticker = stored?.company.ticker ?? resolved?.ticker;

  if (companyType) providedInputs.add('companyType');
  if (parsedCompanyName || stored?.company.name || resolved?.snapshot.companyName) providedInputs.add('companyName');

  const ebitda = stored?.snapshot?.ebitdaLtm ?? resolved?.snapshot.ebitdaLtm ?? null;
  const currentNetDebt =
    (stored?.snapshot?.totalDebt ?? resolved?.snapshot.totalDebt ?? 0) - (stored?.snapshot?.cash ?? resolved?.snapshot.cash ?? 0);
  if (ebitda !== null) providedInputs.add('ebitda');

  const maxLeverageInput =
    extractMultiple(prompt, /max leverage\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*x?/i) ??
    extractMultiple(prompt, /(\d+(?:\.\d+)?)\s*x\s*(?:max )?leverage/i);
  const minCoverageInput =
    extractMultiple(prompt, /min(?:imum)? interest coverage\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*x?/i) ??
    extractMultiple(prompt, /(\d+(?:\.\d+)?)\s*x\s*(?:minimum )?interest coverage/i);
  const interestRateInput = extractMargin(prompt, /interest rate\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);

  const maxLeverage = maxLeverageInput ?? DEBT_CAPACITY_LITE_DEFAULTS.maxLeverage;
  const minInterestCoverage = minCoverageInput ?? DEBT_CAPACITY_LITE_DEFAULTS.minInterestCoverage;
  const interestRate = interestRateInput ?? DEBT_CAPACITY_LITE_DEFAULTS.interestRate;

  if (maxLeverageInput !== undefined) providedInputs.add('maxLeverage');
  else defaultsUsed.maxLeverage = DEBT_CAPACITY_LITE_DEFAULTS.maxLeverage;
  if (minCoverageInput !== undefined) providedInputs.add('minInterestCoverage');
  else defaultsUsed.minInterestCoverage = DEBT_CAPACITY_LITE_DEFAULTS.minInterestCoverage;
  if (interestRateInput !== undefined) providedInputs.add('interestRate');
  else defaultsUsed.interestRate = DEBT_CAPACITY_LITE_DEFAULTS.interestRate;

  const missingInputs = buildMissingList([
    ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
    ['EBITDA anchor', ebitda !== null],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('DEBT_CAPACITY_LITE', providedInputs);

  return {
    extractedInputs: {
      modelType: 'DEBT_CAPACITY_LITE',
      companyName,
      companyType: companyType ?? undefined,
      ticker,
      source: stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      ebitda,
      currentNetDebt: Number.isFinite(currentNetDebt) ? currentNetDebt : null,
      maxLeverage,
      minInterestCoverage,
      interestRate,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source: stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      asOfDate: stored?.snapshot?.asOfDate ?? resolved?.snapshot.updatedAt ?? null,
      lastSynced: stored?.snapshot?.createdAt ?? stored?.latestPrice?.createdAt ?? resolved?.snapshot.updatedAt ?? null,
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

async function buildMergerInputs(prompt: string, options: ExtractInputsOptions = {}): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const snapshots = await loadExpandedModelUniverseSnapshots(options);
  const toModelMoney = (value: number | undefined): number | undefined =>
    value !== undefined ? Number((value / 1_000_000).toFixed(2)) : undefined;
  const { acquirerRaw, targetRaw } = extractMergerEntities(prompt);
  const acquirer = await resolveMergerParty(acquirerRaw, snapshots);
  const target = await resolveMergerParty(targetRaw, snapshots);

  if (acquirer?.ticker) providedInputs.add('acquirerTicker');
  if (target?.ticker) providedInputs.add('targetTicker');

  const purchasePriceInput = toModelMoney(extractDealValue(prompt));
  const cashPctInput = extractMargin(prompt, /(\d+(?:\.\d+)?)\s*%\s*cash/i);
  const stockPctInput = extractMargin(prompt, /(\d+(?:\.\d+)?)\s*%\s*stock/i);
  const debtPctInput = extractMargin(prompt, /(\d+(?:\.\d+)?)\s*%\s*debt/i);
  const newDebtInput = toModelMoney(
    parseMoneyToken(prompt.match(/new debt\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i)?.[1]) ?? undefined
  );
  const newDebtRateInput = extractMargin(prompt, /new debt(?:\s+rate)?\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  const synergyInput = toModelMoney(
    parseMoneyToken(prompt.match(/(?:synergies|cost savings)\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i)?.[1]) ??
      undefined
  );
  const oneTimeCostsInput = toModelMoney(
    parseMoneyToken(prompt.match(/(?:one[- ]time costs|integration costs)\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i)?.[1]) ??
      undefined
  );

  const purchasePrice = purchasePriceInput ?? null;
  if (purchasePrice !== null) providedInputs.add('purchasePrice');

  let cashPct = cashPctInput;
  let stockPct = stockPctInput;
  let debtPct = debtPctInput;

  if (cashPct === undefined && stockPct === undefined && debtPct === undefined) {
    if (/\ball[-\s]?cash\b/i.test(prompt)) {
      cashPct = 1;
      stockPct = 0;
      debtPct = 0;
    } else if (/\ball[-\s]?stock\b/i.test(prompt)) {
      cashPct = 0;
      stockPct = 1;
      debtPct = 0;
    }
  }

  if (cashPct === undefined) {
    cashPct = MERGER_DEFAULTS.cashPct;
    defaultsUsed.cashPct = MERGER_DEFAULTS.cashPct;
  } else {
    providedInputs.add('cashPct');
  }
  if (stockPct === undefined) {
    stockPct = MERGER_DEFAULTS.stockPct;
    defaultsUsed.stockPct = MERGER_DEFAULTS.stockPct;
  } else {
    providedInputs.add('stockPct');
  }
  if (debtPct === undefined) {
    debtPct = MERGER_DEFAULTS.debtPct;
    defaultsUsed.debtPct = MERGER_DEFAULTS.debtPct;
  } else {
    providedInputs.add('debtPct');
  }

  const totalMix = cashPct + stockPct + debtPct;
  if (totalMix > 0 && Math.abs(totalMix - 1) > 0.0001) {
    cashPct = cashPct / totalMix;
    stockPct = stockPct / totalMix;
    debtPct = debtPct / totalMix;
  }

  const dealStructure =
    stockPct >= 0.999 ? 'stock' : cashPct >= 0.999 && debtPct < 0.001 ? 'cash' : 'mixed';
  const newDebt = newDebtInput ?? 0;
  const newDebtRate = newDebtRateInput ?? MERGER_DEFAULTS.newDebtRate;
  const synergies = synergyInput ?? MERGER_DEFAULTS.synergies;
  const oneTimeCosts = oneTimeCostsInput ?? MERGER_DEFAULTS.oneTimeCosts;

  if (newDebtInput !== undefined) providedInputs.add('newDebt');
  else defaultsUsed.newDebt = 0;
  if (newDebtRateInput !== undefined) providedInputs.add('newDebtRate');
  else defaultsUsed.newDebtRate = MERGER_DEFAULTS.newDebtRate;
  if (synergyInput !== undefined) providedInputs.add('synergies');
  else defaultsUsed.synergies = MERGER_DEFAULTS.synergies;
  if (oneTimeCostsInput !== undefined) providedInputs.add('oneTimeCosts');
  else defaultsUsed.oneTimeCosts = MERGER_DEFAULTS.oneTimeCosts;

  defaultsUsed.forecastYears = MERGER_DEFAULTS.forecastYears;
  defaultsUsed.taxRate = MERGER_DEFAULTS.taxRate;

  const companyName = [acquirer?.companyName, target?.companyName].filter(Boolean).join(' / ') || 'Merger Model';
  const ticker = [acquirer?.ticker, target?.ticker].filter(Boolean).join('/') || undefined;
  const source = [acquirer?.source, target?.source].filter(Boolean).join('+') || 'demo_merger_framework';
  const fallbackUsed = Object.keys(defaultsUsed);

  const missingInputs = buildMissingList([
    ['acquirer', Boolean(acquirer?.ticker)],
    ['target', Boolean(target?.ticker)],
    ['purchase price', purchasePrice !== null],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('MERGER', providedInputs);

  return {
    extractedInputs: {
      modelType: 'MERGER',
      companyName,
      ticker,
      source,
      acquirerTicker: acquirer?.ticker ?? null,
      acquirerName: acquirer?.companyName ?? acquirerRaw ?? 'Acquirer',
      acquirerRevenue: acquirer?.revenue ?? null,
      acquirerEbitda: acquirer?.ebitda ?? null,
      acquirerEbit: acquirer?.ebit ?? null,
      acquirerNetIncome: acquirer?.netIncome ?? null,
      acquirerShares: acquirer?.sharesOutstanding ?? null,
      acquirerMarketCap: acquirer?.marketCap ?? null,
      acquirerPrice: acquirer?.sharePrice ?? null,
      targetTicker: target?.ticker ?? null,
      targetName: target?.companyName ?? targetRaw ?? 'Target',
      targetRevenue: target?.revenue ?? null,
      targetEbitda: target?.ebitda ?? null,
      targetEbit: target?.ebit ?? null,
      targetNetIncome: target?.netIncome ?? null,
      targetShares: target?.sharesOutstanding ?? null,
      targetMarketCap: target?.marketCap ?? null,
      targetPrice: target?.sharePrice ?? null,
      purchasePrice,
      dealStructure,
      cashPct,
      stockPct,
      debtPct,
      forecastYears: MERGER_DEFAULTS.forecastYears,
      newDebt,
      newDebtRate,
      synergies,
      oneTimeCosts,
      taxRate: MERGER_DEFAULTS.taxRate,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source,
      asOfDate: acquirer?.asOfDate ?? target?.asOfDate ?? null,
      lastSynced: acquirer?.lastSynced ?? target?.lastSynced ?? null,
      fallbackUsed,
    }),
  };
}

async function buildPrecedentsInputs(prompt: string, options: ExtractInputsOptions = {}): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const stored = await resolveStoredCompany(prompt);
  const resolved = stored?.snapshot ? null : await resolveDemoCompany(prompt, options);
  const snapshots = await loadExpandedModelUniverseSnapshots(options);

  const companyType =
    extractCompanyType(prompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    resolved?.snapshot.sector ??
    null;
  const parsedCompanyName = extractCompanyName(prompt);
  const companyName = parsedCompanyName || stored?.company.name || resolved?.snapshot.companyName || deriveCompanyLabel(companyType, 'Subject Company');
  const ticker = stored?.company.ticker ?? resolved?.ticker;
  if (companyType) providedInputs.add('companyType');
  if (parsedCompanyName || stored?.company.name || resolved?.snapshot.companyName) providedInputs.add('companyName');

  defaultsUsed.transactionCount = PRECEDENTS_DEFAULTS.transactionCount;
  defaultsUsed.revenueMultiple = PRECEDENTS_DEFAULTS.revenueMultiple;
  defaultsUsed.ebitdaMultiple = PRECEDENTS_DEFAULTS.ebitdaMultiple;

  const peerUniverse = Object.entries(snapshots)
    .filter(([candidateTicker, snapshot]) => candidateTicker !== ticker && (!companyType || snapshot.sector === companyType))
    .sort(([, left], [, right]) => (right.marketCap ?? 0) - (left.marketCap ?? 0))
    .slice(0, PRECEDENTS_DEFAULTS.transactionCount);

  const transactions: PrecedentTransactionInputs[] = peerUniverse.map(([peerTicker, snapshot], index) => {
    const enterpriseValue = (snapshot.marketCap ?? 0) + (snapshot.totalDebt ?? 0) - (snapshot.cash ?? 0);
    return {
      transaction: `${snapshot.companyName || peerTicker} strategic sale`,
      target: snapshot.companyName || peerTicker,
      acquirer: ['Strategic buyer', 'Sponsor buyer', 'Infrastructure buyer', 'Global platform', 'Financial sponsor'][index % 5],
      announcementYear: new Date().getFullYear() - (index % 3),
      enterpriseValue: enterpriseValue > 0 ? enterpriseValue : (snapshot.marketCap ?? 0),
      revenueMultiple: PRECEDENTS_DEFAULTS.revenueMultiple + index * 0.4,
      ebitdaMultiple: PRECEDENTS_DEFAULTS.ebitdaMultiple + index * 0.6,
      premium: 0.18 + index * 0.02,
    };
  });

  const missingInputs = buildMissingList([
    ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
    ['transactionSet', transactions.length > 0],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('PRECEDENTS', providedInputs);

  return {
    extractedInputs: {
      modelType: 'PRECEDENTS',
      companyName,
      companyType: companyType ?? undefined,
      ticker,
      source: transactions.length > 0 ? 'demo_precedents_framework' : 'company_type_defaults',
      subjectRevenue: stored?.snapshot?.revenueLtm ?? resolved?.snapshot.revenueLtm ?? null,
      subjectEbitda: stored?.snapshot?.ebitdaLtm ?? resolved?.snapshot.ebitdaLtm ?? null,
      transactions,
      transactionCount: transactions.length,
      revenueMultiple: PRECEDENTS_DEFAULTS.revenueMultiple,
      ebitdaMultiple: PRECEDENTS_DEFAULTS.ebitdaMultiple,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source: transactions.length > 0 ? 'demo_precedents_framework' : 'company_type_defaults',
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

async function buildLboInputs(prompt: string, options: ExtractInputsOptions = {}): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const attachmentSnapshot = options.attachmentStatementSnapshot ?? null;
  const stored = await resolveStoredCompany(prompt);
  const resolved = stored?.snapshot ? null : await resolveDemoCompany(prompt, options);

  const companyType =
    extractCompanyType(prompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    resolved?.snapshot.sector ??
    null;
  const parsedCompanyName = extractCompanyName(prompt);
  const companyName =
    parsedCompanyName || attachmentSnapshot?.companyName || stored?.company.name || resolved?.snapshot.companyName || deriveCompanyLabel(companyType, 'Target Company');
  const ticker = stored?.company.ticker ?? attachmentSnapshot?.ticker ?? resolved?.ticker;
  if (companyType) providedInputs.add('companyType');
  if (parsedCompanyName || stored?.company.name || resolved?.snapshot.companyName) providedInputs.add('companyName');

  const revenueInput = extractBaseRevenue(prompt);
  const ebitdaMarginInput = extractMargin(prompt, /(?:ebitda)\s+margin\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  const growthInput = extractGrowthRate(prompt);
  const entryMultipleInput = extractMultiple(prompt, /entry\s+multiple\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*x?/i) ?? extractMultiple(prompt, /(\d+(?:\.\d+)?)\s*x\s*entry/i);
  const exitMultipleInput = extractMultiple(prompt, /exit\s+multiple\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*x?/i) ?? extractMultiple(prompt, /(\d+(?:\.\d+)?)\s*x\s*exit/i);
  const debtPercentInput = extractMargin(prompt, /(\d+(?:\.\d+)?)\s*%\s*debt/i);
  const holdingPeriodInput = extractHoldingPeriodYears(prompt);

  const revenue = revenueInput ?? attachmentSnapshot?.revenue ?? stored?.snapshot?.revenueLtm ?? resolved?.snapshot.revenueLtm ?? LBO_DEFAULTS.revenue;
  if (attachmentSnapshot?.revenue != null || stored?.snapshot?.revenueLtm != null || resolved?.snapshot.revenueLtm != null || revenueInput != null) providedInputs.add('revenue');
  else defaultsUsed.revenue = LBO_DEFAULTS.revenue;

  const ebitda =
    attachmentSnapshot?.ebitda ??
    stored?.snapshot?.ebitdaLtm ??
    resolved?.snapshot.ebitdaLtm ??
    (revenue * (ebitdaMarginInput ?? LBO_DEFAULTS.ebitdaMargin));
  if (attachmentSnapshot?.ebitda != null || stored?.snapshot?.ebitdaLtm != null || resolved?.snapshot.ebitdaLtm != null || ebitdaMarginInput != null) providedInputs.add('ebitda');
  else defaultsUsed.ebitda = ebitda;

  const entryMultiple = entryMultipleInput ?? LBO_DEFAULTS.entryMultiple;
  const exitMultiple = exitMultipleInput ?? LBO_DEFAULTS.exitMultiple;
  const debtPercent = debtPercentInput ?? LBO_DEFAULTS.debtPercent;
  const equityPercent = Number((1 - debtPercent).toFixed(4));
  const revenueGrowth =
    growthInput !== undefined
      ? fadeGrowthSeries(growthInput, Math.max(0.03, growthInput * 0.5), LBO_DEFAULTS.years)
      : cloneArray(LBO_DEFAULTS.revenueGrowth);
  const ebitdaMargin =
    ebitdaMarginInput ??
    (revenue > 0 && ebitda > 0 ? Number((ebitda / revenue).toFixed(4)) : LBO_DEFAULTS.ebitdaMargin);
  const holdingPeriodYears = holdingPeriodInput ?? LBO_DEFAULTS.holdingPeriodYears;
  const netDebt =
    (attachmentSnapshot?.totalDebt ?? stored?.snapshot?.totalDebt ?? resolved?.snapshot.totalDebt ?? 0) -
    (attachmentSnapshot?.cash ?? stored?.snapshot?.cash ?? resolved?.snapshot.cash ?? 0);

  if (entryMultipleInput !== undefined) providedInputs.add('entryMultiple');
  else defaultsUsed.entryMultiple = LBO_DEFAULTS.entryMultiple;
  if (exitMultipleInput !== undefined) providedInputs.add('exitMultiple');
  else defaultsUsed.exitMultiple = LBO_DEFAULTS.exitMultiple;
  if (debtPercentInput !== undefined) providedInputs.add('debtPercent');
  else defaultsUsed.debtPercent = LBO_DEFAULTS.debtPercent;
  if (growthInput !== undefined) providedInputs.add('revenueGrowth');
  else defaultsUsed.revenueGrowth = revenueGrowth;
  if (holdingPeriodInput !== undefined) providedInputs.add('holdingPeriodYears');
  else defaultsUsed.holdingPeriodYears = LBO_DEFAULTS.holdingPeriodYears;

  const missingInputs = buildMissingList([
    ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
    ['revenue', providedInputs.has('revenue')],
    ['ebitda', providedInputs.has('ebitda')],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('LBO', providedInputs);

  return {
    extractedInputs: {
      modelType: 'LBO',
      companyName,
      companyType: companyType ?? undefined,
      ticker,
      source:
        attachmentHasAnyFinancials(attachmentSnapshot)
          ? attachmentSnapshot?.source ?? 'attachment_pdf_statement'
          : stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      revenue,
      ebitda,
      netDebt,
      entryMultiple,
      exitMultiple,
      debtPercent,
      equityPercent,
      interestRate: LBO_DEFAULTS.interestRate,
      amortizationPercent: LBO_DEFAULTS.amortizationPercent,
      cashSweepPercent: LBO_DEFAULTS.cashSweepPercent,
      revenueGrowth,
      ebitdaMargin,
      capexPctRevenue: LBO_DEFAULTS.capexPctRevenue,
      deltaNwcPctRevenue: LBO_DEFAULTS.deltaNwcPctRevenue,
      taxRate: LBO_DEFAULTS.taxRate,
      holdingPeriodYears,
      sharesOutstanding: attachmentSnapshot?.sharesOutstanding ?? stored?.snapshot?.sharesOutstanding ?? resolved?.snapshot.sharesOutstanding ?? null,
      sharePrice: stored?.latestPrice?.close ?? resolved?.snapshot.sharePrice ?? null,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source:
        attachmentHasAnyFinancials(attachmentSnapshot)
          ? attachmentSnapshot?.source ?? 'attachment_pdf_statement'
          : stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      asOfDate: attachmentSnapshot?.reportEndDate ?? stored?.snapshot?.asOfDate ?? resolved?.snapshot.updatedAt ?? null,
      lastSynced: stored?.snapshot?.createdAt ?? stored?.latestPrice?.createdAt ?? resolved?.snapshot.updatedAt ?? null,
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

async function buildSaasInputs(prompt: string): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const stored = await resolveStoredCompany(prompt);
  const companyName = extractCompanyName(prompt);
  const companyType = extractCompanyType(prompt) ?? stored?.company.companyType ?? (stored?.company.isSaas ? 'SaaS' : null) ?? 'SaaS';
  const companyScale = extractCompanyScale(prompt);
  const scaleProfile = getScaleProfile(companyScale);

  if (companyName) providedInputs.add('companyName');
  if (extractCompanyType(prompt)) providedInputs.add('companyType');
  if (companyScale) providedInputs.add('companyScale');

  const growthInput = extractGrowthRate(prompt);
  const arrMatch =
    prompt.match(/starting arr\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i) ||
    prompt.match(/arr\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);
  const churnInput = extractMargin(prompt, /churn\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  const grossMarginInput = extractMargin(prompt, /gross\s+margin\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  const cacMatch = prompt.match(/cac\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);
  const arpuMatch = prompt.match(/arpu\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);

  const startingArrInput = parseMoneyToken(arrMatch?.[1]);
  if (startingArrInput !== undefined) providedInputs.add('startingArr');
  if (growthInput !== undefined) providedInputs.add('growthRate');
  if (churnInput !== undefined) providedInputs.add('churn');
  if (grossMarginInput !== undefined) providedInputs.add('grossMargin');
  if (cacMatch) providedInputs.add('cac');
  if (arpuMatch) providedInputs.add('arpu');

  const profile = getCompanyProfile(companyType);
  const latestKpi = stored?.kpis?.[0] ?? null;
  const startingArr = startingArrInput ?? latestKpi?.arr ?? scaleProfile?.startingArr ?? SAAS_OPERATING_DEFAULTS.startingArr;
  const growthRate = growthInput ?? profile.saasGrowthRate ?? scaleProfile?.growthRate ?? SAAS_OPERATING_DEFAULTS.growthRate;
  const grossMargin = grossMarginInput ?? latestKpi?.grossMargin ?? profile.saasGrossMargin ?? SAAS_OPERATING_DEFAULTS.grossMargin;
  const churn = churnInput ?? profile.saasChurn ?? scaleProfile?.churn ?? SAAS_OPERATING_DEFAULTS.churn;
  const cac = parseMoneyToken(cacMatch?.[1]) ?? profile.saasCac ?? scaleProfile?.cac ?? SAAS_OPERATING_DEFAULTS.cac;
  const arpu = parseMoneyToken(arpuMatch?.[1]) ?? latestKpi?.arpu ?? profile.saasArpu ?? scaleProfile?.arpu ?? SAAS_OPERATING_DEFAULTS.arpu;
  const resolvedCompanyName = companyName ?? stored?.company.name ?? (companyScale ? `${companyScale} ${companyType} Co.` : SAAS_OPERATING_DEFAULTS.companyName);

  const defaultsUsed: Record<string, unknown> = {
    years: SAAS_OPERATING_DEFAULTS.years,
  };
  if (startingArrInput === undefined) defaultsUsed.startingArr = startingArr;
  if (growthInput === undefined) defaultsUsed.growthRate = growthRate;
  if (grossMarginInput === undefined) defaultsUsed.grossMargin = grossMargin;
  if (churnInput === undefined) defaultsUsed.churn = churn;
  if (!cacMatch) defaultsUsed.cac = cac;
  if (!arpuMatch) defaultsUsed.arpu = arpu;
  if (!companyName) defaultsUsed.companyName = resolvedCompanyName;

  const missingInputs = buildMissingList([
    ['startingArr or companyScale', providedInputs.has('startingArr') || providedInputs.has('companyScale') || providedInputs.has('companyType')],
    ['growthRate', providedInputs.has('growthRate')],
    ['grossMargin', providedInputs.has('grossMargin')],
    ['churn', providedInputs.has('churn')],
    ['cac', providedInputs.has('cac')],
    ['arpu', providedInputs.has('arpu')],
  ]);
  const missingCriticalInputs = evaluateCriticalInputs('SAAS_OPERATING_MODEL', providedInputs);

  return {
    extractedInputs: {
      modelType: 'SAAS_OPERATING_MODEL',
      companyName: resolvedCompanyName,
      companyType,
      companyScale: companyScale ?? undefined,
      years: SAAS_OPERATING_DEFAULTS.years,
      source: latestKpi ? latestKpi.source : providedInputs.has('companyScale') || providedInputs.has('companyType') ? 'company_profile_defaults' : 'demo_defaults',
      startingArr,
      growthRate,
      grossMargin,
      churn,
      cac,
      arpu,
    },
    defaultsUsed,
    missingInputs,
    missingCriticalInputs,
    provenanceSummary: buildProvenanceSummary({
      source: latestKpi ? latestKpi.source : providedInputs.has('companyScale') || providedInputs.has('companyType') ? 'company_profile_defaults' : 'demo_defaults',
      asOfDate: latestKpi?.asOfDate ?? stored?.snapshot?.asOfDate ?? null,
      lastSynced: stored?.snapshot?.createdAt ?? stored?.latestPrice?.createdAt ?? null,
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}
