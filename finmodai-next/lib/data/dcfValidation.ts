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
export function validateDCFInputs(inputs: {
  ticker?: string;
  revenue?: number;
  revenueGrowth?: number | number[];
  wacc?: number;
  terminalGrowth?: number;
  [key: string]: any;
}): DCFValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate ticker
  if (!inputs.ticker || typeof inputs.ticker !== 'string' || inputs.ticker.trim().length === 0) {
    errors.push('Ticker is required');
  }
  
  // Validate revenue
  if (inputs.revenue === undefined || inputs.revenue === null) {
    errors.push('Revenue is required');
  } else if (typeof inputs.revenue !== 'number' || isNaN(inputs.revenue)) {
    errors.push('Revenue must be a valid number');
  } else if (inputs.revenue <= 0) {
    errors.push('Revenue must be positive');
  }
  
  // Validate revenue growth
  if (inputs.revenueGrowth !== undefined) {
    const growthArray = Array.isArray(inputs.revenueGrowth) 
      ? inputs.revenueGrowth 
      : [inputs.revenueGrowth];
    
    for (const growth of growthArray) {
      if (typeof growth !== 'number' || isNaN(growth)) {
        errors.push('Revenue growth must be a valid number');
        break;
      }
      if (growth < -0.5 || growth > 1.0) {
        warnings.push(`Revenue growth ${(growth * 100).toFixed(1)}% is outside typical range (-50% to 100%)`);
      }
    }
  }
  
  // Validate WACC
  if (inputs.wacc !== undefined) {
    if (typeof inputs.wacc !== 'number' || isNaN(inputs.wacc)) {
      errors.push('WACC must be a valid number');
    } else if (inputs.wacc <= 0) {
      errors.push('WACC must be positive');
    } else if (inputs.wacc > 0.30) {
      warnings.push(`WACC ${(inputs.wacc * 100).toFixed(1)}% is very high (> 30%)`);
    }
  }
  
  // Validate terminal growth
  if (inputs.terminalGrowth !== undefined) {
    if (typeof inputs.terminalGrowth !== 'number' || isNaN(inputs.terminalGrowth)) {
      errors.push('Terminal growth must be a valid number');
    } else if (inputs.terminalGrowth < 0) {
      warnings.push('Terminal growth is negative');
    } else if (inputs.terminalGrowth > 0.05) {
      warnings.push(`Terminal growth ${(inputs.terminalGrowth * 100).toFixed(1)}% exceeds typical long-term GDP growth`);
    }
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
