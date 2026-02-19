/**
 * XBRL Normalize — Map raw XBRL (sec-api XBRL-to-JSON) to canonical IS/BS/CF
 * Ordered fallbacks for common tag variants; derived fields where needed.
 */

import type {
  RawXbrlPayload,
  NormalizedFinancials,
  NormalizedStatement,
  SourceMap,
  ConfidenceLevel,
  SecFilingRef,
} from './secPipeline/types';

// Canonical field names (CapitalBase schema)
const IS_KEYS = [
  'revenue', 'cogs', 'grossProfit', 'opEx', 'ebitda', 'da', 'ebit',
  'interestExpense', 'ebt', 'tax', 'netIncome',
] as const;
const BS_KEYS = [
  'cash', 'ar', 'inventory', 'currentAssets', 'ppe', 'totalAssets',
  'ap', 'currentLiabilities', 'debt', 'totalLiabilities', 'equity', 'retainedEarnings', 'totalLiabAndEquity',
] as const;
const CF_KEYS = [
  'netIncome', 'da', 'changeNWC', 'capex', 'cfo', 'cfi', 'cff', 'netCashChange', 'endingCash',
] as const;

// XBRL tag fallbacks (ordered: preferred first)
const TAG_MAP: Record<string, string[]> = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'Revenue', 'SalesRevenueNet'],
  cogs: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'],
  grossProfit: ['GrossProfit'],
  opEx: ['OperatingExpenses', 'OperatingExpense', 'SellingGeneralAndAdministrativeExpense'],
  ebitda: ['EBITDA', 'AdjustedEBITDA'],
  da: ['DepreciationAndAmortization', 'DepreciationDepletionAndAmortization', 'Depreciation'],
  ebit: ['OperatingIncomeLoss', 'IncomeLossFromOperations', 'EBIT'],
  interestExpense: ['InterestExpense', 'InterestExpenseDebt'],
  ebt: ['IncomeLossBeforeTax', 'IncomeBeforeIncomeTaxes'],
  tax: ['IncomeTaxExpenseBenefit', 'IncomeTaxExpense'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss', 'NetIncome'],
  cash: ['Cash', 'CashAndCashEquivalentsAtCarryingValue', 'CashAndDueFromBanks'],
  ar: ['AccountsReceivableNetCurrent', 'AccountsReceivableNet', 'ReceivablesNetCurrent'],
  inventory: ['InventoryNet', 'Inventory'],
  currentAssets: ['CurrentAssets', 'AssetsCurrent'],
  ppe: ['PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentGross', 'PropertyPlantAndEquipment'],
  totalAssets: ['Assets', 'AssetsTotal'],
  ap: ['AccountsPayableCurrent', 'AccountsPayable'],
  currentLiabilities: ['CurrentLiabilities', 'LiabilitiesCurrent'],
  debt: ['LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations', 'DebtCurrentAndNoncurrent'],
  totalLiabilities: ['Liabilities', 'LiabilitiesTotal'],
  equity: ['StockholdersEquity', 'Equity', 'EquityAttributableToParent', 'EquityAttributableToOwnersOfParent'],
  retainedEarnings: ['RetainedEarningsAccumulatedDeficit', 'RetainedEarnings'],
  totalLiabAndEquity: ['LiabilitiesAndStockholdersEquity', 'LiabilitiesAndEquity'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'CapitalExpendituresIncurredButNotYetPaid'],
  cfo: ['NetCashProvidedByUsedInOperatingActivities', 'CashProvidedByUsedInOperatingActivities'],
  cfi: ['NetCashProvidedByUsedInInvestingActivities', 'CashProvidedByUsedInInvestingActivities'],
  cff: ['NetCashProvidedByUsedInFinancingActivities', 'CashProvidedByUsedInFinancingActivities'],
};

type RawBlock = Record<string, number | string | null>;

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickFirst(raw: RawBlock, tagKeys: string[]): { value: number | null; tag: string } {
  for (const tag of tagKeys) {
    const keys = Object.keys(raw).filter(k => k.includes(tag) || k === tag);
    for (const k of keys) {
      const v = toNumber(raw[k]);
      if (v !== null) return { value: v, tag: k };
    }
  }
  return { value: null, tag: '' };
}

