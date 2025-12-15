/**
 * Three-Statement Model Assumptions
 * 
 * Complete set of inputs for integrated financial statements.
 * All fields must be populated (no nulls/zeros unless realistic).
 */
import type { LboAdvancedOptions } from '@/types/lbo';

export type ThreeStatementAssumptions = {
  // Timeline
  years: number[];                // e.g. [2024, 2025, 2026, 2027, 2028, 2029]
  
  // Income Statement Drivers
  revenue: number[];              // Revenue for each year ($ millions)
  revenueGrowth: number[];        // YoY growth rates
  cogsPct: number[];              // COGS as % of revenue
  opexPct: number[];              // Operating expenses as % of revenue
  daPct: number[];                // D&A as % of revenue
  taxRate: number;                // Corporate tax rate
  
  // Balance Sheet - Starting Positions (base year)
  startingCash: number;           // Beginning cash balance
  startingPPE: number;            // Beginning PP&E (gross)
  startingAR: number;             // Beginning accounts receivable
  startingInventory: number;      // Beginning inventory
  startingAP: number;             // Beginning accounts payable
  
  // Working Capital Drivers
  arDays: number;                 // Days sales outstanding
  inventoryDays: number;          // Days inventory outstanding
  apDays: number;                 // Days payable outstanding
  
  // Capital Expenditure
  capexPctRevenue: number[];      // Capex as % of revenue for each year
  
  // Debt & Financing
  debt: number;                   // Total debt
  interestRate: number;           // Interest rate on debt
  
  // Equity
  sharesOutstanding: number;      // Shares outstanding (millions)
  
  // Documentation
  assumptionNotes: string[];      // Sources and rationale
  
  // Optional LBO-specific advanced options
  lboAdvanced?: LboAdvancedOptions;
};

/**
 * Partial assumptions before enrichment
 */
export type PartialThreeStatementAssumptions = {
  years?: number[];
  revenue?: (number | null)[];
  revenueGrowth?: (number | null)[];
  cogsPct?: (number | null)[];
  opexPct?: (number | null)[];
  daPct?: (number | null)[];
  taxRate?: number | null;
  startingCash?: number | null;
  startingPPE?: number | null;
  startingAR?: number | null;
  startingInventory?: number | null;
  startingAP?: number | null;
  arDays?: number | null;
  inventoryDays?: number | null;
  apDays?: number | null;
  capexPctRevenue?: (number | null)[];
  debt?: number | null;
  interestRate?: number | null;
  sharesOutstanding?: number | null;
  assumptionNotes?: string[];
  lboAdvanced?: LboAdvancedOptions;
};

/**
 * Unified assumptions type for all model types
 */
export type UnifiedModelAssumptions = ThreeStatementAssumptions & {
  // DCF-specific
  wacc?: number;
  terminalGrowth?: number;
  netDebt?: number;
  
  // LBO-specific
  entryMultiple?: number;
  exitMultiple?: number;
  leverage?: number;
  lboAdvanced?: LboAdvancedOptions;
  
  // Comps-specific
  comparables?: any[];
};

/**
 * Request to OpenAI for assumption enrichment
 */
export type AssumptionEnrichmentRequest = {
  ticker: string;
  companyName?: string;
  sector?: string;
  modelType: 'dcf' | 'lbo' | 'three-statement' | 'comps';
  currency?: string;
  partialAssumptions: PartialThreeStatementAssumptions;
  userNotes?: string;
};

/**
 * Default fallback values
 */
export const DEFAULT_THREE_STATEMENT_ASSUMPTIONS: Partial<ThreeStatementAssumptions> = {
  taxRate: 0.21,
  arDays: 45,
  inventoryDays: 60,
  apDays: 30,
  interestRate: 0.05,
  startingCash: 100,
  startingPPE: 500,
  startingAR: 150,
  startingInventory: 100,
  startingAP: 80,
  debt: 200,
  sharesOutstanding: 100,
};
