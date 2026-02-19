/**
 * SEC Pipeline Types
 * Canonical types for Source → Normalize → Store → Drivers → Three-Statement → Validate
 */

// ─── STEP 0: Inputs ─────────────────────────────────────────────────────
export interface BuildFinancialsInputs {
  ticker: string;
  asOfDate?: string; // ISO date, default today
  horizonYears?: number; // default 5
  scenarioId?: 'base' | 'bull' | 'bear';
  units?: 'millions' | 'thousands';
}

// ─── STEP 1: Company Identity ─────────────────────────────────────────────
export interface CompanyIdentity {
  ticker: string;
  cik: string;
  companyName: string;
  sector?: string;
  exchange?: string;
}

// ─── STEP 2: Filing Index ──────────────────────────────────────────────────
export interface SecFilingRef {
  form: string;
  accessionNo: string;
  filedAt: string; // ISO
  periodEnd: string; // ISO
  url?: string;
}

export interface SecFilingIndex {
  annualFiling: SecFilingRef;
  latestQuarter?: SecFilingRef;
}

// ─── STEP 3: Raw XBRL ─────────────────────────────────────────────────────
export type RawStatementBlock = Record<string, number | string | null>;

export interface RawXbrlPayload {
  periodEnd: string;
  statements: {
    is: RawStatementBlock;
    bs: RawStatementBlock;
    cf: RawStatementBlock;
  };
  source: {
    form: string;
    accessionNo: string;
    filedAt: string;
    periodEnd: string;
  };
}

// ─── STEP 4: Normalized Actuals ───────────────────────────────────────────
export type ConfidenceLevel = 'direct_xbrl' | 'derived' | 'missing_low_confidence';

export interface NormalizedStatement {
  [canonicalField: string]: number | null;
}

export interface SourceMap {
  [canonicalField: string]: string; // xbrl tag used
}

export interface NormalizedFinancials {
  periodEnd: string;
  currency: string;
  units: 'millions' | 'thousands';
  is: NormalizedStatement;
  bs: NormalizedStatement;
  cf: NormalizedStatement;
  source_map: SourceMap;
  confidence: Record<string, ConfidenceLevel>;
  sourceMeta: SecFilingRef;
}

// ─── STEP 5: Persist (keyed by ticker + periodEnd) ─────────────────────────
export interface StoredActuals {
  ticker: string;
  periodEnd: string;
  data: NormalizedFinancials;
  storedAt: string;
}

// ─── STEP 6: Forecast Drivers ──────────────────────────────────────────────
export interface ForecastDrivers {
  horizonYears: number;
  revenueGrowth: number[];
  grossMarginPct: number[];
  opexPctRevenue: number[];
  capexPctRevenue: number[];
  taxRate: number;
  nwcPctRevenue: number[];
  daPctRevenue: number[];
}

// ─── STEP 7: Three-Statement Forecast (by year) ───────────────────────────
export interface ForecastYearIS {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opEx: number;
  ebitda: number;
  da: number;
  ebit: number;
  interestExpense: number;
  ebt: number;
  tax: number;
  netIncome: number;
}

export interface ForecastYearBS {
  cash: number;
  ar: number;
  inventory: number;
  currentAssets: number;
  ppe: number;
  totalAssets: number;
  ap: number;
  currentLiabilities: number;
  debt: number;
  totalLiabilities: number;
  equity: number;
  retainedEarnings: number;
  totalLiabAndEquity: number;
}

export interface ForecastYearCF {
  netIncome: number;
  da: number;
  changeNWC: number;
  capex: number;
  cfo: number;
  cfi: number;
  cff: number;
  netCashChange: number;
  endingCash: number;
}

export interface ThreeStatementForecast {
  years: number[];
  is: Record<number, ForecastYearIS>;
  bs: Record<number, ForecastYearBS>;
  cf: Record<number, ForecastYearCF>;
}

// ─── STEP 8: Validations ───────────────────────────────────────────────────
export interface ValidationResult {
  bsBalances: { year: number; ok: boolean; diff?: number }[];
  cashReconciles: { year: number; ok: boolean; diff?: number }[];
  allYearsPresent: boolean;
  noBlanks: boolean;
  warnings: string[];
  errors: string[];
}

// ─── Final Return Shape ────────────────────────────────────────────────────
export interface BuildFinancialsResponse {
  meta: {
    ticker: string;
    cik: string;
    asOfDate: string;
    currency: string;
    units: string;
    horizonYears: number;
  };
  actuals: NormalizedFinancials[];
  drivers: ForecastDrivers;
  forecast: ThreeStatementForecast;
  validations: ValidationResult;
  sources: { filingsUsed: SecFilingRef[] };
}

export interface BuildFinancialsError {
  ok: false;
  code: string;
  message: string;
  missing?: string[];
  debug?: Record<string, unknown>;
}
