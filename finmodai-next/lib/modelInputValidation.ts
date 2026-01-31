/**
 * Model Input Validation
 * Validate model inputs
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateModelInputs(inputs: Record<string, any>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check required fields
  if (!inputs.ticker) {
    errors.push('Ticker is required');
  }
  
  if (!inputs.modelType) {
    errors.push('Model type is required');
  }
  
  // Check numeric fields
  if (inputs.revenue !== undefined && (typeof inputs.revenue !== 'number' || inputs.revenue <= 0)) {
    errors.push('Revenue must be a positive number');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
