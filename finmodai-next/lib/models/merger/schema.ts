import { z } from 'zod';

// Synergy structures
const RevenueSynergiesSchema = z.object({
  runRate: z.number().optional(),
  rampYears: z.number().optional(),
  year1: z.number().optional(),
  year2: z.number().optional(),
  year3: z.number().optional(),
  year4: z.number().optional(),
  year5: z.number().optional(),
}).optional();

const CostSavingsSchema = z.object({
  runRate: z.number().optional(),
  rampYears: z.number().optional(),
}).optional();

export const MergerModelInputSchema = z.object({
  // REQUIRED FIELDS
  acquirerTicker: z.string().min(1, 'Acquirer ticker is required'),
  targetTicker: z.string().min(1, 'Target ticker is required'),
  purchasePrice: z.number().positive('Purchase price must be positive'),
  
  // OPTIONAL FIELDS - Deal Structure
  dealStructure: z.enum(['cash', 'stock', 'mixed']).optional(),
  offerPrice: z.number().positive().optional(),
  premiumPct: z.number().optional(), // Store as decimal (0.25 = 25%)
  
  // OPTIONAL FIELDS - Consideration Mix
  cashPct: z.number().min(0).max(1).optional(), // Store as decimal
  stockPct: z.number().min(0).max(1).optional(), // Store as decimal
  debtPct: z.number().min(0).max(1).optional(), // Store as decimal
  exchangeRatio: z.number().optional(),
  
  // OPTIONAL FIELDS - Fees & Costs
  transactionFeesPct: z.number().min(0).max(0.1).optional(), // Store as decimal
  feesTotal: z.number().optional(),
  feesTreatment: z.enum(['capitalized', 'expensed']).optional(),
  
  // OPTIONAL FIELDS - Model Settings
  forecastYears: z.number().int().min(3).max(5).optional().default(5),
  taxRate: z.number().min(0).max(1).optional(), // Store as decimal
  
  // OPTIONAL FIELDS - Financing
  buyerCashUsed: z.number().optional(),
  newDebt: z.number().optional(),
  newDebtRate: z.number().optional(), // Store as decimal
  foregoneCashYield: z.number().optional(), // Store as decimal
  minCash: z.number().optional(),
  
  // OPTIONAL FIELDS - Synergies (Simple)
  synergies: z.number().optional(),
  
  // OPTIONAL FIELDS - Synergies (Detailed)
  revenueSynergies: RevenueSynergiesSchema,
  cogsSavings: z.number().optional(),
  opexSavings: z.number().optional(),
  costSynergiesPct: z.number().optional(), // Store as decimal
  synergyCOGSPct: z.number().optional(), // Store as decimal
  synergyGrossMarginPct: z.number().optional(), // Store as decimal
  
  // OPTIONAL FIELDS - Integration Costs
  oneTimeCosts: z.number().optional(),
  integrationCosts: z.array(z.number()).optional(), // Array of costs per year
  
  // OPTIONAL FIELDS - Purchase Accounting
  purchaseAccountingEnabled: z.boolean().optional().default(false),
  intangiblesPct: z.number().min(0).max(1).optional(), // Store as decimal
  intangiblesLifeYears: z.number().int().min(1).max(40).optional(),
  intangibleAmortizationYears: z.number().int().min(1).max(40).optional(),
}).transform((data) => {
  // Normalize field names: support both buyerTicker and acquirerTicker
  const normalized: any = { ...data };
  
  // If buyerTicker is provided (legacy), map it to acquirerTicker
  if ((data as any).buyerTicker && !data.acquirerTicker) {
    normalized.acquirerTicker = (data as any).buyerTicker;
  }
  
  // Ensure consideration mix adds up to 1.0 (within tolerance)
  if (data.cashPct !== undefined || data.stockPct !== undefined || data.debtPct !== undefined) {
    const cash = data.cashPct || 0;
    const stock = data.stockPct || 0;
    const debt = data.debtPct || 0;
    const total = cash + stock + debt;
    
    if (Math.abs(total - 1.0) > 0.01 && total > 0) {
      // Normalize to 1.0
      normalized.cashPct = cash / total;
      normalized.stockPct = stock / total;
      normalized.debtPct = debt / total;
    }
  }
  
  // Validate integrationCosts length matches forecastYears
  if (data.integrationCosts && data.forecastYears) {
    if (data.integrationCosts.length !== data.forecastYears) {
      throw new Error(`integrationCosts array length (${data.integrationCosts.length}) must equal forecastYears (${data.forecastYears})`);
    }
  }
  
  return normalized;
});

