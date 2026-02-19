/**
 * Model Computability Gate
 * 
 * Hard gate that prevents Excel generation unless model is computable
 */

import type { ModelState, ModelStateInfo } from './modelState';
import { getModelRequirements, getMissingRequiredKeys } from '@/lib/financialMathEngine/modelRequirements';
import type { FinancialKey } from '@/lib/financialMathEngine/types';

export interface ComputabilityCheck {
  isComputable: boolean;
  state: ModelState;
  missing: string[];
  estimated: Array<{ key: string; value: number; source: string; confidence: 'low' | 'medium' | 'high' }>;
  message?: string;
}

/**
 * Check if a model is computable based on its inputs
 */
export async function checkModelComputability(
  modelType: 'comps' | 'dcf' | 'three-statement' | 'lbo' | 'merger',
  inputs: Record<string, any>,
  estimated?: Array<{ key: string; value: number; source: string; confidence: 'low' | 'medium' | 'high' }>
): Promise<ComputabilityCheck> {
  // Map model type to requirements
  const requirementsType = modelType === 'three-statement' ? 'three_statement' : modelType;
  const requirements = getModelRequirements(requirementsType as any);

  // Convert inputs to state format (simplified - just check for presence)
  const state: Partial<Record<FinancialKey, { value: number | null }>> = {};
  for (const key of requirements.required) {
    let value = inputs[key];
    
    // Handle derived values: if EBIT missing but EBITDA exists, mark as available
    if (key === 'ebit' && (value === null || value === undefined || isNaN(Number(value)))) {
      const ebitda = inputs['ebitda'];
      if (ebitda !== null && ebitda !== undefined && !isNaN(Number(ebitda))) {
        // EBIT can be derived from EBITDA - D&A, so don't mark as missing
        // Skip adding to state (treat as available)
        continue;
      }
    }
    
    state[key as FinancialKey] = {
      value: value !== null && value !== undefined && !isNaN(Number(value)) ? Number(value) : null,
    };
  }

  // Check for missing required keys
  const missing = getMissingRequiredKeys(requirementsType as any, state);

  // If we have estimates, check if they fill the gaps
  const missingAfterEstimates = estimated
    ? missing.filter((key) => !estimated.some((e) => e.key === key))
    : missing;

  // Model is computable if no missing required keys (or all filled by estimates)
  const isComputable = missingAfterEstimates.length === 0;

  let modelState: ModelState;
  if (isComputable) {
    modelState = 'computable';
  } else if (missing.length > 0) {
    modelState = 'assumptions_required';
  } else {
    modelState = 'draft';
  }

  return {
    isComputable,
    state: modelState,
    missing: missingAfterEstimates,
    estimated: estimated || [],
    message: isComputable
      ? undefined
      : `Missing required inputs: ${missingAfterEstimates.join(', ')}`,
  };
}

/**
 * Hard gate: Throw if model is not computable
 * Use this before Excel generation
 */
export function assertModelComputable(check: ComputabilityCheck): void {
  if (!check.isComputable) {
    throw new Error(
      `MODEL_NOT_COMPUTABLE_YET: Missing required inputs: ${check.missing.join(', ')}. ` +
        `Model state: ${check.state}. ` +
        `Cannot generate Excel file until all required inputs are provided.`
    );
  }
}
