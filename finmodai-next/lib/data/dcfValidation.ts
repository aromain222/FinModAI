/**
 * DCF Validation
 * Validation types and utilities for DCF models
 */

export interface APIAttempt {
  provider: string;
  timestamp: string;
  success: boolean;
  error?: string;
  dataReturned?: boolean;
  latencyMs?: number;
}

export interface DCFValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  attempts?: APIAttempt[];
}

/**
 * Validate DCF inputs
 */
import { isDemoMode } from '@/lib/demo/isDemoMode';

export function validateDCFInputs(inputs: {
  ticker?: string;
  revenue?: number;
  revenueByYear?: number[];
  revenueLtm?: number | null;
  demoMode?: boolean;
  years?: number[];
  revenueGrowth?: number | number[];
  ebitdaMargin?: number | number[];
  ebitMargin?: number | number[];
  capexPctRevenue?: number | number[];
  capexPercentOfRevenue?: number | number[];
  nwcPctRevenue?: number | number[];
  changeInWCPercentOfRevenue?: number | number[];
  taxRate?: number;
  wacc?: number;
  terminalGrowth?: number;
  sharesOutstanding?: number;
  sharesOutstandingMillions?: number;
  [key: string]: any;
}): DCFValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const autoAssumed: string[] = [];

  const demoMode = typeof inputs.demoMode === 'boolean' ? inputs.demoMode : isDemoMode();

  const markAuto = (label: string) => {
    if (!autoAssumed.includes(label)) {
      autoAssumed.push(label);
    }
  };
  
  // Validate ticker
  if (!inputs.ticker || typeof inputs.ticker !== 'string' || inputs.ticker.trim().length === 0) {
    errors.push('Ticker is required');
  }

  // Hard stop: Projection years < 1 (if provided)
  if (Array.isArray(inputs.years) && inputs.years.length < 1) {
    errors.push('Projection years must be at least 1');
  }
  
  // Validate revenue
  const revenueSeries = Array.isArray(inputs.revenueByYear) ? inputs.revenueByYear : [];
  const hasSeriesRevenue = revenueSeries.some((v) => typeof v === 'number' && isFinite(v) && v > 0);
  const hasBaseRevenue = typeof inputs.revenue === 'number' && isFinite(inputs.revenue) && inputs.revenue > 0;
  const hasRevenueLtm =
    typeof inputs.revenueLtm === 'number' && isFinite(inputs.revenueLtm) && inputs.revenueLtm >= 0;
  if (!hasSeriesRevenue && !hasBaseRevenue && !(demoMode && hasRevenueLtm)) {
    errors.push('Revenue is missing and no fallback exists');
  } else if (typeof inputs.revenue === 'number' && isFinite(inputs.revenue) && inputs.revenue <= 0) {
    warnings.push('Revenue is non-positive; results may be unreliable');
  }
  
  // Validate revenue growth
  if (inputs.revenueGrowth === undefined || inputs.revenueGrowth === null) {
    markAuto('Revenue growth');
  } else {
    const growthArray = Array.isArray(inputs.revenueGrowth)
      ? inputs.revenueGrowth
      : [inputs.revenueGrowth];
    for (const growth of growthArray) {
      if (typeof growth !== 'number' || isNaN(growth)) {
        markAuto('Revenue growth');
        break;
      }
      if (growth < -0.5 || growth > 1.0) {
        warnings.push(`Revenue growth ${(growth * 100).toFixed(1)}% is outside typical range (-50% to 100%)`);
      }
    }
  }
  
  // Validate EBITDA margin (or EBIT margin if EBITDA not provided)
  const marginValue = inputs.ebitdaMargin ?? inputs.ebitMargin;
  if (marginValue === undefined || marginValue === null) {
    markAuto('EBITDA margin');
  } else {
    const marginArray = Array.isArray(marginValue) ? marginValue : [marginValue];
    for (const margin of marginArray) {
      if (typeof margin !== 'number' || isNaN(margin)) {
        markAuto('EBITDA margin');
        break;
      }
      if (margin < -0.5 || margin > 0.9) {
        warnings.push(`EBITDA margin ${(margin * 100).toFixed(1)}% is outside typical range (-50% to 90%)`);
      }
    }
  }
  
  // Validate capex % of revenue
  const capexValue = inputs.capexPctRevenue ?? inputs.capexPercentOfRevenue;
  if (capexValue === undefined || capexValue === null) {
    markAuto('Capex % of revenue');
  } else {
    const capexArray = Array.isArray(capexValue) ? capexValue : [capexValue];
    for (const capex of capexArray) {
      if (typeof capex !== 'number' || isNaN(capex)) {
        markAuto('Capex % of revenue');
        break;
      }
      if (capex < 0 || capex > 0.5) {
        warnings.push(`Capex % of revenue ${(capex * 100).toFixed(1)}% is outside typical range (0% to 50%)`);
      }
    }
  }
  
  // Validate ΔNWC % of revenue
  const nwcValue = inputs.nwcPctRevenue ?? inputs.changeInWCPercentOfRevenue;
  if (nwcValue === undefined || nwcValue === null) {
    markAuto('ΔNWC % of revenue');
  } else {
    const nwcArray = Array.isArray(nwcValue) ? nwcValue : [nwcValue];
    for (const nwc of nwcArray) {
      if (typeof nwc !== 'number' || isNaN(nwc)) {
        markAuto('ΔNWC % of revenue');
        break;
      }
      if (nwc < -0.5 || nwc > 0.5) {
        warnings.push(`ΔNWC % of revenue ${(nwc * 100).toFixed(1)}% is outside typical range (-50% to 50%)`);
      }
    }
  }
  
  // Validate WACC
  if (inputs.wacc === undefined || inputs.wacc === null || typeof inputs.wacc !== 'number' || isNaN(inputs.wacc)) {
    markAuto('Discount rate');
  } else if (inputs.wacc > 0.30) {
    warnings.push(`WACC ${(inputs.wacc * 100).toFixed(1)}% is very high (> 30%)`);
  }
  
  // Validate shares outstanding
  const shares = inputs.sharesOutstanding ?? inputs.sharesOutstandingMillions;
  if (shares === undefined || shares === null) {
    warnings.push('Shares outstanding missing; per-share outputs will be suppressed');
  } else if (typeof shares !== 'number' || isNaN(shares) || !isFinite(shares) || shares <= 0) {
    warnings.push('Shares outstanding invalid; per-share outputs will be suppressed');
  }
  
  // Validate terminal growth
  if (inputs.terminalGrowth === undefined || inputs.terminalGrowth === null || typeof inputs.terminalGrowth !== 'number' || isNaN(inputs.terminalGrowth)) {
    markAuto('Terminal growth');
  } else if (inputs.terminalGrowth < 0) {
    warnings.push('Terminal growth is negative');
  } else if (inputs.terminalGrowth > 0.05) {
    warnings.push(`Terminal growth ${(inputs.terminalGrowth * 100).toFixed(1)}% exceeds typical long-term GDP growth`);
  }
  
  // Validate WACC > terminal growth (required guardrail)
  if (typeof inputs.wacc === 'number' && typeof inputs.terminalGrowth === 'number') {
    if (inputs.wacc <= inputs.terminalGrowth) {
      errors.push('WACC must be greater than terminal growth rate');
    }
  }

  if (autoAssumed.length > 0) {
    warnings.push('Some assumptions were auto-filled using conservative defaults.');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate DCF outputs
 */
export function validateDCFOutputs(outputs: {
  enterpriseValue?: number;
  equityValue?: number;
  pricePerShare?: number;
  [key: string]: any;
}): DCFValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate enterprise value
  if (outputs.enterpriseValue !== undefined) {
    if (typeof outputs.enterpriseValue !== 'number' || isNaN(outputs.enterpriseValue)) {
      errors.push('Enterprise value must be a valid number');
    } else if (outputs.enterpriseValue < 0) {
      errors.push('Enterprise value cannot be negative');
    }
  }
  
  // Validate equity value
  if (outputs.equityValue !== undefined) {
    if (typeof outputs.equityValue !== 'number' || isNaN(outputs.equityValue)) {
      errors.push('Equity value must be a valid number');
    } else if (outputs.equityValue < 0) {
      warnings.push('Equity value is negative - company may be overleveraged');
    }
  }
  
  // Validate price per share
  if (outputs.pricePerShare !== undefined) {
    if (typeof outputs.pricePerShare !== 'number' || isNaN(outputs.pricePerShare)) {
      errors.push('Price per share must be a valid number');
    } else if (outputs.pricePerShare < 0) {
      errors.push('Price per share cannot be negative');
    } else if (outputs.pricePerShare === 0) {
      warnings.push('Price per share is zero');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Create an API attempt record
 */
export function createAPIAttempt(
  provider: string,
  success: boolean,
  error?: string,
  latencyMs?: number
): APIAttempt {
  return {
    provider,
    timestamp: new Date().toISOString(),
    success,
    error,
    dataReturned: success,
    latencyMs
  };
}

/**
 * Aggregate validation results
 */
export function aggregateValidationResults(
  ...results: DCFValidationResult[]
): DCFValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const allAttempts: APIAttempt[] = [];
  
  for (const result of results) {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
    if (result.attempts) {
      allAttempts.push(...result.attempts);
    }
  }
  
  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    attempts: allAttempts.length > 0 ? allAttempts : undefined
  };
}

// Stub functions for compatibility
export function formatValidationError(result: DCFValidationResult): string {
  if (result.errors.length > 0) {
    return `Validation errors: ${result.errors.join(', ')}`;
  }
  if (result.warnings.length > 0) {
    return `Validation warnings: ${result.warnings.join(', ')}`;
  }
  return 'Validation passed';
}

export function logValidationResult(result: DCFValidationResult, ticker?: string): void {
  const prefix = ticker ? `[${ticker}]` : '[Validation]';
  if (result.errors.length > 0) {
    console.error(`${prefix} Validation errors:`, result.errors);
  }
  if (result.warnings.length > 0) {
    console.warn(`${prefix} Validation warnings:`, result.warnings);
  }
  if (result.isValid && result.errors.length === 0) {
    console.log(`${prefix} Validation passed`);
  }
}
