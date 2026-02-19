/**
 * Sanitize Assumptions
 * Validates and cleans financial model assumptions
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export type SanitizationResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; error: { code: string; message: string; details?: any }; warnings: string[] };

export interface AssumptionBounds {
  min?: number;
  max?: number;
  recommended?: { min: number; max: number };
}

/**
 * Validate revenue growth assumptions
 */
export function validateRevenueGrowth(growth: number | number[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const growthArray = Array.isArray(growth) ? growth : [growth];
  
  for (const g of growthArray) {
    if (typeof g !== 'number' || isNaN(g)) {
      errors.push('Revenue growth must be a valid number');
    } else if (g < -0.5) {
      errors.push(`Revenue growth ${(g * 100).toFixed(1)}% is unrealistically negative (< -50%)`);
    } else if (g > 1.0) {
      errors.push(`Revenue growth ${(g * 100).toFixed(1)}% is unrealistically high (> 100%)`);
    } else if (g < -0.2) {
      warnings.push(`Revenue growth ${(g * 100).toFixed(1)}% is very negative`);
    } else if (g > 0.5) {
      warnings.push(`Revenue growth ${(g * 100).toFixed(1)}% is very aggressive`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate margin assumptions
 */
export function validateMargin(margin: number | number[], name: string = 'Margin'): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const marginArray = Array.isArray(margin) ? margin : [margin];
  
  for (const m of marginArray) {
    if (typeof m !== 'number' || isNaN(m)) {
      errors.push(`${name} must be a valid number`);
    } else if (m < 0) {
      errors.push(`${name} ${(m * 100).toFixed(1)}% cannot be negative`);
    } else if (m > 1.0) {
      errors.push(`${name} ${(m * 100).toFixed(1)}% cannot exceed 100%`);
    } else if (m > 0.7) {
      warnings.push(`${name} ${(m * 100).toFixed(1)}% is unusually high`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate WACC assumptions
 */
export function validateWACC(wacc: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (typeof wacc !== 'number' || isNaN(wacc)) {
    errors.push('WACC must be a valid number');
  } else if (wacc <= 0) {
    errors.push('WACC must be positive');
  } else if (wacc > 0.30) {
    errors.push(`WACC ${(wacc * 100).toFixed(1)}% is unrealistically high (> 30%)`);
  } else if (wacc < 0.05) {
    warnings.push(`WACC ${(wacc * 100).toFixed(1)}% is very low`);
  } else if (wacc > 0.20) {
    warnings.push(`WACC ${(wacc * 100).toFixed(1)}% is very high`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate terminal growth rate
 */
export function validateTerminalGrowth(terminalGrowth: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (typeof terminalGrowth !== 'number' || isNaN(terminalGrowth)) {
    errors.push('Terminal growth must be a valid number');
  } else if (terminalGrowth < 0) {
    errors.push('Terminal growth cannot be negative');
  } else if (terminalGrowth > 0.05) {
    errors.push(`Terminal growth ${(terminalGrowth * 100).toFixed(1)}% exceeds long-term GDP growth (typically < 5%)`);
  } else if (terminalGrowth > 0.04) {
    warnings.push(`Terminal growth ${(terminalGrowth * 100).toFixed(1)}% is at the high end`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate tax rate
 */
export function validateTaxRate(taxRate: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (typeof taxRate !== 'number' || isNaN(taxRate)) {
    errors.push('Tax rate must be a valid number');
  } else if (taxRate < 0) {
    errors.push('Tax rate cannot be negative');
  } else if (taxRate > 0.50) {
    errors.push(`Tax rate ${(taxRate * 100).toFixed(1)}% is unrealistically high (> 50%)`);
  } else if (taxRate > 0.40) {
    warnings.push(`Tax rate ${(taxRate * 100).toFixed(1)}% is very high`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate all assumptions
 */
export function validateAllAssumptions(assumptions: {
  revenueGrowth?: number | number[];
  ebitdaMargin?: number | number[];
  ebitMargin?: number | number[];
  wacc?: number;
  terminalGrowth?: number;
  taxRate?: number;
}): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  
  if (assumptions.revenueGrowth !== undefined) {
    const result = validateRevenueGrowth(assumptions.revenueGrowth);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }
  
  if (assumptions.ebitdaMargin !== undefined) {
    const result = validateMargin(assumptions.ebitdaMargin, 'EBITDA margin');
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }
  
  if (assumptions.ebitMargin !== undefined) {
    const result = validateMargin(assumptions.ebitMargin, 'EBIT margin');
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }
  
  if (assumptions.wacc !== undefined) {
    const result = validateWACC(assumptions.wacc);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }
  
  if (assumptions.terminalGrowth !== undefined) {
    const result = validateTerminalGrowth(assumptions.terminalGrowth);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }
  
  if (assumptions.taxRate !== undefined) {
    const result = validateTaxRate(assumptions.taxRate);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }
  
  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings
  };
}

/**
 * Sanitize assumptions by clamping to reasonable bounds
 */
export function sanitizeAssumptions<T extends Record<string, any>>(
  assumptions: T,
  bounds: Record<string, AssumptionBounds> = {},
  ctx?: { ticker: string; modelType: string }
): SanitizationResult<T> {
  try {
    // Work on a mutable/indexable object and cast back to T at the boundary.
    const sanitized: Record<string, any> = { ...assumptions };
  
    // Preserve identity if present
    if (!sanitized['ticker'] && ctx?.ticker) (sanitized as any)['ticker'] = ctx.ticker;
    if (!sanitized['modelType'] && ctx?.modelType) (sanitized as any)['modelType'] = ctx.modelType;
  
    // Default bounds
    const defaultBounds: Record<string, AssumptionBounds> = {
      revenueGrowth: { min: -0.5, max: 1.0 },
      ebitdaMargin: { min: 0, max: 1.0 },
      ebitMargin: { min: 0, max: 1.0 },
      wacc: { min: 0.01, max: 0.30 },
      terminalGrowth: { min: 0, max: 0.05 },
      taxRate: { min: 0, max: 0.50 },
      capexPctRevenue: { min: 0, max: 0.30 },
      nwcPctRevenue: { min: -0.20, max: 0.30 }
    };
    
    const allBounds = { ...defaultBounds, ...bounds };
    
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'number' && allBounds[key]) {
        const { min, max } = allBounds[key];
        if (min !== undefined && value < min) {
          sanitized[key] = min;
        }
        if (max !== undefined && value > max) {
          sanitized[key] = max;
        }
      }
      if (Array.isArray(value)) {
        sanitized[key] = value.map((v: any) =>
          typeof v === 'number' && isFinite(v) ? v : null
        ) as any;
      }
    }
    
    if (!sanitized['ticker'] || !sanitized['modelType']) {
      return {
        ok: false,
        warnings: [],
        error: { code: 'missing_identity', message: 'ticker/modelType missing in assumptions' },
      };
    }
  
    return { ok: true, value: sanitized as T, warnings: [] };
  } catch (error: any) {
    return {
      ok: false,
      warnings: [],
      error: {
        code: 'sanitize_failed',
        message: error?.message || 'Sanitization failed',
      },
    };
  }
}

/**
 * Format sanitization log with defensive handling
 * Supports both old signature (before, after) and new signature with optional context
 */
export function formatSanitizationLog(
  before: Record<string, any> | undefined,
  after: Record<string, any> | undefined,
  ctx: { ticker: string; modelType: string }
): string {
  try {
    const ticker = ctx?.ticker || 'unknown';
    const modelType = ctx?.modelType || 'unknown';
    if (!before && !after) return `Sanitization log: No data provided [${ticker}:${modelType}]`;
    const beforeData = before || {};
    const afterData = after || before || {};
    const changes: string[] = [];
    const allKeys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
    for (const key of allKeys) {
      const beforeVal = (beforeData as any)[key];
      const afterVal = (afterData as any)[key];
      if (Array.isArray(beforeVal) && Array.isArray(afterVal)) {
        if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
          changes.push(`${key}: [array] → [array]`);
        }
      } else if (beforeVal !== afterVal) {
        const beforeStr = typeof beforeVal === 'object' ? JSON.stringify(beforeVal) : String(beforeVal);
        const afterStr = typeof afterVal === 'object' ? JSON.stringify(afterVal) : String(afterVal);
        changes.push(`${key}: ${beforeStr} → ${afterStr}`);
      }
    }
    const context = ` [${ticker}:${modelType}]`;
    return changes.length > 0 ? `Sanitized${context}: ${changes.join(', ')}` : `No changes${context}`;
  } catch {
    return 'Sanitization log unavailable (logging error)';
  }
}

export function validateSanitizedAssumptions(assumptions: Record<string, any>): ValidationResult {
  return validateAllAssumptions(assumptions);
}
