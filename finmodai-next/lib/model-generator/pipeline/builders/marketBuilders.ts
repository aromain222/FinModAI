import { FOOTBALL_FIELD_DEFAULTS, PRECEDENTS_DEFAULTS } from '@/lib/model-generator/defaults';
import type {
  ExtractInputsOptions,
  ExtractInputsResult,
  FootballFieldRangeInputs,
  PrecedentTransactionInputs,
} from '@/lib/model-generator/extractInputs';
import type { DemoCompanySnapshot } from '@/lib/demo/demoSnapshotStore';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';

type MarketBuilderDeps = {
  buildMissingList: (fields: Array<[key: string, isProvided: boolean]>) => string[];
  buildProvenanceSummary: (params: {
    source: string;
    asOfDate?: string | null;
    lastSynced?: string | null;
    fallbackUsed?: string[];
  }) => ExtractInputsResult['provenanceSummary'];
  deriveCompanyLabel: (companyType: string | null, fallback: string) => string;
  evaluateCriticalInputs: (modelType: ModelGeneratorType, providedInputs: Iterable<string>) => string[];
  extractCompanyName: (prompt: string) => string | null;
  extractCompanyType: (prompt: string) => string | null;
  loadExpandedModelUniverseSnapshots: (
    options?: ExtractInputsOptions,
  ) => Promise<Record<string, DemoCompanySnapshot>>;
  resolveDemoCompany: (
    prompt: string,
    options?: ExtractInputsOptions,
  ) => Promise<{ ticker: string; snapshot: DemoCompanySnapshot } | null>;
  resolveStoredCompany: (
    prompt: string,
  ) => Promise<{
    company: {
      name: string;
      ticker?: string | null;
      companyType?: string | null;
      sector?: string | null;
    };
    snapshot?: {
      source?: string | null;
      createdAt?: string | null;
      asOfDate?: string | null;
      revenueLtm?: number | null;
      ebitdaLtm?: number | null;
      sharesOutstanding?: number | null;
      cash?: number | null;
      totalDebt?: number | null;
      marketCap?: number | null;
    } | null;
    latestPrice?: { close?: number | null; createdAt?: string | null } | null;
  } | null>;
};

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

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasOrderedTriplet(low: number | null, mid: number | null, high: number | null): low is number {
  return isFiniteNumber(low) && isFiniteNumber(mid) && isFiniteNumber(high) && low < mid && mid < high;
}

function normalizeFootballFieldTriplet(
  low: number | null,
  mid: number | null,
  high: number | null,
  floorPct: number
): { low: number | null; mid: number | null; high: number | null; floorApplied: boolean } {
  const center =
    (isFiniteNumber(mid) ? mid : null) ??
    (isFiniteNumber(low) && isFiniteNumber(high) ? (low + high) / 2 : null) ??
    (isFiniteNumber(low) ? low : null) ??
    (isFiniteNumber(high) ? high : null);

  if (!isFiniteNumber(center) || center <= 0) {
    return { low: null, mid: null, high: null, floorApplied: false };
  }

  const rawMin =
    (isFiniteNumber(low) ? low : null) ??
    (isFiniteNumber(mid) ? mid : null) ??
    (isFiniteNumber(high) ? high : null) ??
    center;
  const rawMax =
    (isFiniteNumber(high) ? high : null) ??
    (isFiniteNumber(mid) ? mid : null) ??
    (isFiniteNumber(low) ? low : null) ??
    center;
  const relativeSpread = Math.max(rawMax - rawMin, 0) / Math.max(Math.abs(center), 1);
  const minimumRelativeSpread = floorPct * 2;

  if (hasOrderedTriplet(low, mid, high) && relativeSpread >= minimumRelativeSpread) {
    return { low, mid, high, floorApplied: false };
  }

  const normalizedLow = center * (1 - floorPct);
  const normalizedHigh = center * (1 + floorPct);
  if (!hasOrderedTriplet(normalizedLow, center, normalizedHigh)) {
    return { low: null, mid: null, high: null, floorApplied: true };
  }

  return {
    low: normalizedLow,
    mid: center,
    high: normalizedHigh,
    floorApplied: true,
  };
}

