/**
 * DCF Model Assumptions Type
 * 
 * Complete set of inputs for a banker-grade DCF model.
 * All fields must be populated (no nulls) before generating Excel.
 */

export type DcfAssumptions = {
  // Forecast timeline
  forecastYears: number[];        // e.g. [2024, 2025, 2026, 2027, 2028, 2029]
  
  // Revenue projections ($ millions)
  revenue: number[];              // same length as forecastYears
  
  // Operating metrics (as decimals, e.g. 0.25 = 25%)
  ebitMargin: number[];           // EBIT / Revenue for each year
  taxRate: number;                // Corporate tax rate (e.g. 0.21)
  daPctRevenue: number;           // D&A as % of revenue
  capexPctRevenue: number;        // Capex as % of revenue
  wcPctRevenue: number;           // Working capital as % of revenue
  
  // Valuation inputs
  wacc: number;                   // Weighted average cost of capital
  terminalGrowth: number;         // Perpetual growth rate
  
  // Balance sheet items ($ millions)
  netDebt: number;                // Total debt - cash
  sharesOutstandingMillions: number;
  
  // Documentation
  assumptionNotes: string[];      // Sources and rationale for each assumption
  
  // Scenario analysis (optional)
  bullCase?: {
    revenueGrowthDelta: number;   // Additional growth vs base (e.g. +0.05 = +5%)
    ebitMarginDelta: number;      // Additional margin vs base
    capexPctRevenueDelta: number; // Change in capex intensity
    waccDelta: number;            // Change in discount rate
    notes: string[];
  };
  
  bearCase?: {
    revenueGrowthDelta: number;
    ebitMarginDelta: number;
    capexPctRevenueDelta: number;
    waccDelta: number;
    notes: string[];
  };
};

/**
 * Partial assumptions object used before OpenAI enrichment.
 * Any field can be null/undefined.
 */
export type PartialDcfAssumptions = {
  forecastYears?: number[];
  revenue?: (number | null)[];
  ebitMargin?: (number | null)[];
  taxRate?: number | null;
  daPctRevenue?: number | null;
  capexPctRevenue?: number | null;
  wcPctRevenue?: number | null;
  wacc?: number | null;
  terminalGrowth?: number | null;
  netDebt?: number | null;
  sharesOutstandingMillions?: number | null;
  assumptionNotes?: string[];
};

/**
 * Request to OpenAI for assumption enrichment
 */
export type AssumptionEnrichmentRequest = {
  ticker: string;
  companyName?: string;
  sector?: string;
  modelType: 'dcf' | 'lbo' | 'three-statement' | 'comps' | 'scorecard';
  currency?: string;
  partialAssumptions: PartialDcfAssumptions;
  userNotes?: string;
};

/**
 * Default fallback values if OpenAI fails
 */
export const DEFAULT_DCF_ASSUMPTIONS: Partial<DcfAssumptions> = {
  taxRate: 0.21,              // US federal corporate rate
  daPctRevenue: 0.04,         // 4% of revenue
  capexPctRevenue: 0.035,     // 3.5% of revenue
  wcPctRevenue: 0.02,         // 2% of revenue
  wacc: 0.10,                 // 10% discount rate
  terminalGrowth: 0.025,      // 2.5% perpetual growth
};
