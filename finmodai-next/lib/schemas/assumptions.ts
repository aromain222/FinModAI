/**
 * Assumptions Schemas
 * 
 * Reusable assumption structures shared across models.
 * Used for normalization, validation, and UI display.
 */

import { z } from 'zod';

// ============================================================================
// SHARED ASSUMPTION SCHEMAS
// ============================================================================

/**
 * Operating assumptions (revenue growth, margins, etc.)
 */
export const OperatingAssumptionsSchema = z.object({
  // Revenue
  revenue: z.array(z.number().finite().positive()).optional(),
  revenueGrowth: z.array(z.number().min(-0.5).max(0.5)).optional(), // As decimal
  
  // Margins
  cogsPct: z.array(z.number().min(0).max(1)).optional(), // As decimal
  opexPct: z.array(z.number().min(0).max(1)).optional(), // As decimal
  ebitdaMargin: z.array(z.number().min(-1).max(1)).optional(), // As decimal
  ebitMargin: z.array(z.number().min(-1).max(1)).optional(), // As decimal
  
  // D&A and Capex
  daPct: z.array(z.number().min(0).max(0.2)).optional(), // As decimal
  daPercent: z.number().min(0).max(0.2).optional(), // Single value, as decimal
  capexPctRevenue: z.array(z.number().min(0).max(0.25)).optional(), // As decimal
  capexPercent: z.number().min(0).max(0.25).optional(), // Single value, as decimal
  
  // Working capital
  nwcPercent: z.number().min(-1).max(1).optional(), // As decimal
  arDays: z.number().int().min(0).max(180).optional(),
  inventoryDays: z.number().int().min(0).max(365).optional(),
  apDays: z.number().int().min(0).max(180).optional(),
});

export type OperatingAssumptions = z.infer<typeof OperatingAssumptionsSchema>;

/**
 * Capital structure assumptions
 */
export const CapitalStructureAssumptionsSchema = z.object({
  // Debt
  debt: z.number().finite().nonnegative().optional(),
  netDebt: z.number().finite().optional(), // Can be negative
  targetLeverage: z.number().finite().positive().optional(), // Net Debt / EBITDA
  newDebt: z.number().finite().nonnegative().optional(),
  debtRefi: z.number().finite().nonnegative().optional(),
  
  // Debt structure (for LBO)
  revolver: z.number().finite().nonnegative().optional(),
  termLoanA: z.number().finite().nonnegative().optional(),
  termLoanB: z.number().finite().nonnegative().optional(),
  seniorNotes: z.number().finite().nonnegative().optional(),
  subNotes: z.number().finite().nonnegative().optional(),
  
  // Interest rates (as decimals)
  interestRate: z.number().min(0).max(0.2).optional(),
  revolverRate: z.number().min(0).max(0.2).optional(),
  termLoanARate: z.number().min(0).max(0.2).optional(),
  termLoanBRate: z.number().min(0).max(0.2).optional(),
  seniorNotesRate: z.number().min(0).max(0.2).optional(),
  subNotesRate: z.number().min(0).max(0.2).optional(),
  newDebtRate: z.number().min(0).max(0.2).optional(),
  
  // Amortization
  termLoanAAmortization: z.number().min(0).max(1).optional(), // % per year, as decimal
  
  // Equity
  sharesOutstanding: z.number().finite().positive().optional(),
  managementRollover: z.number().min(0).max(1).optional(), // As decimal
  managementRolloverPct: z.number().min(0).max(1).optional(), // As decimal
  
  // Cash
  startingCash: z.number().finite().nonnegative().optional(),
  minimumCash: z.number().finite().nonnegative().optional(),
  minCash: z.number().finite().nonnegative().optional(),
  buyerCashUsed: z.number().finite().nonnegative().optional(),
});

export type CapitalStructureAssumptions = z.infer<typeof CapitalStructureAssumptionsSchema>;

/**
 * Valuation assumptions
 */
export const ValuationAssumptionsSchema = z.object({
  // Entry/Exit multiples
  entryMultiple: z.number().finite().positive().optional(),
  exitMultiple: z.number().finite().positive().optional(),
  offerPremium: z.number().min(-0.5).max(2).optional(), // As decimal (can be negative for discount)
  premiumPct: z.number().min(-0.5).max(2).optional(), // As decimal
  
  // Discount rates
  wacc: z.number().min(0).max(0.5).optional(), // As decimal
  terminalGrowth: z.number().min(-0.05).max(0.1).optional(), // As decimal (must be < wacc)
  
  // Tax
  taxRate: z.number().min(0).max(0.5).optional(), // As decimal
});

