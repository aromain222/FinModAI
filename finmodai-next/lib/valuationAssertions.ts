/**
 * Valuation Invariant Assertions
 * 
 * Runtime assertions to ensure financial model invariants always hold:
 * - Equity Value = Enterprise Value – Net Debt
 * - Price / Share = Equity Value / Shares Outstanding
 * - Units are consistent (actual vs millions)
 */

import type ExcelJS from 'exceljs';
import { readNamedNumber, readNamedText } from './workbookReader';

export type UnitsMode = 'mm' | 'actual';

export interface ValuationAssertionResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValuationData {
  enterpriseValue?: number;
  equityValue?: number;
  netDebt?: number;
  sharesOutstanding?: number;
  pricePerShare?: number;
  units?: UnitsMode;
}

/**
 * Read units metadata from workbook.
 * 
 * @param workbook - The ExcelJS workbook
 * @returns Units mode ("mm" for millions, "actual" for full dollars) or null if not found
 */
export function readUnitsMetadata(workbook: ExcelJS.Workbook): UnitsMode | null {
  const result = readNamedText(workbook, 'CB_META_UNITS');
  if (result.value === undefined) {
    return null;
  }
  
  const normalized = result.value.toLowerCase().trim();
  if (normalized === 'mm' || normalized === 'millions' || normalized === 'm') {
    return 'mm';
  }
  if (normalized === 'actual' || normalized === 'full' || normalized === 'dollars') {
    return 'actual';
  }
  
  // Default to millions if unclear
  return 'mm';
}

/**
 * Assert that Equity Value = Enterprise Value – Net Debt
 * 
 * @param data - Valuation data
 * @param tolerance - Allowed tolerance for floating point comparison (default: 0.01)
 * @returns Assertion result
 */