function normalizeBlock(
  raw: RawBlock,
  canonicalKeys: readonly string[],
  tagMap: Record<string, string[]>
): { statement: NormalizedStatement; sourceMap: SourceMap; confidence: Record<string, ConfidenceLevel> } {
  const statement: NormalizedStatement = {};
  const sourceMap: SourceMap = {};
  const confidence: Record<string, ConfidenceLevel> = {};
  for (const key of canonicalKeys) {
    const tags = tagMap[key as string];
    if (!tags) continue;
    const { value, tag } = pickFirst(raw, tags);
    statement[key] = value;
    if (tag) sourceMap[key] = tag;
    confidence[key] = value !== null ? 'direct_xbrl' : 'missing_low_confidence';
  }
  return { statement, sourceMap, confidence };
}

/**
 * Convert sec-api XBRL-to-JSON response to RawXbrlPayload (single period).
 */
export function rawXbrlToPayload(
  xbrlJson: Record<string, unknown>,
  source: SecFilingRef
): RawXbrlPayload {
  const incomeStatement = (xbrlJson.IncomeStatement ?? xbrlJson.income_statement ?? xbrlJson.IS ?? {}) as RawBlock;
  const balanceSheet = (xbrlJson.BalanceSheet ?? xbrlJson.balance_sheet ?? xbrlJson.BS ?? {}) as RawBlock;
  const cashFlow = (xbrlJson.CashFlowStatement ?? xbrlJson.cash_flow ?? xbrlJson.CF ?? {}) as RawBlock;
  const periodEnd = (xbrlJson.periodEnd ?? xbrlJson.period ?? source.periodEnd) as string ?? source.periodEnd;
  return {
    periodEnd: typeof periodEnd === 'string' ? periodEnd : source.periodEnd,
    statements: {
      is: incomeStatement,
      bs: balanceSheet,
      cf: cashFlow,
    },
    source: {
      form: source.form,
      accessionNo: source.accessionNo,
      filedAt: source.filedAt,
      periodEnd: source.periodEnd,
    },
  };
}

/**
 * STEP 4 — Normalize RawXbrlPayload to NormalizedFinancials
 * Derives: grossProfit, ebitda (ebit+da), retainedEarnings if missing.
 */
export function normalizeToCanonical(
  raw: RawXbrlPayload,
  units: 'millions' | 'thousands' = 'millions'
): NormalizedFinancials {
  const normIS = normalizeBlock(raw.statements.is, IS_KEYS, TAG_MAP);
  const normBS = normalizeBlock(raw.statements.bs, BS_KEYS, TAG_MAP);
  const normCF = normalizeBlock(raw.statements.cf, CF_KEYS, TAG_MAP);

  const is = { ...normIS.statement };
  const bs = { ...normBS.statement };
  const cf = { ...normCF.statement };
  const source_map: SourceMap = { ...normIS.sourceMap, ...normBS.sourceMap, ...normCF.sourceMap };
  const confidence: Record<string, ConfidenceLevel> = { ...normIS.confidence, ...normBS.confidence, ...normCF.confidence };

  // Derived: grossProfit = revenue - cogs
  if (is.grossProfit == null && is.revenue != null && is.cogs != null) {
    is.grossProfit = is.revenue - is.cogs;
    confidence.grossProfit = 'derived';
  }
  // Derived: ebitda = ebit + da (or operating income + da)
  if (is.ebitda == null && is.ebit != null && is.da != null) {
    is.ebitda = is.ebit + is.da;
    confidence.ebitda = 'derived';
  } else if (is.ebitda == null && is.ebit != null) {
    is.ebitda = is.ebit;
    confidence.ebitda = 'derived';
  }
  // Scale to millions if raw values are in actual dollars
  const maxAbs = (arr: (number | null)[]) =>
    Math.max(...arr.filter((v): v is number => v != null && Number.isFinite(v)).map(v => Math.abs(v)), 0);
  const needScale = maxAbs([is.revenue ?? 0, bs.totalAssets ?? 0, bs.cash ?? 0].filter(Number.isFinite) as number[]) > 1e6;
  if (needScale && units === 'millions') {
    for (const k of Object.keys(is)) {
      const v = is[k as keyof NormalizedStatement];
      if (v != null) is[k as keyof NormalizedStatement] = v / 1_000_000;
    }
    for (const k of Object.keys(bs)) {
      const v = bs[k as keyof NormalizedStatement];
      if (v != null) bs[k as keyof NormalizedStatement] = v / 1_000_000;
    }
    for (const k of Object.keys(cf)) {
      const v = cf[k as keyof NormalizedStatement];
      if (v != null) cf[k as keyof NormalizedStatement] = v / 1_000_000;
    }
  }

  return {
    periodEnd: raw.periodEnd,
    currency: 'USD',
    units,
    is,
    bs,
    cf,
    source_map,
    confidence,
    sourceMeta: raw.source as SecFilingRef,
  };
}
