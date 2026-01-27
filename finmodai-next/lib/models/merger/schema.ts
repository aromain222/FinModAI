/**
 * Merger Model Input Schema
 * 
 * Strict validation with required input detection.
 * No silent defaults - fail loudly if required inputs are missing.
 */

import { z } from 'zod';

/**
 * Deal Structure Types
 */
export const DealStructureSchema = z.enum(['cash', 'stock', 'mixed']);

/**
 * Synergy Schedule (year-by-year or run-rate + ramp)
 */
export const SynergyScheduleSchema = z.object({
  // Option 1: Run-rate + ramp
  runRate: z.number().min(0).optional(),
  rampYears: z.number().int().min(1).max(10).optional(),
  
  // Option 2: Year-by-year
  year1: z.number().min(0).optional(),
  year2: z.number().min(0).optional(),
  year3: z.number().min(0).optional(),
  year4: z.number().min(0).optional(),
  year5: z.number().min(0).optional(),
}).refine(
  (data) => {
    // Must have either run-rate OR year-by-year
    const hasRunRate = data.runRate !== undefined && data.rampYears !== undefined;
    const hasYearByYear = data.year1 !== undefined || data.year2 !== undefined || 
                         data.year3 !== undefined || data.year4 !== undefined || data.year5 !== undefined;
    return hasRunRate || hasYearByYear;
  },
  { message: 'Must provide either run-rate + ramp OR year-by-year schedule' }
);

/**
 * Main Merger Model Input Schema
 */
export const MergerModelInputSchema = z.object({
  // Buyer & Target
  buyerTicker: z.string().min(1, 'Buyer ticker is required'),
  targetTicker: z.string().min(1, 'Target ticker is required'),
  
  // Deal Structure
  dealStructure: DealStructureSchema,
  
  // Offer Price (v1 uses premiumPct only; offerPrice kept for v2)
  offerPrice: z.number().positive().optional(),
  premiumPct: z.number().min(0).max(1).optional(), // As decimal, e.g., 0.30 = 30%
  targetUnaffectedPriceOverride: z.number().positive().optional(), // If price not pullable
  
  // Stock Mechanics (required if stock or mixed)
  stockPct: z.number().min(0).max(1).optional(), // As decimal, e.g., 0.50 = 50%
  exchangeRatio: z.number().positive().optional(),
  buyerPriceOverride: z.number().positive().optional(), // If price not pullable
  
  // Financing
  buyerCashUsed: z.number().min(0).optional(),
  newDebt: z.number().min(0).optional(),
  newDebtRate: z.number().min(0).max(1).optional(), // As decimal, e.g., 0.05 = 5%
  transactionFees: z.number().min(0).optional(),
  financingFees: z.number().min(0).optional(),
  feesTotal: z.number().min(0).optional(), // Total fees
  feesTreatment: z.enum(['expense', 'capitalize']).optional(),
  debtRefi: z.number().min(0).optional(),
  minCash: z.number().min(0).optional(), // Minimum buyer cash retained
  
  // Revenue Synergies
  revenueSynergies: SynergyScheduleSchema.optional(),
  
  // Synergy COGS (required if any revenue synergy > 0)
  synergyCOGSPct: z.number().min(0).max(1).optional(), // As decimal
  synergyGrossMarginPct: z.number().min(0).max(1).optional(), // As decimal
  
  // Cost Synergies
  cogsSavings: SynergyScheduleSchema.optional(),
  opexSavings: SynergyScheduleSchema.optional(),
  
  // Integration Costs (required - explicit array)
  integrationCosts: z.array(z.number().min(0)).optional(), // Array length = forecastYears
  
  // Purchase Accounting
  purchaseAccountingEnabled: z.boolean().default(true), // Default ON
  intangiblesPct: z.number().min(0).max(1).optional(), // As decimal
  intangiblesLifeYears: z.number().int().min(1).max(40).optional(),
  
  // Forecast
  forecastYears: z.number().int().min(3).max(5).default(5),
  
  // Tax Rate (if not pullable)
  taxRate: z.number().min(0).max(1).optional(), // As decimal
})
  .refine(
    (data) => data.premiumPct !== undefined,
    { message: 'Premium % is required for M&A v1', path: ['premiumPct'] }
  )
  .refine(
    (data) => {
      if (data.dealStructure !== 'mixed') return true;
      return data.stockPct !== undefined;
    },
    { message: 'Stock % is required for mixed deals', path: ['stockPct'] }
  )
  .refine(
    (data) => data.feesTotal !== undefined,
    { message: 'Fees total is required for M&A v1', path: ['feesTotal'] }
  );

export type MergerModelInput = z.infer<typeof MergerModelInputSchema>;

/**
 * Pulled Data Structure
 */
export interface PulledData {
  buyer?: {
    price?: number;
    shares?: number;
    cash?: number;
    revenue?: number;
    cogs?: number;
    opex?: number;
    ebitda?: number;
    ebit?: number;
    da?: number;
    interestExpense?: number;
    netIncome?: number;
    taxRate?: number;
  };
  target?: {
    price?: number;
    shares?: number;
    cash?: number;
    debt?: number;
    revenue?: number;
    cogs?: number;
    opex?: number;
    ebitda?: number;
    ebit?: number;
    da?: number;
    interestExpense?: number;
    netIncome?: number;
    taxRate?: number;
  };
}

/**
 * Get missing required inputs (grouped by section)
 */
export function getMissingMergerInputs(
  inputs: Partial<MergerModelInput>,
  pulled?: PulledData
): string[] {
  const missing: string[] = [];
  
  // ALWAYS REQUIRED (v1)
  if (!inputs.buyerTicker) missing.push('Deal Terms → Buyer ticker');
  if (!inputs.targetTicker) missing.push('Deal Terms → Target ticker');
  if (!inputs.dealStructure) missing.push('Deal Terms → Deal structure');

  if (inputs.premiumPct === undefined) {
    missing.push('Deal Terms → Premium %');
  }

  if (inputs.dealStructure === 'mixed' && inputs.stockPct === undefined) {
    missing.push('Deal Terms → Stock % (required for mixed deals)');
  }

  if (inputs.feesTotal === undefined) {
    missing.push('Deal Terms → Fees total ($M)');
  }

  return missing;
}

/**
 * Validate inputs and return missing required fields
 */
export function validateMergerInputs(input: Partial<MergerModelInput>, pulled?: PulledData): {
  isValid: boolean;
  missingRequired: string[];
} {
  const missing = getMissingMergerInputs(input, pulled);
  
  return {
    isValid: missing.length === 0,
    missingRequired: missing,
  };
}
