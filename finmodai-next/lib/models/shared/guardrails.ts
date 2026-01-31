/**
 * Model Guardrails
 * Validation guardrails for model inputs
 */

export interface GuardrailResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export function evaluateGuardrails(inputs: Record<string, any>): GuardrailResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Revenue guardrails
  if (inputs.revenue !== undefined) {
    if (inputs.revenue <= 0) {
      errors.push('Revenue must be positive');
    } else if (inputs.revenue < 1000000) {
      warnings.push('Revenue appears very low (< $1M)');
    }
  }
  
  // Growth rate guardrails
  if (inputs.revenueGrowth !== undefined) {
    const growth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth[0] : inputs.revenueGrowth;
    if (growth < -0.5) {
      errors.push('Revenue growth cannot be less than -50%');
    } else if (growth > 1.0) {
      errors.push('Revenue growth cannot exceed 100%');
    }
  }
  
  // WACC guardrails
  if (inputs.wacc !== undefined) {
    if (inputs.wacc <= 0) {
      errors.push('WACC must be positive');
    } else if (inputs.wacc > 0.30) {
      errors.push('WACC cannot exceed 30%');
    }
  }
  
  return {
    passed: errors.length === 0,
    errors,
    warnings
  };
}