export type ValuationAssumptions = z.infer<typeof ValuationAssumptionsSchema>;

/**
 * Transaction assumptions (for Merger/LBO)
 */
export const TransactionAssumptionsSchema = z.object({
  // Fees
  transactionFees: z.number().finite().nonnegative().optional(),
  financingFees: z.number().finite().nonnegative().optional(),
  feesTotal: z.number().finite().nonnegative().optional(),
  feesTreatment: z.enum(['expense', 'capitalize']).optional(),
  
  // Forecast years
  projectionYears: z.number().int().min(3).max(5).optional(),
  forecastYears: z.number().int().min(3).max(5).optional(),
});

export type TransactionAssumptions = z.infer<typeof TransactionAssumptionsSchema>;

// ============================================================================
// UNIFIED ASSUMPTIONS SCHEMA
// ============================================================================

/**
 * Unified assumptions structure (used for normalization)
 */
export const UnifiedAssumptionsSchema = z.object({
  // Ticker normalization
  ticker: z.string().trim().min(1).transform((val) => val.toUpperCase()).optional(),
  symbol: z.string().trim().min(1).transform((val) => val.toUpperCase()).optional(),
  symbols: z.array(z.string().trim().min(1).transform((val) => val.toUpperCase())).optional(),
  
  // Nested assumptions
  operating: OperatingAssumptionsSchema.optional(),
  capitalStructure: CapitalStructureAssumptionsSchema.optional(),
  valuation: ValuationAssumptionsSchema.optional(),
  transaction: TransactionAssumptionsSchema.optional(),
  
  // Flattened assumptions (for backward compatibility)
}).merge(OperatingAssumptionsSchema.partial())
  .merge(CapitalStructureAssumptionsSchema.partial())
  .merge(ValuationAssumptionsSchema.partial())
  .merge(TransactionAssumptionsSchema.partial())
  .passthrough(); // Allow additional fields for model-specific assumptions

export type UnifiedAssumptions = z.infer<typeof UnifiedAssumptionsSchema>;

// ============================================================================
// NORMALIZATION HELPERS
// ============================================================================

/**
 * Normalize ticker field (handles ticker, symbol, nested assumptions)
 */
export function normalizeTickerField(assumptions: Record<string, any>): string | null {
  // Check top-level fields first
  if (typeof assumptions.ticker === 'string' && assumptions.ticker.trim().length > 0) {
    return assumptions.ticker.trim().toUpperCase();
  }
  if (typeof assumptions.symbol === 'string' && assumptions.symbol.trim().length > 0) {
    return assumptions.symbol.trim().toUpperCase();
  }
  
  // Check nested structures
  if (assumptions.lbo && typeof assumptions.lbo.ticker === 'string') {
    return assumptions.lbo.ticker.trim().toUpperCase();
  }
  if (assumptions.mergerInputs && typeof assumptions.mergerInputs.buyerTicker === 'string') {
    return assumptions.mergerInputs.buyerTicker.trim().toUpperCase();
  }
  
  return null;
}

/**
 * Normalize assumptions structure (flattens nested, normalizes tickers)
 */
export function normalizeAssumptions(assumptions: Record<string, any>): UnifiedAssumptions {
  const normalized: Partial<UnifiedAssumptions> = {};
  
  // Normalize ticker
  const ticker = normalizeTickerField(assumptions);
  if (ticker) {
    normalized.ticker = ticker;
  }
  
  // Copy over all fields (passthrough schema allows this)
  Object.assign(normalized, assumptions);
  
  // Normalize nested structures if present
  if (assumptions.operating && typeof assumptions.operating === 'object') {
    normalized.operating = OperatingAssumptionsSchema.partial().parse(assumptions.operating);
  }
  if (assumptions.capitalStructure && typeof assumptions.capitalStructure === 'object') {
    normalized.capitalStructure = CapitalStructureAssumptionsSchema.partial().parse(assumptions.capitalStructure);
  }
  if (assumptions.valuation && typeof assumptions.valuation === 'object') {
    normalized.valuation = ValuationAssumptionsSchema.partial().parse(assumptions.valuation);
  }
  if (assumptions.transaction && typeof assumptions.transaction === 'object') {
    normalized.transaction = TransactionAssumptionsSchema.partial().parse(assumptions.transaction);
  }
  
  return UnifiedAssumptionsSchema.parse(normalized);
}
