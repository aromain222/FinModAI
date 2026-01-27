/**
 * Hardened LBO Generation Pipeline
 * 
 * Provides error transparency, input validation, deterministic fallbacks,
 * math safety, identity enforcement, and step tracking.
 */

import type { NextResponse } from 'next/server';
import { safeNumber } from '@/lib/utils/safeNumber';
import { validateLBOInputs } from '@/lib/modeling/lboValidation';
import type { LboEngineOutput } from '@/lib/lboEngine';

export type LBOGenerationStep =
  | 'validate-inputs'
  | 'build-operating-model'
  | 'build-debt-schedule'
  | 'calculate-returns'
  | 'generate-workbook';

export interface LBOGenerationError {
  error: 'LBO_GENERATION_FAILED';
  message: string;
  stack?: string;
  step: LBOGenerationStep;
  warnings?: string[];
  fieldErrors?: Array<{ field: string; message: string }>;
}

/**
 * Create deterministic fallbacks for optional LBO inputs
 */
export function createLBOFallbacks(params: {
  revenueGrowth?: number;
  ebitdaMargin?: number;
  capexPercent?: number;
  daPercent?: number;
  debtAmortizationPercent?: number;
  exitMultiple?: number;
  entryMultiple?: number;
  taxRate?: number;
}): {
  revenueGrowth: number;
  ebitdaMargin: number;
  capexPercent: number;
  daPercent: number;
  debtAmortizationPercent: number;
  exitMultiple: number;
  taxRate: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  const revenueGrowth = safeNumber(params.revenueGrowth);
  if (!revenueGrowth || !Number.isFinite(revenueGrowth)) {
    warnings.push('revenueGrowth: using default 3%');
  }
  const finalRevenueGrowth = safeNumber(params.revenueGrowth) || 0.03;
  
  const ebitdaMargin = safeNumber(params.ebitdaMargin);
  if (!ebitdaMargin || !Number.isFinite(ebitdaMargin) || ebitdaMargin <= 0) {
    warnings.push('ebitdaMargin: using default 20%');
  }
  const finalEbitdaMargin = (safeNumber(params.ebitdaMargin) || 0.20);
  
  const capexPercent = safeNumber(params.capexPercent);
  if (!capexPercent || !Number.isFinite(capexPercent)) {
    warnings.push('capexPercent: using default 3% of revenue');
  }
  const finalCapexPercent = safeNumber(params.capexPercent) || 0.03;
  
  const daPercent = safeNumber(params.daPercent);
  if (!daPercent || !Number.isFinite(daPercent)) {
    warnings.push('daPercent: using default 2% of revenue');
  }
  const finalDaPercent = safeNumber(params.daPercent) || 0.02;
  
  const debtAmortizationPercent = safeNumber(params.debtAmortizationPercent);
  if (!debtAmortizationPercent || !Number.isFinite(debtAmortizationPercent)) {
    warnings.push('debtAmortizationPercent: using default 5% annually');
  }
  const finalDebtAmortizationPercent = safeNumber(params.debtAmortizationPercent) || 0.05;
  
  const exitMultiple = safeNumber(params.exitMultiple);
  const entryMultiple = safeNumber(params.entryMultiple);
  if (!exitMultiple || !Number.isFinite(exitMultiple)) {
    warnings.push('exitMultiple: using entry multiple as default');
  }
  const finalExitMultiple = (safeNumber(params.exitMultiple) || entryMultiple || 10);
  
  const taxRate = safeNumber(params.taxRate);
  if (!taxRate || !Number.isFinite(taxRate)) {
    warnings.push('taxRate: using default 21%');
  }
  const finalTaxRate = safeNumber(params.taxRate) || 0.21;
  
  return {
    revenueGrowth: finalRevenueGrowth,
    ebitdaMargin: finalEbitdaMargin,
    capexPercent: finalCapexPercent,
    daPercent: finalDaPercent,
    debtAmortizationPercent: finalDebtAmortizationPercent,
    exitMultiple: finalExitMultiple,
    taxRate: finalTaxRate,
    warnings,
  };
}

/**
 * Validate Excel sheet before writing
 */
export function validateExcelSheet(
  workbook: any,
  sheetName: string
): { valid: boolean; error?: string } {
  try {
    // Validate sheet name
    if (!sheetName || typeof sheetName !== 'string') {
      return { valid: false, error: 'Sheet name must be a non-empty string' };
    }
    
    // Check for duplicate sheet names
    if (workbook && workbook.worksheets) {
      const existingSheets = workbook.worksheets.map((s: any) => s.name);
      if (existingSheets.includes(sheetName)) {
        return { valid: false, error: `Sheet name "${sheetName}" already exists` };
      }
    }
    
    // Validate sheet name characters (Excel has restrictions)
    if (sheetName.length > 31) {
      return { valid: false, error: 'Sheet name must be <= 31 characters' };
    }
    
    const invalidChars = /[\\/?*\[\]]/;
    if (invalidChars.test(sheetName)) {
      return { valid: false, error: 'Sheet name contains invalid characters' };
    }
    
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: `Sheet validation error: ${error.message}` };
  }
}

/**
 * Safe Excel cell write (replace invalid values with 0 or "N/A")
 */
export function writeExcelCellSafe(
  cell: any,
  value: any,
  isNumeric: boolean = true
): void {
  try {
    if (isNumeric) {
      const safeValue = safeNumber(value);
      cell.value = safeValue;
    } else {
      if (value === null || value === undefined) {
        cell.value = 'N/A';
      } else if (typeof value === 'string') {
        cell.value = value;
      } else {
        cell.value = String(value);
      }
    }
  } catch (error: any) {
    console.warn('[LBO] Failed to write cell value:', error.message);
    if (isNumeric) {
      cell.value = 0;
    } else {
      cell.value = 'N/A';
    }
  }
}

