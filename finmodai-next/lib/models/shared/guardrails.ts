/**
 * Model Guardrails
 * Validation guardrails for model inputs
 */

export interface GuardrailResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface GuardrailSettings {
  [key: string]: any;
}

export function evaluateGuardrails(
  modelType: string,
  outputs: Record<string, any>,
  settings?: GuardrailSettings
): { warnings: string[]; blocks: string[] } {
  const blocks: string[] = [];
  const warnings: string[] = [];
  
  // WACC guardrails
  if (outputs.wacc !== undefined) {
    if (outputs.wacc <= 0) {
      blocks.push('WACC must be positive');
    } else if (outputs.wacc > 0.30) {
      warnings.push('WACC exceeds 30% - unusually high');
    }
  }
  
  // Terminal growth guardrails
  if (outputs.terminalGrowth !== undefined) {
    if (outputs.terminalGrowth < 0) {
      warnings.push('Terminal growth is negative');
    } else if (outputs.terminalGrowth > 0.05) {
      warnings.push('Terminal growth exceeds 5% - may be unrealistic');
    }
  }
  
  // LBO-specific guardrails
  if (modelType === 'lbo') {
    if (outputs.irr !== undefined && outputs.irr < 0.15) {
      warnings.push('IRR below 15% - may indicate poor investment');
    }
    if (outputs.leverageMultiple !== undefined && outputs.leverageMultiple > 10) {
      warnings.push('Leverage multiple exceeds 10x - high risk');
    }
  }
  
  return {
    warnings,
    blocks
  };
}
