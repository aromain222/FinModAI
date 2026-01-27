/**
 * LBO Input Validation
 * 
 * Strict schema validation for LBO model inputs.
 * Fails fast with field-level errors.
 */

export interface LBOValidationInputs {
  entryEBITDA?: number;
  purchaseMultiple?: number;
  debtPercent?: number;
  interestRate?: number;
  minCash?: number;
  years?: number;
  revenueGrowth?: number;
  ebitdaMargin?: number;
  capexPercent?: number;
  daPercent?: number;
  debtAmortizationPercent?: number;
  exitMultiple?: number;
  taxRate?: number;
}

export interface LBOValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
  warnings: string[];
  validatedInputs?: Required<Pick<LBOValidationInputs, 'entryEBITDA' | 'purchaseMultiple' | 'debtPercent' | 'interestRate' | 'minCash' | 'years'>> &
    Partial<Omit<LBOValidationInputs, 'entryEBITDA' | 'purchaseMultiple' | 'debtPercent' | 'interestRate' | 'minCash' | 'years'>>;
}

/**
 * Validate LBO inputs with strict schema
 */
export function validateLBOInputs(inputs: LBOValidationInputs): LBOValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: string[] = [];

  // Required fields
  if (inputs.entryEBITDA === undefined || inputs.entryEBITDA === null) {
    errors.push({ field: 'entryEBITDA', message: 'Entry EBITDA is required' });
  } else if (!Number.isFinite(inputs.entryEBITDA) || inputs.entryEBITDA <= 0) {
    errors.push({ field: 'entryEBITDA', message: 'Entry EBITDA must be a positive number' });
  }

  if (inputs.purchaseMultiple === undefined || inputs.purchaseMultiple === null) {
    errors.push({ field: 'purchaseMultiple', message: 'Purchase multiple is required' });
  } else if (!Number.isFinite(inputs.purchaseMultiple) || inputs.purchaseMultiple <= 0) {
    errors.push({ field: 'purchaseMultiple', message: 'Purchase multiple must be a positive number' });
  }

  if (inputs.debtPercent === undefined || inputs.debtPercent === null) {
    errors.push({ field: 'debtPercent', message: 'Debt percent is required' });
  } else if (!Number.isFinite(inputs.debtPercent) || inputs.debtPercent < 0 || inputs.debtPercent > 1) {
    errors.push({ field: 'debtPercent', message: 'Debt percent must be between 0 and 1' });
  }

  if (inputs.interestRate === undefined || inputs.interestRate === null) {
    errors.push({ field: 'interestRate', message: 'Interest rate is required' });
  } else if (!Number.isFinite(inputs.interestRate) || inputs.interestRate < 0 || inputs.interestRate > 1) {
    errors.push({ field: 'interestRate', message: 'Interest rate must be between 0 and 1' });
  }

  if (inputs.minCash === undefined || inputs.minCash === null) {
    errors.push({ field: 'minCash', message: 'Minimum cash is required' });
  } else if (!Number.isFinite(inputs.minCash) || inputs.minCash < 0) {
    errors.push({ field: 'minCash', message: 'Minimum cash must be >= 0' });
  }

  if (inputs.years === undefined || inputs.years === null) {
    errors.push({ field: 'years', message: 'Forecast years is required' });
  } else if (!Number.isInteger(inputs.years) || inputs.years < 3) {
    errors.push({ field: 'years', message: 'Forecast years must be an integer >= 3' });
  }

  // Optional fields validation (warnings only)
  if (inputs.revenueGrowth !== undefined && inputs.revenueGrowth !== null) {
    if (!Number.isFinite(inputs.revenueGrowth) || inputs.revenueGrowth < -0.5 || inputs.revenueGrowth > 1) {
      warnings.push('Revenue growth outside normal range (-50% to 100%), using default');
    }
  }

  if (inputs.ebitdaMargin !== undefined && inputs.ebitdaMargin !== null) {
    if (!Number.isFinite(inputs.ebitdaMargin) || inputs.ebitdaMargin < 0 || inputs.ebitdaMargin > 1) {
      warnings.push('EBITDA margin outside normal range (0 to 100%), using default');
    }
  }

  if (inputs.taxRate !== undefined && inputs.taxRate !== null) {
    if (!Number.isFinite(inputs.taxRate) || inputs.taxRate < 0 || inputs.taxRate > 1) {
      warnings.push('Tax rate outside normal range (0 to 100%), using default');
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  return {
    valid: true,
    errors,
    warnings,
    validatedInputs: {
      entryEBITDA: inputs.entryEBITDA!,
      purchaseMultiple: inputs.purchaseMultiple!,
      debtPercent: inputs.debtPercent!,
      interestRate: inputs.interestRate!,
      minCash: inputs.minCash!,
      years: inputs.years!,
      revenueGrowth: inputs.revenueGrowth,
      ebitdaMargin: inputs.ebitdaMargin,
      capexPercent: inputs.capexPercent,
      daPercent: inputs.daPercent,
      debtAmortizationPercent: inputs.debtAmortizationPercent,
      exitMultiple: inputs.exitMultiple,
      taxRate: inputs.taxRate,
    },
  };
}