export async function buildFootballFieldInputs(
  prompt: string,
  options: ExtractInputsOptions,
  deps: MarketBuilderDeps,
): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const attachmentSnapshot = options.attachmentStatementSnapshot ?? null;
  const extractionInputs =
    options.financialExtractionSnapshot?.validationState === 'blocking_error'
      ? null
      : options.financialExtractionSnapshot?.mappedModelInputs ?? null;
  const stored = await deps.resolveStoredCompany(prompt);
  const resolved = stored?.snapshot ? null : await deps.resolveDemoCompany(prompt, options);
  const snapshots = await deps.loadExpandedModelUniverseSnapshots(options);

  const companyType =
    deps.extractCompanyType(prompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    resolved?.snapshot.sector ??
    null;
  const parsedCompanyName = deps.extractCompanyName(prompt);
  const companyName =
    parsedCompanyName ||
    extractionInputs?.companyName ||
    attachmentSnapshot?.companyName ||
    stored?.company.name ||
    resolved?.snapshot.companyName ||
    deps.deriveCompanyLabel(companyType, 'Subject Company');
  const ticker = extractionInputs?.ticker ?? stored?.company.ticker ?? attachmentSnapshot?.ticker ?? resolved?.ticker;
  if (companyType) providedInputs.add('companyType');
  if (parsedCompanyName || attachmentSnapshot?.companyName || stored?.company.name || resolved?.snapshot.companyName) {
    providedInputs.add('companyName');
  }

  const subjectRevenue = extractionInputs?.revenue ?? attachmentSnapshot?.revenue ?? stored?.snapshot?.revenueLtm ?? resolved?.snapshot.revenueLtm ?? null;
  const subjectEbitda = extractionInputs?.ebitda ?? attachmentSnapshot?.ebitda ?? stored?.snapshot?.ebitdaLtm ?? resolved?.snapshot.ebitdaLtm ?? null;
  const subjectCash = extractionInputs?.cash ?? attachmentSnapshot?.cash ?? stored?.snapshot?.cash ?? resolved?.snapshot.cash ?? null;
  const subjectDebt = extractionInputs?.totalDebt ?? attachmentSnapshot?.totalDebt ?? stored?.snapshot?.totalDebt ?? resolved?.snapshot.totalDebt ?? null;
  const subjectNetDebt =
    subjectDebt !== null && subjectCash !== null
      ? subjectDebt - subjectCash
      : extractionInputs?.totalDebt ?? attachmentSnapshot?.totalDebt ?? stored?.snapshot?.totalDebt ?? resolved?.snapshot.totalDebt ?? null;
  const subjectPrice =
    extractionInputs?.sharePrice ??
    stored?.latestPrice?.close ??
    (stored?.snapshot?.marketCap && stored?.snapshot?.sharesOutstanding
      ? stored.snapshot.marketCap / stored.snapshot.sharesOutstanding
      : null) ??
    resolved?.snapshot.sharePrice ??
    null;
  const subjectShares = extractionInputs?.sharesOutstanding ?? attachmentSnapshot?.sharesOutstanding ?? stored?.snapshot?.sharesOutstanding ?? resolved?.snapshot.sharesOutstanding ?? null;

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
  const minimumSpreadFloorPct = FOOTBALL_FIELD_DEFAULTS.minimumSpreadFloorPct;
  defaultsUsed.controlPremiumUplift = controlPremiumUplift;
  defaultsUsed.peerCount = FOOTBALL_FIELD_DEFAULTS.peerCount;
  defaultsUsed.minimumSpreadFloorPct = minimumSpreadFloorPct;

  const makeRange = (
    label: string,
    basis: 'revenue' | 'ebitda',
    lowMultiple: number | null,
    midMultiple: number | null,
    highMultiple: number | null,
    driver: number | null,
    commentary: string
  ): FootballFieldRangeInputs => {
    const normalizedMultiples = normalizeFootballFieldTriplet(lowMultiple, midMultiple, highMultiple, minimumSpreadFloorPct);
    const lowValue =
      isFiniteNumber(normalizedMultiples.low) && isFiniteNumber(driver) ? normalizedMultiples.low * driver : null;
    const midValue =
      isFiniteNumber(normalizedMultiples.mid) && isFiniteNumber(driver) ? normalizedMultiples.mid * driver : null;
    const highValue =
      isFiniteNumber(normalizedMultiples.high) && isFiniteNumber(driver) ? normalizedMultiples.high * driver : null;
    const hasValidValues = !isFiniteNumber(driver) || hasOrderedTriplet(lowValue, midValue, highValue);

    return {
      label,
      basis,
      lowMultiple: hasValidValues ? normalizedMultiples.low : null,
      midMultiple: hasValidValues ? normalizedMultiples.mid : null,
      highMultiple: hasValidValues ? normalizedMultiples.high : null,
      lowValue: hasValidValues ? lowValue : null,
      midValue: hasValidValues ? midValue : null,
      highValue: hasValidValues ? highValue : null,
      commentary: normalizedMultiples.floorApplied
        ? `${commentary} Minimum spread floor applied because peer dispersion was collapsed or too tight.`
        : commentary,
    };
  };

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

  return {
    extractedInputs: {
      modelType: 'FOOTBALL_FIELD',
      companyName,
      companyType: companyType ?? undefined,
      ticker,
      source: extractionInputs?.source ?? 'demo_football_field_framework',
      sharePrice: subjectPrice,
      sharesOutstanding: subjectShares,
      netDebt: subjectNetDebt,
      revenue: subjectRevenue,
      ebitda: subjectEbitda,
      peerSetLabel: `${peerUniverse.length} selected peers`,
      ranges,
    },
    defaultsUsed,
    missingInputs: deps.buildMissingList([
      ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
      ['revenue or EBITDA anchors', subjectRevenue !== null || subjectEbitda !== null],
      ['valuation range set', ranges.some((range) => range.midValue !== null)],
    ]),
    missingCriticalInputs: deps.evaluateCriticalInputs('FOOTBALL_FIELD', providedInputs),
    provenanceSummary: deps.buildProvenanceSummary({
      source: extractionInputs?.source ?? 'demo_football_field_framework',
      asOfDate: extractionInputs?.asOfDate ?? null,
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

export async function buildPrecedentsInputs(
  prompt: string,
  options: ExtractInputsOptions,
  deps: MarketBuilderDeps,
): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const stored = await deps.resolveStoredCompany(prompt);
  const resolved = stored?.snapshot ? null : await deps.resolveDemoCompany(prompt, options);
  const snapshots = await deps.loadExpandedModelUniverseSnapshots(options);
  const inputOverrides = options.inputOverrides ?? {};
  const extractionInputs =
    options.financialExtractionSnapshot?.validationState === 'blocking_error'
      ? null
      : options.financialExtractionSnapshot?.mappedModelInputs ?? null;

  const companyType =
    (typeof inputOverrides.companyType === 'string' && inputOverrides.companyType.trim().length > 0
      ? inputOverrides.companyType.trim()
      : null) ??
    deps.extractCompanyType(prompt) ??
    stored?.company.companyType ??
    stored?.company.sector ??
    resolved?.snapshot.sector ??
    null;
  const parsedCompanyName = deps.extractCompanyName(prompt);
  const overrideCompanyName =
    typeof inputOverrides.companyName === 'string' && inputOverrides.companyName.trim().length > 0
      ? inputOverrides.companyName.trim()
      : null;
  const companyName = overrideCompanyName ?? parsedCompanyName ?? extractionInputs?.companyName ?? stored?.company.name ?? resolved?.snapshot.companyName ?? '';
  const ticker =
    (typeof inputOverrides.ticker === 'string' && inputOverrides.ticker.trim().length > 0
      ? inputOverrides.ticker.trim().toUpperCase()
      : null) ??
    extractionInputs?.ticker ??
    stored?.company.ticker ??
    resolved?.ticker;
  const subjectRevenue =
    (typeof inputOverrides.subjectRevenue === 'number' && Number.isFinite(inputOverrides.subjectRevenue)
      ? inputOverrides.subjectRevenue
      : null) ??
    (typeof inputOverrides.revenue === 'number' && Number.isFinite(inputOverrides.revenue)
      ? inputOverrides.revenue
      : null) ??
    extractionInputs?.revenue ??
    stored?.snapshot?.revenueLtm ??
    resolved?.snapshot.revenueLtm ??
    null;
  const subjectEbitda =
    (typeof inputOverrides.subjectEbitda === 'number' && Number.isFinite(inputOverrides.subjectEbitda)
      ? inputOverrides.subjectEbitda
      : null) ??
    (typeof inputOverrides.ebitda === 'number' && Number.isFinite(inputOverrides.ebitda)
      ? inputOverrides.ebitda
      : null) ??
    extractionInputs?.ebitda ??
    stored?.snapshot?.ebitdaLtm ??
    resolved?.snapshot.ebitdaLtm ??
    null;
  if (companyType) providedInputs.add('companyType');
  if (companyName) providedInputs.add('companyName');
  if (typeof subjectRevenue === 'number') providedInputs.add('revenue');
  if (typeof subjectEbitda === 'number') providedInputs.add('ebitda');

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

  const source = extractionInputs?.source ?? (transactions.length > 0 ? 'demo_precedents_framework' : 'company_type_defaults');

  return {
    extractedInputs: {
      modelType: 'PRECEDENTS',
      companyName: companyName || 'Subject Company',
      companyType: companyType ?? undefined,
      ticker,
      source,
      subjectRevenue,
      subjectEbitda,
      transactions,
      transactionCount: transactions.length,
      revenueMultiple: PRECEDENTS_DEFAULTS.revenueMultiple,
      ebitdaMultiple: PRECEDENTS_DEFAULTS.ebitdaMultiple,
    },
    defaultsUsed,
    missingInputs: deps.buildMissingList([
      ['companyName', providedInputs.has('companyName')],
      ['subjectRevenue or subjectEbitda', providedInputs.has('revenue') || providedInputs.has('ebitda')],
      ['transactionSet', transactions.length > 0],
    ]),
    missingCriticalInputs: deps.evaluateCriticalInputs('PRECEDENTS', providedInputs),
    provenanceSummary: deps.buildProvenanceSummary({
      source,
      asOfDate: extractionInputs?.asOfDate ?? null,
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}
