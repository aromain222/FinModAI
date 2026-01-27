/**
 * Canonical Output Types for Model Previews
 * 
 * Each model generator must return a predictable JSON shape that previews can read from.
 */

import type { SerializedMaDealInputs } from '@/lib/models/merger/maDealInputs';

// Base types
export type Currency = 'USD' | 'EUR' | 'GBP' | string;
export type ModelType = 'dcf' | 'lbo' | 'three-statement' | 'comps' | 'merger' | 'operating';

export type ModelChecksPreview = {
  incomeTies?: boolean;
  debtScheduleTies?: boolean;
  sourcesUsesBalanced?: boolean;
  outlierHandling?: boolean;
  issues?: string[];
  safeMode?: boolean;
};

// Three-Statement Output
export interface ThreeStatementOutput {
  incomeStatement: {
    revenue: (number | null)[];
    cogs: (number | null)[];
    grossProfit: (number | null)[];
    operatingExpenses: (number | null)[];
    ebitda: (number | null)[];
    ebit: (number | null)[];
    netIncome: (number | null)[];
    periods: string[]; // e.g., ['LTM', 'FY+1', 'FY+2']
  };
  cashFlow: {
    operatingCashFlow: (number | null)[];
    investingCashFlow: (number | null)[];
    financingCashFlow: (number | null)[];
    netChangeInCash: (number | null)[];
    periods: string[];
  };
  balanceSheet: {
    cash: (number | null)[];
    totalAssets: (number | null)[];
    totalLiabilities: (number | null)[];
    totalEquity: (number | null)[];
    periods: string[];
  };
  balanceSheetTies: boolean;
  balanceSheetMismatch?: number; // If not tied, the difference
  modelChecks?: {
    incomeStatementTies: boolean;
    cashRollForwardTies: boolean;
    balanceSheetBalances: boolean;
    issues: string[];
  };
}

// DCF Output
export interface DCFOutput {
  valuation: {
    impliedValuePerShare: number | null; // null if missing inputs
    enterpriseValue: number | null;
    equityValue: number | null;
    currentPrice?: number | null;
    upsideDownside?: number | null; // %
  };
  assumptions: {
    wacc: number | null; // decimal, null if missing
    terminalGrowth?: number | null; // decimal
    exitMultiple?: number | null;
    projectionHorizon: number; // years
    taxRate?: number | null;
    reinvestmentRate?: number | null;
    capexPct?: number | null;
  };
  projections: {
    revenue: (number | null)[]; // Next 3 years, null if missing
    ebitda: (number | null)[];
    freeCashFlow: (number | null)[];
    years: string[]; // e.g., ['FY+1', 'FY+2', 'FY+3']
  };
  valuationBridge: {
    pvOfFCF: number | null;
    pvOfTerminalValue: number | null;
    enterpriseValue: number | null;
    netDebt: number | null;
    equityValue: number | null;
  };
  sensitivity?: {
    waccRange: number[]; // e.g., [0.08, 0.10, 0.12]
    terminalGrowthRange?: number[]; // e.g., [0.02, 0.025, 0.03]
    exitMultipleRange?: number[]; // e.g., [8.0, 10.0, 12.0]
    grid: (number | null)[][]; // 2D grid of value per share, null if missing
  };
  missingInputs?: string[]; // List of missing inputs that prevent valuation
}

// LBO Output
export type LboOutputField<T> = {
  value?: T;
  reason?: string;
  source?: 'workbook';
};

export type MaOutput<T> = {
  value?: T;
  reason?: string;
};

export type MaOutputs<T = number> = {
  targetEquityValue: MaOutput<T>;
  newSharesIssued: MaOutput<T>;
  proFormaNetIncome: MaOutput<T>;
  proFormaShares: MaOutput<T>;
  standaloneEps: MaOutput<T>;
  proFormaEps: MaOutput<T>;
  accretionPct: MaOutput<T>;
};

export type LboValuationOutputs = {
  enterpriseValue: LboOutputField<number>;
  equityValue: LboOutputField<number>;
  netDebt: LboOutputField<number>;
  sharesOutstanding: LboOutputField<number>;
  pricePerShare: LboOutputField<number>;
  irr: LboOutputField<number>;
  moic: LboOutputField<number>;
  units: LboOutputField<string>;
};

export interface LBOOutput {
  dealTerms: {
    entryMultiple: number;
    entryPrice: number;
    leverageMultiple: number;
    holdPeriod: number; // years
    exitMultiple: number;
  };
  sourcesAndUses: {
    sources: Array<{ item: string; amount: number }>;
    uses: Array<{ item: string; amount: number }>;
    sourcesTotal: number;
    usesTotal: number;
    reconciles: boolean;
    mismatch?: number;
  };
  returns: {
    irr: number; // decimal
    moic: number;
  };
  debtPaydown: {
    year0: number;
    year1: number;
    year2: number;
    exit: number;
    periods: string[];
  };
  modelChecks?: ModelChecksPreview;
  valuation: LboValuationOutputs;
}

// Comps Output
export interface CompsOutput {
  target: {
    ticker: string;
    evRevenue?: number;
    evEbitda?: number;
    pe?: number;
  };
  peers: Array<{
    ticker: string;
    evRevenue?: number;
    evEbitda?: number;
    pe?: number;
  }>;
  summary: {
    evRevenue: { median: number; p25: number; p75: number };
    evEbitda: { median: number; p25: number; p75: number };
    pe: { median: number; p25: number; p75: number };
  };
  modelChecks?: ModelChecksPreview;
}

// Merger Output
export interface MergerOutput {
  maInputs?: SerializedMaDealInputs;
  maV1?: MaOutputs<number>;
  accretionDilution: {
    epsImpact: number; // % change
    isAccretive: boolean;
  };
  epsBridge: {
    standaloneAcquirerEPS: number;
    purchaseAccounting: number;
    intangAmort: number;
    synergies: number;
    financingEffects: number;
    proFormaEPS: number;
  };
  sourcesAndUses: {
    sources: Array<{ item: string; amount: number }>;
    uses: Array<{ item: string; amount: number }>;
  };
  assumptions: {
    premium: number; // %
    mix: {
      cash: number; // %
      debt: number; // %
      stock: number; // %
    };
    synergiesTimeline: string; // e.g., 'Year 1-2'
    revenueSynergies?: number;
    costSynergies?: number;
  };
  modelChecks?: ModelChecksPreview;
}

// Operating Output
export interface OperatingOutput {
  monthly: Array<{
    month: string; // e.g., '2024-01'
    revenue: number;
    grossProfit: number;
    ebitda: number;
    netIncome: number;
    endingCash: number;
  }>;
  runway: {
    monthCashTurnsNegative: string | null; // e.g., '2024-08' or null if positive
    isPositive: boolean;
  };
  drivers?: {
    customerAdds?: number[]; // Monthly
    churn?: number[]; // Monthly
    arpu?: number[]; // Monthly
    headcount?: number[]; // Monthly
  };
}

// Unified Model Output
export type ModelOutput =
  | { type: 'three-statement'; data: ThreeStatementOutput }
  | { type: 'dcf'; data: DCFOutput }
  | { type: 'lbo'; data: LBOOutput }
  | { type: 'comps'; data: CompsOutput }
  | { type: 'merger'; data: MergerOutput }
  | { type: 'operating'; data: OperatingOutput };
