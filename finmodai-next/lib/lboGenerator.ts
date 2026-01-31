/**
 * LBO Generator
 * Type definitions for LBO model inputs
 */

export interface LBOInputs {
  ticker: string;
  companyName?: string;
  
  // Entry valuation
  enterpriseValue: number;
  purchaseMultiple?: number; // EV / EBITDA
  
  // Financials
  revenue: number;
  ebitda: number;
  ebitdaMargin?: number;
  
  // Growth assumptions
  revenueGrowth?: number[];
  ebitdaMarginExpansion?: number;
  
  // Cash flow assumptions
  capexPctRevenue?: number;
  nwcPctRevenue?: number;
  taxRate?: number;
  
  // Exit assumptions
  exitMultiple?: number;
  holdPeriod?: number;
  
  // Debt structure
  debtToEquity?: number;
  seniorDebtPct?: number;
  subordinatedDebtPct?: number;
  seniorRate?: number;
  subRate?: number;
  
  // Transaction
  transactionFees?: number;
  financingFees?: number;
  
  // Other
  currency?: string;
  managementRollover?: number;
}

// Re-export from lboEngine for convenience
export type { LboEngineOutput } from './lboEngine';
