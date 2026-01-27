/**
 * Sanitize Financial Assumptions
 * 
 * Ensures all financial assumptions are:
 * 1. Stored as decimals (0.10 for 10%, NOT 10 or "10%")
 * 2. Clamped to realistic ranges
 * 3. Valid numbers (not NaN, null, or undefined)
 * 
 * This prevents insane outputs like "Tax rate 2100%" or "Capex intensity 600%"
 */

import type { ThreeStatementAssumptions } from '@/types/threeStatementAssumptions';

/**
 * Realistic bounds for financial metrics (as decimals)
 */
export const ASSUMPTION_BOUNDS = {
  // Growth rates
  revenueCagr: { min: -0.50, max: 0.50 },        // -50% to +50%
  revenueGrowth: { min: -0.50, max: 0.50 },      // -50% to +50%
  
  // Margins
  grossMargin: { min: -0.20, max: 0.90 },        // -20% to +90%
  ebitMargin: { min: -0.20, max: 0.60 },         // -20% to +60%
  ebitdaMargin: { min: -0.20, max: 0.70 },       // -20% to +70%
  
  // Operating metrics
  cogsPct: { min: 0.10, max: 1.20 },             // 10% to 120%
  opexPct: { min: 0.01, max: 0.80 },             // 1% to 80%
  
  // Tax and interest
  taxRate: { min: 0, max: 0.50 },                // 0% to 50%
  interestRate: { min: 0, max: 0.20 },           // 0% to 20%
  
  // Capital allocation
  capexPctRevenue: { min: 0, max: 0.25 },        // 0% to 25%
  daPct: { min: 0, max: 0.20 },                  // 0% to 20%
  dAndAPctRevenue: { min: 0, max: 0.20 },        // 0% to 20%
  
  // Working capital
  wcPctRevenue: { min: -0.10, max: 0.20 },       // -10% to +20%
  arDays: { min: 0, max: 180 },                  // 0 to 180 days
  inventoryDays: { min: 0, max: 365 },           // 0 to 365 days
  apDays: { min: 0, max: 180 },                  // 0 to 180 days
  
  // Valuation
  wacc: { min: 0.03, max: 0.30 },                // 3% to 30%
  terminalGrowth: { min: 0, max: 0.05 },         // 0% to 5%
  
  // Absolute values
  revenue: { min: 1, max: 10_000_000 },          // $1M to $10T
  debt: { min: 0, max: 10_000_000 },             // $0 to $10T
  cash: { min: 0, max: 10_000_000 },             // $0 to $10T
  sharesOutstanding: { min: 0.1, max: 100_000 }, // 0.1M to 100B shares
};

/**
 * Validation errors
 */
export interface ValidationError {
  field: string;
  value: any;
  issue: string;
  suggestion?: string;
}

export interface SanitizationResult {
  sanitized: ThreeStatementAssumptions;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert potential percentage to decimal
 * Handles: 10, "10", "10%", 0.10
 * Returns: 0.10
 */
function toDecimal(value: any): number | null {
  if (value === null || value === undefined) return null;
  
  // Handle string percentages
  if (typeof value === 'string') {
    const cleaned = value.trim().replace('%', '');
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    
    // If > 1, assume it's a percentage that needs division
    if (parsed > 1) {
      return parsed / 100;
    }
    return parsed;
  }
  
  // Handle numbers
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) return null;
    
    // If > 1 and looks like a percentage (e.g., 10 for 10%), convert
    // Exception: revenue, debt, cash, shares can be > 1
    return value;
  }
  
  return null;
}

/**
 * Sanitize a single percentage field
 */
function sanitizePercentage(
  value: any,
  fieldName: string,
  bounds: { min: number; max: number },
  errors: ValidationError[],
  warnings: ValidationError[]
): number {
  const decimal = toDecimal(value);
  
  if (decimal === null) {
    errors.push({
      field: fieldName,
      value,
      issue: 'Invalid or missing value',
      suggestion: `Using default: ${((bounds.min + bounds.max) / 2 * 100).toFixed(1)}%`,
    });
    return (bounds.min + bounds.max) / 2;
  }
  
  // If value is way outside bounds (e.g., 2100 for tax rate), it's likely a percentage that needs conversion
  if (decimal > 1 && bounds.max <= 1) {
    const converted = decimal / 100;
    if (converted >= bounds.min && converted <= bounds.max) {
      warnings.push({
        field: fieldName,
        value: decimal,
        issue: `Value appears to be a percentage (${decimal}), converting to decimal (${converted})`,
      });
      return converted;
    }
  }
  
  // Clamp to bounds
  const clamped = clamp(decimal, bounds.min, bounds.max);
  
  if (clamped !== decimal) {
    warnings.push({
      field: fieldName,
      value: decimal,
      issue: `Value ${(decimal * 100).toFixed(1)}% outside realistic range [${(bounds.min * 100).toFixed(1)}%, ${(bounds.max * 100).toFixed(1)}%]`,
      suggestion: `Clamped to ${(clamped * 100).toFixed(1)}%`,
    });
  }
  
  return clamped;
}

