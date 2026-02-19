/**
 * LBO Generator
 * Type definitions for LBO model inputs (calculator engine)
 */

export interface LBOInputs {
  ticker: string;
  companyName?: string;

  // Baseline financials (USD millions)
  revenue: number;
  ebitda: number;
  netDebt?: number;

  // Entry / exit assumptions
  entryMultiple: number; // EV / EBITDA
  exitMultiple: number; // EV / EBITDA
  transactionFeesPercent: number; // % of entry EV
  exitFeesPercent: number; // % of exit EV

  // Financing mix
  debtPercent: number;
  equityPercent: number;
  interestRate: number; // blended interest rate
  amortizationPercent: number; // % of debt per year
  cashSweepPercent: number; // % of excess cash

  // Operating assumptions
  revenueGrowth: number | number[];
  ebitdaMargin: number;
  capexPctRevenue: number;
  deltaNwcPctRevenue: number;
  taxRate: number;
  depreciationPctRevenue?: number;
  nwcPctRevenue?: number;
  daPctRevenue?: number;

  // Exit timing
  holdingPeriodYears: number;

  // Optional buffers
  minimumCashBalance?: number;

  // Legacy compatibility (populated by engine as derived)
  debtToEquity?: number;
  leverageMultiple?: number;
  seniorDebtPct?: number;
  subordinatedDebtPct?: number;
  seniorRate?: number;
  subRate?: number;
  holdPeriod?: number;
}

// Re-export from lboEngine for convenience
export type { LboEngineOutput } from './lboEngine';
