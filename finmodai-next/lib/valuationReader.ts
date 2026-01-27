/**
 * Valuation Output Reader
 * 
 * Safely reads valuation outputs from Excel workbooks using named ranges.
 * Provides explainable, debuggable error messages when values are missing.
 */

import type ExcelJS from 'exceljs';
import { readNamedNumber, type ReadNamedNumberResult } from './workbookReader';
import { assertValuationInvariants, formatAssertionResults, type ValuationAssertionResult } from './valuationAssertions';

export interface ValuationOutputs {
  enterpriseValue?: number;
  equityValue?: number;
  netDebt?: number;
  sharesOutstanding?: number;
  missing: string[]; // List of missing fields with reasons
  assertions?: ValuationAssertionResult; // Invariant validation results
}

/**
 * Read all valuation outputs from a workbook using named ranges.
 * 
 * @param workbook - The ExcelJS workbook to read from
 * @returns Valuation outputs with missing reasons for any unavailable values
 * 
 * @example
 * const outputs = readValuationOutputs(workbook);
 * if (outputs.enterpriseValue !== undefined) {
 *   console.log(`EV: $${outputs.enterpriseValue}M`);
 * } else {
 *   console.warn(`EV missing: ${outputs.missing.find(m => m.includes('ENTERPRISE_VALUE'))}`);
 * }
 */
export function readValuationOutputs(workbook: ExcelJS.Workbook): ValuationOutputs {
  const missing: string[] = [];
  const outputs: ValuationOutputs = { missing };

  // Read Enterprise Value
  const evResult = readNamedNumber(workbook, 'CB_OUT_ENTERPRISE_VALUE');
  if (evResult.value !== undefined) {
    outputs.enterpriseValue = evResult.value;
  } else {
    missing.push(`Enterprise Value: ${evResult.missing}`);
  }

  // Read Equity Value
  const equityResult = readNamedNumber(workbook, 'CB_OUT_EQUITY_VALUE');
  if (equityResult.value !== undefined) {
    outputs.equityValue = equityResult.value;
  } else {
    missing.push(`Equity Value: ${equityResult.missing}`);
  }

  // Read Net Debt
  const netDebtResult = readNamedNumber(workbook, 'CB_OUT_NET_DEBT');
  if (netDebtResult.value !== undefined) {
    outputs.netDebt = netDebtResult.value;
  } else {
    missing.push(`Net Debt: ${netDebtResult.missing}`);
  }

  // Read Shares Outstanding
  const sharesResult = readNamedNumber(workbook, 'CB_OUT_SHARES_OUT');
  if (sharesResult.value !== undefined) {
    outputs.sharesOutstanding = sharesResult.value;
  } else {
    missing.push(`Shares Outstanding: ${sharesResult.missing}`);
  }

  // Run invariant assertions if we have the required values
  if (outputs.enterpriseValue !== undefined && 
      outputs.equityValue !== undefined && 
      outputs.netDebt !== undefined) {
    try {
      outputs.assertions = assertValuationInvariants(workbook);
      
      if (!outputs.assertions.passed) {
        console.error('[readValuationOutputs] ❌ Valuation invariants violated:');
        console.error(formatAssertionResults(outputs.assertions));
      } else if (outputs.assertions.warnings.length > 0) {
        console.warn('[readValuationOutputs] ⚠️  Valuation warnings:');
        console.warn(formatAssertionResults(outputs.assertions));
      }
    } catch (error) {
      console.error('[readValuationOutputs] Error running assertions:', error);
      // Don't fail the read if assertions fail - just log
    }
  }

  return outputs;
}

/**
 * Format missing reasons for logging/debugging.
 * 
 * @param outputs - Valuation outputs with missing reasons
 * @returns Formatted string for logging
 */
export function formatMissingReasons(outputs: ValuationOutputs): string {
  if (outputs.missing.length === 0) {
    return 'All valuation outputs available';
  }

  return `Missing valuation outputs:\n${outputs.missing.map(m => `  - ${m}`).join('\n')}`;
}

/**
 * Example log output when shares are missing:
 * 
 * ```
 * [readValuationOutputs] Missing valuation outputs:
 *   - Shares Outstanding: Named range 'CB_OUT_SHARES_OUT' does not exist. Available names: CB_OUT_ENTERPRISE_VALUE, CB_OUT_EQUITY_VALUE, CB_OUT_NET_DEBT
 * ```
 * 
 * Or if the named range exists but cell is empty:
 * ```
 * [readValuationOutputs] Missing valuation outputs:
 *   - Shares Outstanding: Named range 'CB_OUT_SHARES_OUT' (DCF Model!$B$45) is empty (null or undefined)
 * ```
 * 
 * Or if the value is non-numeric:
 * ```
 * [readValuationOutputs] Missing valuation outputs:
 *   - Shares Outstanding: Named range 'CB_OUT_SHARES_OUT' (DCF Model!$B$45) contains non-numeric string: "N/A"
 * ```
 */