/**
 * Sanitize an array of percentages
 */
function sanitizePercentageArray(
  values: any[] | undefined,
  fieldName: string,
  bounds: { min: number; max: number },
  errors: ValidationError[],
  warnings: ValidationError[],
  defaultLength: number = 5
): number[] {
  if (!values || !Array.isArray(values) || values.length === 0) {
    const defaultValue = (bounds.min + bounds.max) / 2;
    errors.push({
      field: fieldName,
      value: values,
      issue: 'Missing or invalid array',
      suggestion: `Using default array of ${defaultLength} values at ${(defaultValue * 100).toFixed(1)}%`,
    });
    return Array(defaultLength).fill(defaultValue);
  }
  
  return values.map((val, idx) => 
    sanitizePercentage(val, `${fieldName}[${idx}]`, bounds, errors, warnings)
  );
}

/**
 * Sanitize absolute value (revenue, debt, etc.)
 */
function sanitizeAbsolute(
  value: any,
  fieldName: string,
  bounds: { min: number; max: number },
  errors: ValidationError[],
  warnings: ValidationError[]
): number {
  const num = typeof value === 'number' ? value : parseFloat(value);
  
  if (isNaN(num) || !isFinite(num)) {
    errors.push({
      field: fieldName,
      value,
      issue: 'Invalid or missing value',
      suggestion: `Using default: ${bounds.min}`,
    });
    return bounds.min;
  }
  
  const clamped = clamp(num, bounds.min, bounds.max);
  
  if (clamped !== num) {
    warnings.push({
      field: fieldName,
      value: num,
      issue: `Value outside realistic range [${bounds.min}, ${bounds.max}]`,
      suggestion: `Clamped to ${clamped}`,
    });
  }
  
  return clamped;
}

/**
 * Main sanitization function
 */
export function sanitizeAssumptions(
  assumptions: Partial<ThreeStatementAssumptions>
): SanitizationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  // Sanitize years
  const years = assumptions.years || [2024, 2025, 2026, 2027, 2028];
  const forecastLength = years.length;
  
  // Sanitize revenue
  const revenue = assumptions.revenue && Array.isArray(assumptions.revenue)
    ? assumptions.revenue.map((val, idx) => 
        sanitizeAbsolute(val, `revenue[${idx}]`, ASSUMPTION_BOUNDS.revenue, errors, warnings)
      )
    : [sanitizeAbsolute(assumptions.revenue || 1000, 'revenue', ASSUMPTION_BOUNDS.revenue, errors, warnings)];
  
  // Check for zero or negative starting revenue (critical error)
  if (revenue[0] <= 0) {
    errors.push({
      field: 'revenue[0]',
      value: revenue[0],
      issue: 'Starting revenue must be positive',
      suggestion: 'Cannot generate model with zero or negative revenue',
    });
  }
  
  // Sanitize growth rates
  const revenueGrowth = sanitizePercentageArray(
    assumptions.revenueGrowth,
    'revenueGrowth',
    ASSUMPTION_BOUNDS.revenueGrowth,
    errors,
    warnings,
    forecastLength
  );
  
  // Sanitize margins
  const cogsPct = sanitizePercentageArray(
    assumptions.cogsPct,
    'cogsPct',
    ASSUMPTION_BOUNDS.cogsPct,
    errors,
    warnings,
    forecastLength
  );
  
  const opexPct = sanitizePercentageArray(
    assumptions.opexPct,
    'opexPct',
    ASSUMPTION_BOUNDS.opexPct,
    errors,
    warnings,
    forecastLength
  );
  
  const daPct = sanitizePercentageArray(
    assumptions.daPct,
    'daPct',
    ASSUMPTION_BOUNDS.daPct,
    errors,
    warnings,
    forecastLength
  );
  
  // Sanitize tax rate
  const taxRate = sanitizePercentage(
    assumptions.taxRate,
    'taxRate',
    ASSUMPTION_BOUNDS.taxRate,
    errors,
    warnings
  );
  
  // Sanitize interest rate
  const interestRate = sanitizePercentage(
    assumptions.interestRate,
    'interestRate',
    ASSUMPTION_BOUNDS.interestRate,
    errors,
    warnings
  );
  
  // Sanitize capex
  const capexPctRevenue = sanitizePercentageArray(
    assumptions.capexPctRevenue,
    'capexPctRevenue',
    ASSUMPTION_BOUNDS.capexPctRevenue,
    errors,
    warnings,
    forecastLength
  );
  
  // Sanitize working capital days
  const arDays = sanitizeAbsolute(
    assumptions.arDays || 45,
    'arDays',
    ASSUMPTION_BOUNDS.arDays,
    errors,
    warnings
  );
  
  const inventoryDays = sanitizeAbsolute(
    assumptions.inventoryDays || 60,
    'inventoryDays',
    ASSUMPTION_BOUNDS.inventoryDays,
    errors,
    warnings
  );
  
  const apDays = sanitizeAbsolute(
    assumptions.apDays || 30,
    'apDays',
    ASSUMPTION_BOUNDS.apDays,
    errors,
    warnings
  );
  
  // Sanitize debt and cash
  const debt = sanitizeAbsolute(
    assumptions.debt || 0,
    'debt',
    ASSUMPTION_BOUNDS.debt,
    errors,
    warnings
  );
  
  const startingCash = sanitizeAbsolute(
    assumptions.startingCash || 100,
    'startingCash',
    ASSUMPTION_BOUNDS.cash,
    errors,
    warnings
  );
  
  // Sanitize shares
  const sharesOutstanding = sanitizeAbsolute(
    assumptions.sharesOutstanding || 100,
    'sharesOutstanding',
    ASSUMPTION_BOUNDS.sharesOutstanding,
    errors,
    warnings
  );
  
  // Build sanitized assumptions
  const sanitized: ThreeStatementAssumptions = {
    years,
    revenue,
    revenueGrowth,
    cogsPct,
    opexPct,
    daPct,
    taxRate,
    interestRate,
    capexPctRevenue,
    arDays,
    inventoryDays,
    apDays,
    debt,
    startingCash,
    sharesOutstanding,
    // Preserve other fields
    companyName: assumptions.companyName || 'Unknown',
    ticker: assumptions.ticker || 'N/A',
    currency: assumptions.currency || 'USD',
    sector: assumptions.sector,
    dataSource: assumptions.dataSource || 'sanitized',
    generatedAt: assumptions.generatedAt || new Date().toISOString(),
  };
  
  return {
    sanitized,
    errors,
    warnings,
  };
}

