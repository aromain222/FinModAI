/**
 * Model Input Validation
 * Validate model inputs
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingKeys?: string[];
}

type ValidationOptions = {
  quickLbo?: boolean;
};

export function validateModelInputs(
  inputs: Record<string, any>,
  options: ValidationOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingKeys: string[] = [];
  
  // Note: ticker and modelType are validated separately in the form submission handler
  // This function only validates model-specific inputs
  
  // Check numeric fields
  if (inputs.revenue !== undefined && (typeof inputs.revenue !== 'number' || inputs.revenue <= 0)) {
    errors.push('Revenue must be a positive number');
  }
  
  // LBO-specific validations - required deal inputs
  const requireNumber = (
    key: string,
    label: string,
    opts?: { min?: number; max?: number; missingKey?: string }
  ) => {
    const value = inputs[key];
    if (value === undefined || value === null || value === '') {
      errors.push(`${label} is required`);
      missingKeys.push(opts?.missingKey || key);
      return;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${label} must be a valid number`);
      missingKeys.push(opts?.missingKey || key);
      return;
    }
    if (opts?.min !== undefined && value < opts.min) {
      errors.push(`${label} must be at least ${opts.min}`);
      missingKeys.push(opts?.missingKey || key);
    }
    if (opts?.max !== undefined && value > opts.max) {
      errors.push(`${label} must be at most ${opts.max}`);
      missingKeys.push(opts?.missingKey || key);
    }
  };

  requireNumber('entryMultiple', 'Entry Multiple (EV/EBITDA)', { min: 0.1, missingKey: 'entry_multiple' });
  requireNumber('exitMultiple', 'Exit Multiple (EV/EBITDA)', { min: 0.1, missingKey: 'exit_multiple' });
  requireNumber('debtPercent', 'Debt %', { min: 0, max: 100, missingKey: 'debt_percent' });
  requireNumber('interestRate', 'Interest Rate', { min: 0, max: 1, missingKey: 'interest_rate' });
  requireNumber('revenueGrowth', 'Revenue Growth', { min: -1, max: 2, missingKey: 'revenue_growth' });
  requireNumber('holdingPeriodYears', 'Holding Period (Years)', { min: 1, max: 15, missingKey: 'holding_period_years' });

  if (!options.quickLbo) {
    requireNumber('transactionFeesPercent', 'Transaction Fees', { min: 0, max: 1, missingKey: 'transaction_fees_percent' });
    requireNumber('exitFeesPercent', 'Exit Fees', { min: 0, max: 1, missingKey: 'exit_fees_percent' });
    requireNumber('equityPercent', 'Equity %', { min: 0, max: 100, missingKey: 'equity_percent' });
    requireNumber('amortizationPercent', 'Mandatory Amortization', { min: 0, max: 1, missingKey: 'amortization_percent' });
    requireNumber('cashSweepPercent', 'Cash Sweep', { min: 0, max: 1, missingKey: 'cash_sweep_percent' });
    requireNumber('ebitdaMargin', 'EBITDA Margin', { min: 0, max: 1, missingKey: 'ebitda_margin' });
    requireNumber('capexPctRevenue', 'Capex % Revenue', { min: 0, max: 1, missingKey: 'capex_pct_revenue' });
    requireNumber('deltaNwcPctRevenue', 'ΔNWC % Revenue', { min: -1, max: 1, missingKey: 'delta_nwc_pct_revenue' });
    requireNumber('taxRate', 'Tax Rate', { min: 0, max: 1, missingKey: 'tax_rate' });
  }

  if (
    typeof inputs.debtPercent === 'number' &&
    Number.isFinite(inputs.debtPercent) &&
    (
      options.quickLbo ||
      (typeof inputs.equityPercent === 'number' && Number.isFinite(inputs.equityPercent))
    )
  ) {
    const equityPercent = options.quickLbo ? 100 - inputs.debtPercent : inputs.equityPercent;
    const effectiveMixTotal = inputs.debtPercent + equityPercent;
    if (Math.abs(effectiveMixTotal - 100) > 0.5) {
      errors.push('Financing mix must sum to 100%');
      if (!missingKeys.includes('debt_percent')) missingKeys.push('debt_percent');
      if (!missingKeys.includes('equity_percent')) missingKeys.push('equity_percent');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    missingKeys,
  };
}