export function assertEquityValueInvariant(
  data: ValuationData,
  tolerance: number = 0.01
): ValuationAssertionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data.enterpriseValue === undefined || data.equityValue === undefined || data.netDebt === undefined) {
    errors.push('Cannot verify Equity Value = Enterprise Value – Net Debt: missing required values');
    return { passed: false, errors, warnings };
  }

  const expectedEquityValue = data.enterpriseValue - data.netDebt;
  const difference = Math.abs(data.equityValue - expectedEquityValue);
  const relativeError = data.enterpriseValue !== 0 
    ? (difference / Math.abs(data.enterpriseValue)) * 100 
    : difference;

  if (difference > tolerance) {
    const errorMsg = `Equity Value invariant violated: Expected ${expectedEquityValue.toFixed(2)}, got ${data.equityValue.toFixed(2)} (difference: ${difference.toFixed(2)}, ${relativeError.toFixed(2)}% error)`;
    
    // If error is very large (>1%), it's a critical error
    if (relativeError > 1) {
      errors.push(errorMsg);
    } else {
      warnings.push(errorMsg);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Assert that Price / Share = Equity Value / Shares Outstanding
 * 
 * @param data - Valuation data
 * @param tolerance - Allowed tolerance for floating point comparison (default: 0.01)
 * @returns Assertion result
 */
export function assertPricePerShareInvariant(
  data: ValuationData,
  tolerance: number = 0.01
): ValuationAssertionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data.equityValue === undefined || data.sharesOutstanding === undefined) {
    // If price per share is provided but we can't verify, that's a warning
    if (data.pricePerShare !== undefined) {
      warnings.push('Cannot verify Price / Share = Equity Value / Shares Outstanding: missing shares or equity value');
    }
    return { passed: true, errors, warnings };
  }

  if (data.sharesOutstanding <= 0) {
    if (data.pricePerShare !== undefined && data.pricePerShare > 0) {
      errors.push('Price / Share provided but shares outstanding is zero or negative');
    }
    return { passed: errors.length === 0, errors, warnings };
  }

  if (data.pricePerShare === undefined) {
    // Price per share not provided - that's okay, just a warning
    warnings.push('Price / Share not provided in model (may be computed elsewhere)');
    return { passed: true, errors, warnings };
  }

  const expectedPricePerShare = data.equityValue / data.sharesOutstanding;
  const difference = Math.abs(data.pricePerShare - expectedPricePerShare);
  const relativeError = expectedPricePerShare !== 0 
    ? (difference / Math.abs(expectedPricePerShare)) * 100 
    : difference;

  if (difference > tolerance) {
    const errorMsg = `Price / Share invariant violated: Expected ${expectedPricePerShare.toFixed(2)}, got ${data.pricePerShare.toFixed(2)} (difference: ${difference.toFixed(2)}, ${relativeError.toFixed(2)}% error)`;
    
    if (relativeError > 1) {
      errors.push(errorMsg);
    } else {
      warnings.push(errorMsg);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Assert that units are consistent across all valuation outputs.
 * 
 * @param data - Valuation data with units metadata
 * @returns Assertion result
 */
export function assertUnitsConsistency(data: ValuationData): ValuationAssertionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data.units === undefined || data.units === null) {
    warnings.push('Units metadata (CB_META_UNITS) not found - assuming millions (mm)');
    return { passed: true, errors, warnings };
  }

  // Check for values that seem inconsistent with stated units
  // If units are "mm" (millions), values should be in reasonable millions range
  // If units are "actual", values should be in full dollars range
  
  const checkValue = (value: number | undefined, label: string) => {
    if (value === undefined) return;
    
    if (data.units === 'mm') {
      // Millions: values should typically be in thousands to billions range
      // Very large values (>1e6) might indicate actual dollars instead of millions
      if (Math.abs(value) > 1_000_000) {
        warnings.push(`${label} (${value.toFixed(2)}) seems large for millions - verify units are correct`);
      }
    } else if (data.units === 'actual') {
      // Actual dollars: values should be very large (millions or more)
      // Very small values (<1000) might indicate millions instead of actual
      if (Math.abs(value) < 1000 && Math.abs(value) > 0.01) {
        warnings.push(`${label} (${value.toFixed(2)}) seems small for actual dollars - verify units are correct`);
      }
    }
  };

  checkValue(data.enterpriseValue, 'Enterprise Value');
  checkValue(data.equityValue, 'Equity Value');
  checkValue(data.netDebt, 'Net Debt');

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run all valuation assertions on a workbook.
 * 
 * @param workbook - The ExcelJS workbook to validate
 * @returns Combined assertion results
 */
export function assertValuationInvariants(workbook: ExcelJS.Workbook): ValuationAssertionResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Read units metadata
  const units = readUnitsMetadata(workbook);

  // Read valuation outputs
  const evResult = readNamedNumber(workbook, 'CB_OUT_ENTERPRISE_VALUE');
  const equityResult = readNamedNumber(workbook, 'CB_OUT_EQUITY_VALUE');
  const netDebtResult = readNamedNumber(workbook, 'CB_OUT_NET_DEBT');
  const sharesResult = readNamedNumber(workbook, 'CB_OUT_SHARES_OUT');
  const priceResult = readNamedNumber(workbook, 'CB_OUT_PRICE_PER_SHARE').value !== undefined
    ? readNamedNumber(workbook, 'CB_OUT_PRICE_PER_SHARE')
    : { value: undefined, missing: 'Not provided' };

  const data: ValuationData = {
    enterpriseValue: evResult.value,
    equityValue: equityResult.value,
    netDebt: netDebtResult.value,
    sharesOutstanding: sharesResult.value,
    pricePerShare: priceResult.value,
    units: units ?? undefined,
  };

  // Run assertions
  const equityInvariant = assertEquityValueInvariant(data);
  const priceInvariant = assertPricePerShareInvariant(data);
  const unitsConsistency = assertUnitsConsistency(data);

  allErrors.push(...equityInvariant.errors);
  allErrors.push(...priceInvariant.errors);
  allErrors.push(...unitsConsistency.errors);

  allWarnings.push(...equityInvariant.warnings);
  allWarnings.push(...priceInvariant.warnings);
  allWarnings.push(...unitsConsistency.warnings);

  return {
    passed: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Format assertion results for logging/display.
 * 
 * @param result - Assertion result
 * @returns Formatted string
 */
export function formatAssertionResults(result: ValuationAssertionResult): string {
  if (result.passed && result.warnings.length === 0) {
    return '✅ All valuation invariants passed';
  }

  const parts: string[] = [];

  if (!result.passed) {
    parts.push('❌ VALIDATION ERRORS:');
    result.errors.forEach((error, idx) => {
      parts.push(`  ${idx + 1}. ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push('⚠️  WARNINGS:');
    result.warnings.forEach((warning, idx) => {
      parts.push(`  ${idx + 1}. ${warning}`);
    });
  }

  return parts.join('\n');
}