export type MergerModelInput = z.infer<typeof MergerModelInputSchema>;

/**
 * Get missing required merger inputs
 * @param inputs - Partial merger inputs
 * @param pulledData - Optional data pulled from APIs (for conditional requirements)
 */
export function getMissingMergerInputs(
  inputs: Partial<MergerModelInput>,
  pulledData?: any
): string[] {
  const missing: string[] = [];
  
  // Required fields
  if (!inputs.acquirerTicker && !(inputs as any).buyerTicker) {
    missing.push('acquirerTicker');
  }
  if (!inputs.targetTicker) {
    missing.push('targetTicker');
  }
  if (!inputs.purchasePrice && !inputs.offerPrice) {
    missing.push('purchasePrice or offerPrice');
  }
  
  // Conditional requirements
  if (inputs.newDebt && inputs.newDebt > 0 && !inputs.newDebtRate) {
    missing.push('newDebtRate (required when newDebt > 0)');
  }
  
  if (inputs.dealStructure === 'stock' || inputs.dealStructure === 'mixed') {
    if (!inputs.exchangeRatio && !inputs.stockPct) {
      missing.push('exchangeRatio or stockPct (required for stock/mixed deals)');
    }
  }
  
  return missing;
}

/**
 * Validate merger inputs with detailed error messages
 */
export function validateMergerInputs(inputs: MergerModelInput): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate purchase price
  if (inputs.purchasePrice <= 0) {
    errors.push('Purchase price must be positive');
  }
  
  // Validate consideration mix
  if (inputs.cashPct !== undefined || inputs.stockPct !== undefined || inputs.debtPct !== undefined) {
    const cash = inputs.cashPct || 0;
    const stock = inputs.stockPct || 0;
    const debt = inputs.debtPct || 0;
    const total = cash + stock + debt;
    
    if (Math.abs(total - 1.0) > 0.01) {
      errors.push(`Consideration mix must add up to 100% (currently ${(total * 100).toFixed(1)}%)`);
    }
  }
  
  // Validate forecast years
  if (inputs.forecastYears && (inputs.forecastYears < 3 || inputs.forecastYears > 5)) {
    errors.push('Forecast years must be between 3 and 5');
  }
  
  // Validate integration costs array
  if (inputs.integrationCosts && inputs.forecastYears) {
    if (inputs.integrationCosts.length !== inputs.forecastYears) {
      errors.push(`Integration costs array length must equal forecast years (${inputs.forecastYears})`);
    }
  }
  
  // Validate intangibles
  if (inputs.purchaseAccountingEnabled) {
    if (inputs.intangiblesPct && (inputs.intangiblesPct < 0 || inputs.intangiblesPct > 1)) {
      errors.push('Intangibles % must be between 0% and 100%');
    }
    if (inputs.intangiblesLifeYears && (inputs.intangiblesLifeYears < 1 || inputs.intangiblesLifeYears > 40)) {
      errors.push('Intangibles life must be between 1 and 40 years');
    }
  }
  
  // Validate percentages are in decimal format (0-1)
  const percentFields = [
    'premiumPct', 'cashPct', 'stockPct', 'debtPct', 'transactionFeesPct',
    'taxRate', 'newDebtRate', 'foregoneCashYield', 'costSynergiesPct',
    'synergyCOGSPct', 'synergyGrossMarginPct', 'intangiblesPct'
  ];
  
  percentFields.forEach(field => {
    const value = inputs[field as keyof MergerModelInput];
    if (typeof value === 'number' && (value < 0 || value > 1)) {
      errors.push(`${field} must be between 0 and 1 (as decimal)`);
    }
  });
  
  return { isValid: errors.length === 0, errors };
}
