/**
 * LBO Model Types
 * 
 * Complete private-equity-standard LBO model with:
 * - Operating projections
 * - Debt schedules
 * - Cash sweep logic
 * - Exit returns (IRR, MOIC)
 */

export type DebtTranche = {
  name: string;
  openingBalance: number;
  interestRate: number;          // Annual rate (e.g., 0.05 = 5%)
  mandatoryAmortization: number; // Annual amount
  allowsSweep: boolean;          // Can use excess cash for paydown
  priority: number;              // 1 = highest priority for sweep
};

export type DebtStructure = {
  revolver?: number;
  termLoanA?: number;
  termLoanB?: number;
  seniorNotes?: number;
  subNotes?: number;
};

export type OperatingProjections = {
  years: number[];
  revenue: number[];
  revenueGrowth: number[];
  opex: number[];
  ebitda: number[];
  ebitdaMargin: number[];
  da: number[];
  ebit: number[];
  taxes: number[];
  nopat: number[];
  capex: number[];
  nwcChange: number[];
  unleveredFCF: number[];
  leveredFCF: number[];
};

export type SourcesAndUses = {
  // Sources
  termLoanA: number;
  termLoanB: number;
  seniorNotes: number;
  subNotes: number;
  sponsorEquity: number;         // Plug to balance
  managementRollover: number;
  totalSources: number;
  
  // Uses
  equityPurchasePrice: number;
  refinanceDebt: number;
  transactionFees: number;
  totalUses: number;
  
  // Leverage metrics
  totalDebt: number;
  netLeverageRatio: number;      // Total Debt / LTM EBITDA
};

export type DebtScheduleRow = {
  year: number;
  openingBalance: number;
  mandatoryAmortization: number;
  sweepAmortization: number;
  totalPaydown: number;
  interestExpense: number;
  endingBalance: number;
};

export type DebtSchedule = {
  revolver: DebtScheduleRow[];
  termLoanA: DebtScheduleRow[];
  termLoanB: DebtScheduleRow[];
  seniorNotes: DebtScheduleRow[];
  subNotes: DebtScheduleRow[];
  totalDebt: DebtScheduleRow[];
};

export type ExitAnalysis = {
  exitYear: number;
  exitEBITDA: number;
  exitMultiple: number;
  exitEnterpriseValue: number;
  netDebtAtExit: number;
  exitEquityValue: number;
  sponsorEquityInvested: number;
  sponsorEquityReceived: number;
  moic: number;
  irr: number;
};

export type LBOModel = {
  target: {
    ticker: string;
    companyName: string;
    currentPrice: number;
    sharesOutstanding: number;
    ltmRevenue: number;
    ltmEBITDA: number;
    ltmEBIT: number;
    currentNetDebt: number;
  };
  
  transaction: {
    offerPremium: number;
    offerPricePerShare: number;
    equityValue: number;
    enterpriseValue: number;
    entryMultiple: number;
  };
  
  sourcesAndUses: SourcesAndUses;
  
  operatingProjections: OperatingProjections;
  
  debtSchedule: DebtSchedule;
  
  exitAnalysis: ExitAnalysis;
  
  modelChecks: {
    sourcesMatchUses: boolean;
    noNegativeDebt: boolean;
    cashFlowPositive: boolean;
    allChecksPass: boolean;
  };
  
  commentary: string;
  
  metadata: {
    projectionYears: number;
    aiEstimatedFields: string[];
  };
};

/**
 * LBO Assumptions (before enrichment)
 */
export type PartialLBOAssumptions = {
  // Target company
  ticker: string;
  companyName?: string;
  currentPrice?: number | null;
  sharesOutstanding?: number | null;
  ltmRevenue?: number | null;
  ltmEBITDA?: number | null;
  ltmEBIT?: number | null;
  currentNetDebt?: number | null;
  
  // Transaction
  offerPremium?: number | null;
  entryMultiple?: number | null;
  exitMultiple?: number | null;
  
  // Operating projections
  projectionYears?: number;
  revenueGrowth?: (number | null)[];
  ebitdaMargin?: (number | null)[];
  daPercent?: number | null;
  taxRate?: number | null;
  capexPercent?: (number | null)[];
  nwcPercent?: number | null;
  
  // Debt structure
  customDebtStructure?: DebtStructure;
  targetLeverage?: number | null;  // Target Net Debt / EBITDA
  
  // Interest rates
  revolverRate?: number | null;
  termLoanARate?: number | null;
  termLoanBRate?: number | null;
  seniorNotesRate?: number | null;
  subNotesRate?: number | null;
};

/**
 * Complete LBO Assumptions (after enrichment)
 */
export type CompleteLBOAssumptions = {
  // Target company
  ticker: string;
  companyName: string;
  currentPrice: number;
  sharesOutstanding: number;
  ltmRevenue: number;
  ltmEBITDA: number;
  ltmEBIT: number;
  currentNetDebt: number;
  
  // Transaction
  offerPremium: number;
  entryMultiple: number;
  exitMultiple: number;
  
  // Operating projections
  projectionYears: number;
  revenueGrowth: number[];
  ebitdaMargin: number[];
  daPercent: number;
  taxRate: number;
  capexPercent: number[];
  nwcPercent: number;
  
  // Debt structure
  debtStructure: {
    revolver: number;
    termLoanA: number;
    termLoanB: number;
    seniorNotes: number;
    subNotes: number;
  };
  
  // Interest rates
  revolverRate: number;
  termLoanARate: number;
  termLoanBRate: number;
  seniorNotesRate: number;
  subNotesRate: number;
  
  // Amortization schedules
  termLoanAAmortization: number; // % per year
  
  // Other
  managementRollover: number;
  transactionFees: number;       // % of transaction value
  minimumCash: number;
  
  // Documentation
  assumptionNotes: string[];
  aiEstimatedFields: string[];
};

/**
 * Request to OpenAI for LBO assumption enrichment
 */
export type LBOEnrichmentRequest = {
  ticker: string;
  companyName?: string;
  sector?: string;
  partialAssumptions: PartialLBOAssumptions;
  peerData?: {
    medianEBITDAMargin?: number;
    medianRevenueGrowth?: number;
    medianLeverage?: number;
  };
};

/**
 * Default LBO assumptions
 */
export const DEFAULT_LBO_ASSUMPTIONS: Partial<CompleteLBOAssumptions> = {
  offerPremium: 0.30,            // 30% premium
  entryMultiple: 10.0,           // 10x EBITDA
  exitMultiple: 10.5,            // 10.5x EBITDA
  projectionYears: 5,
  daPercent: 0.04,               // 4% of revenue
  taxRate: 0.21,                 // 21% federal rate
  nwcPercent: 0.02,              // 2% of revenue
  revolverRate: 0.045,           // 4.5%
  termLoanARate: 0.055,          // 5.5%
  termLoanBRate: 0.065,          // 6.5%
  seniorNotesRate: 0.070,        // 7.0%
  subNotesRate: 0.095,           // 9.5%
  termLoanAAmortization: 0.05,   // 5% per year
  managementRollover: 0,
  transactionFees: 0.02,         // 2% of transaction
  minimumCash: 50,               // $50M minimum cash
};

