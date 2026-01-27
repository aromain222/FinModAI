/**
 * Model Input Schemas
 * 
 * Single source of truth for all model input validation.
 * Used by LBO, Comps, and Merger models.
 */

import { z } from 'zod';

// ============================================================================
// SHARED SCHEMAS
// ============================================================================

/**
 * Ticker normalization: always uppercase, trimmed
 */
export const TickerSchema = z.string().trim().min(1).transform((val) => val.toUpperCase());

/**
 * Percentage as decimal (0.0 to 1.0)
 */
export const PercentSchema = z.number().min(0).max(1);

/**
 * Positive number
 */
export const PositiveNumberSchema = z.number().positive();

/**
 * Non-negative number
 */
export const NonNegativeNumberSchema = z.number().min(0);

/**
 * Year range
 */
export const ForecastYearsSchema = z.number().int().min(3).max(5).default(5);

// ============================================================================
// LBO INPUT SCHEMA
// ============================================================================

export const LBOInputSchema = z.object({
  // Target company (required)
  ticker: TickerSchema,
  companyName: z.preprocess(
    (v) => (v == null ? '' : v),
    z.string()
  ).optional(),
  
  // Entry assumptions
  currentPrice: PositiveNumberSchema.optional().nullable(),
  sharesOutstanding: PositiveNumberSchema.optional().nullable(),
  ltmRevenue: PositiveNumberSchema.optional().nullable(),
  ltmEBITDA: PositiveNumberSchema.optional().nullable(),
  ltmEBIT: PositiveNumberSchema.optional().nullable(),
  currentNetDebt: z.number().optional().nullable(), // Can be negative
  
  // Transaction
  offerPremium: PercentSchema.optional().nullable(),
  entryMultiple: PositiveNumberSchema.optional().nullable(),
  exitMultiple: PositiveNumberSchema.optional().nullable(),
  
  // Operating projections
  projectionYears: ForecastYearsSchema.optional(),
  revenueGrowth: z.array(PercentSchema.optional().nullable()).optional(),
  ebitdaMargin: z.array(PercentSchema.optional().nullable()).optional(),
  daPercent: PercentSchema.optional().nullable(),
  taxRate: PercentSchema.optional().nullable(),
  capexPercent: z.array(PercentSchema.optional().nullable()).optional(),
  nwcPercent: PercentSchema.optional().nullable(),
  
  // Debt structure
  targetLeverage: PositiveNumberSchema.optional().nullable(), // Net Debt / EBITDA
  
  // Interest rates (as decimals)
  revolverRate: PercentSchema.optional().nullable(),
  termLoanARate: PercentSchema.optional().nullable(),
  termLoanBRate: PercentSchema.optional().nullable(),
  seniorNotesRate: PercentSchema.optional().nullable(),
  subNotesRate: PercentSchema.optional().nullable(),
  
  // Amortization
  termLoanAAmortization: PercentSchema.optional().nullable(),
  
  // Other
  managementRollover: PercentSchema.optional().nullable(),
  transactionFees: PercentSchema.optional().nullable(),
  minimumCash: NonNegativeNumberSchema.optional().nullable(),
});

export type LBOInput = z.infer<typeof LBOInputSchema>;

// ============================================================================
// COMPS INPUT SCHEMA
// ============================================================================

export const CompsInputSchema = z.object({
  // Target company (required)
  ticker: TickerSchema,
  
  // Peer companies (optional, will be auto-identified if missing)
  symbols: z.array(TickerSchema).min(1).max(20).optional(),
  peers: z.array(TickerSchema).min(1).max(20).optional(),
  peerTickers: z.array(TickerSchema).min(1).max(20).optional(),
  
  // Custom multiples overrides (optional)
  customMultiples: z.object({
    evToRevenue: PositiveNumberSchema.optional(),
    evToEBITDA: PositiveNumberSchema.optional(),
    evToEBIT: PositiveNumberSchema.optional(),
    pe: PositiveNumberSchema.optional(),
  }).optional(),
});

export type CompsInput = z.infer<typeof CompsInputSchema>;

// ============================================================================
// MERGER INPUT SCHEMA
// ============================================================================

/**
 * Synergy schedule (year-by-year or run-rate + ramp)
 */
export const SynergyScheduleSchema = z.object({
  // Option 1: Run-rate + ramp
  runRate: NonNegativeNumberSchema.optional(),
  rampYears: z.number().int().min(1).max(10).optional(),
  
  // Option 2: Year-by-year
  year1: NonNegativeNumberSchema.optional(),
  year2: NonNegativeNumberSchema.optional(),
  year3: NonNegativeNumberSchema.optional(),
  year4: NonNegativeNumberSchema.optional(),
  year5: NonNegativeNumberSchema.optional(),
}).refine(
  (data) => {
    const hasRunRate = data.runRate !== undefined && data.rampYears !== undefined;
    const hasYearByYear = data.year1 !== undefined || data.year2 !== undefined || 
                         data.year3 !== undefined || data.year4 !== undefined || data.year5 !== undefined;
    return hasRunRate || hasYearByYear;
  },
  { message: 'Must provide either run-rate + ramp OR year-by-year schedule' }
);