/**
 * Validate that sanitized assumptions are safe to use
 * Throws error if critical issues found
 */
export function validateSanitizedAssumptions(result: SanitizationResult): void {
  const criticalErrors = result.errors.filter(err => 
    err.field.includes('revenue[0]') || 
    err.issue.includes('Cannot generate')
  );
  
  if (criticalErrors.length > 0) {
    const errorMessages = criticalErrors.map(err => 
      `${err.field}: ${err.issue}${err.suggestion ? ` (${err.suggestion})` : ''}`
    ).join('; ');
    
    throw new Error(`Critical validation errors: ${errorMessages}`);
  }
  
  // Check for NaN values in sanitized output
  const { sanitized } = result;
  const nanFields: string[] = [];
  
  if (isNaN(sanitized.taxRate)) nanFields.push('taxRate');
  if (isNaN(sanitized.interestRate)) nanFields.push('interestRate');
  if (isNaN(sanitized.debt)) nanFields.push('debt');
  if (isNaN(sanitized.startingCash)) nanFields.push('startingCash');
  if (isNaN(sanitized.sharesOutstanding)) nanFields.push('sharesOutstanding');
  
  if (sanitized.revenue.some(isNaN)) nanFields.push('revenue');
  if (sanitized.revenueGrowth.some(isNaN)) nanFields.push('revenueGrowth');
  if (sanitized.cogsPct.some(isNaN)) nanFields.push('cogsPct');
  if (sanitized.opexPct.some(isNaN)) nanFields.push('opexPct');
  if (sanitized.daPct.some(isNaN)) nanFields.push('daPct');
  if (sanitized.capexPctRevenue.some(isNaN)) nanFields.push('capexPctRevenue');
  
  if (nanFields.length > 0) {
    throw new Error(`NaN values detected in sanitized assumptions: ${nanFields.join(', ')}`);
  }
}

/**
 * Format sanitization result for logging
 */
export function formatSanitizationLog(result: SanitizationResult): string {
  const lines: string[] = [];
  
  if (result.errors.length > 0) {
    lines.push('❌ ERRORS:');
    result.errors.forEach(err => {
      lines.push(`  - ${err.field}: ${err.issue}${err.suggestion ? ` → ${err.suggestion}` : ''}`);
    });
  }
  
  if (result.warnings.length > 0) {
    lines.push('⚠️  WARNINGS:');
    result.warnings.forEach(warn => {
      lines.push(`  - ${warn.field}: ${warn.issue}${warn.suggestion ? ` → ${warn.suggestion}` : ''}`);
    });
  }
  
  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push('✅ All assumptions within realistic bounds');
  }
  
  return lines.join('\n');
}