/**
 * Deal structure type
 */
export const DealStructureSchema = z.enum(['cash', 'stock', 'mixed']);

export const MergerInputSchema = z.object({
  // Buyer & Target (required)
  buyerTicker: TickerSchema,
  targetTicker: TickerSchema,
  
  // Deal Structure (required)
  dealStructure: DealStructureSchema,
  
  // Offer Price (either offerPrice OR premiumPct required)
  offerPrice: PositiveNumberSchema.optional(),
  premiumPct: PercentSchema.optional(),
  targetUnaffectedPriceOverride: PositiveNumberSchema.optional(),
  
  // Stock Mechanics (required if stock or mixed)
  stockPct: PercentSchema.optional(),
  exchangeRatio: PositiveNumberSchema.optional(),
  buyerPriceOverride: PositiveNumberSchema.optional(),
  
  // Financing
  buyerCashUsed: NonNegativeNumberSchema.optional(),
  newDebt: NonNegativeNumberSchema.optional(),
  newDebtRate: PercentSchema.optional(),
  transactionFees: NonNegativeNumberSchema.optional(),
  financingFees: NonNegativeNumberSchema.optional(),
  feesTotal: NonNegativeNumberSchema.optional(),
  feesTreatment: z.enum(['expense', 'capitalize']).optional(),
  debtRefi: NonNegativeNumberSchema.optional(),
  minCash: NonNegativeNumberSchema.optional(),
  
  // Revenue Synergies
  revenueSynergies: SynergyScheduleSchema.optional(),
  
  // Synergy COGS (required if revenue synergies exist)
  synergyCOGSPct: PercentSchema.optional(),
  synergyGrossMarginPct: PercentSchema.optional(),
  
  // Cost Synergies
  cogsSavings: SynergyScheduleSchema.optional(),
  opexSavings: SynergyScheduleSchema.optional(),
  
  // Integration Costs (required - explicit array matching forecastYears)
  integrationCosts: z.array(NonNegativeNumberSchema).optional(),
  
  // Purchase Accounting
  purchaseAccountingEnabled: z.boolean().default(true),
  intangiblesPct: PercentSchema.optional(),
  intangiblesLifeYears: z.number().int().min(1).max(40).optional(),
  
  // Forecast
  forecastYears: ForecastYearsSchema,
  
  // Tax Rate
  taxRate: PercentSchema.optional(),
}).refine(
  (data) => data.offerPrice !== undefined || data.premiumPct !== undefined,
  { message: 'Either offerPrice or premiumPct is required', path: ['offerPrice'] }
).refine(
  (data) => {
    if (data.dealStructure === 'cash') return true;
    return data.stockPct !== undefined || data.exchangeRatio !== undefined;
  },
  { message: 'If using stock, either stockPct or exchangeRatio is required', path: ['stockPct'] }
).refine(
  (data) => {
    if (!data.integrationCosts) return false;
    return data.integrationCosts.length === data.forecastYears;
  },
  { message: 'Integration costs array must match forecast years length', path: ['integrationCosts'] }
).refine(
  (data) => {
    return data.feesTotal !== undefined || (data.transactionFees !== undefined && data.financingFees !== undefined);
  },
  { message: 'Either feesTotal or both transactionFees and financingFees are required', path: ['feesTotal'] }
);

export type MergerInput = z.infer<typeof MergerInputSchema>;

// ============================================================================
// UNIFIED MODEL INPUT (discriminated union)
// ============================================================================

export const ModelInputSchema = z.discriminatedUnion('modelType', [
  z.object({ modelType: z.literal('lbo'), ...LBOInputSchema.shape }),
  z.object({ modelType: z.literal('comps'), ...CompsInputSchema.shape }),
  z.object({ modelType: z.literal('merger'), ...MergerInputSchema.shape }),
]);

export type ModelInput = z.infer<typeof ModelInputSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate and normalize ticker symbol
 */
export function normalizeTicker(ticker: unknown): string {
  return TickerSchema.parse(ticker);
}

/**
 * Validate model input based on model type
 */
export function validateModelInput<T extends ModelInput['modelType']>(
  modelType: T,
  input: unknown
): T extends 'lbo' ? LBOInput : T extends 'comps' ? CompsInput : MergerInput {
  switch (modelType) {
    case 'lbo':
      return LBOInputSchema.parse(input) as any;
    case 'comps':
      return CompsInputSchema.parse(input) as any;
    case 'merger':
      return MergerInputSchema.parse(input) as any;
    default:
      throw new Error(`Unknown model type: ${modelType}`);
  }
}
