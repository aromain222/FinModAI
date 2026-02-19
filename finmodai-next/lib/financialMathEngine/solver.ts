/**
 * CapitalBase Financial Math Engine
 * Iterative Solver
 * 
 * Applies derivation rules repeatedly until no more values can be derived
 * Prevents cycles and never overwrites reported values
 */

import type {
  FinancialKey,
  FinancialValue,
  FinancialState,
  ResolvedState,
  DerivationRule,
} from './types';
import { DERIVATION_RULES } from './rules';

/**
 * Check if a value is reported (should never be overwritten)
 */
function isReported(value: FinancialValue | undefined): boolean {
  return value?.status === 'reported' || value?.status === 'user_provided';
}

/**
 * Check if a value already exists (non-null)
 */
function hasValue(state: FinancialState, key: FinancialKey): boolean {
  const entry = state[key];
  return entry !== undefined && entry.value !== null;
}

/**
 * Check if all required inputs exist and are numeric
 */
function hasAllInputs(
  state: FinancialState,
  requiredInputs: FinancialKey[]
): boolean {
  return requiredInputs.every(key => {
    const entry = state[key];
    return entry !== undefined && entry.value !== null && isFinite(entry.value);
  });
}

/**
 * Apply a single derivation rule
 */
function applyRule(
  rule: DerivationRule,
  state: FinancialState
): FinancialValue | null {
  // Don't overwrite reported or user-provided values
  if (isReported(state[rule.outputKey])) {
    return null;
  }
  
  // Check if value already exists
  if (hasValue(state, rule.outputKey)) {
    return null;
  }
  
  // Check if all required inputs exist
  if (!hasAllInputs(state, rule.requiredInputs)) {
    return null;
  }
  
  // Try to derive the value
  try {
    const derivedValue = rule.derive(state);
    
    if (derivedValue === null) {
      return null;
    }
    
    // Run validation if provided
    if (rule.validate && derivedValue.value !== null) {
      const validation = rule.validate(derivedValue.value, state);
      if (!validation.isValid) {
        // Still return the value but add warnings
        return {
          ...derivedValue,
          warnings: [
            ...(derivedValue.warnings || []),
            ...(validation.warnings || []),
          ],
        };
      }
      if (validation.warnings && validation.warnings.length > 0) {
        return {
          ...derivedValue,
          warnings: [
            ...(derivedValue.warnings || []),
            ...validation.warnings,
          ],
        };
      }
    }
    
    return derivedValue;
  } catch (error) {
    // Rule failed - return null
    return null;
  }
}

/**
 * Resolve financial state by iteratively applying derivation rules
 */
export function resolve(
  inputs: Partial<Record<FinancialKey, FinancialValue>>
): ResolvedState {
  // Start with input state (copy to avoid mutation)
  const state: FinancialState = { ...inputs };
  const appliedRules: string[] = [];
  const warnings: string[] = [];
  let iteration = 0;
  const maxIterations = 50; // Prevent infinite loops
  
  // Track which keys we've tried to derive (to detect cycles)
  const attemptedKeys = new Set<FinancialKey>();
  
  // Iterate until no new values can be derived
  while (iteration < maxIterations) {
    let newValuesDerived = false;
    
    // Try each rule
    for (const rule of DERIVATION_RULES) {
      // Skip if we've already derived this key
      if (hasValue(state, rule.outputKey)) {
        continue;
      }
      
      // Skip if this is a reported value
      if (isReported(state[rule.outputKey])) {
        continue;
      }
      
      // Try to apply the rule
      const derivedValue = applyRule(rule, state);
      
      if (derivedValue !== null) {
        // Check if we're creating a cycle (key was attempted before)
        if (attemptedKeys.has(rule.outputKey)) {
          // This might be a cycle, but if the value is different, it's progress
          const existingValue = state[rule.outputKey];
          if (existingValue?.value !== derivedValue.value) {
            // Different value - not a cycle, continue
            state[rule.outputKey] = derivedValue;
            appliedRules.push(rule.id);
            newValuesDerived = true;
          }
        } else {
          // New derivation
          state[rule.outputKey] = derivedValue;
          appliedRules.push(rule.id);
          newValuesDerived = true;
          attemptedKeys.add(rule.outputKey);
        }
        
        // Collect warnings
        if (derivedValue.warnings && derivedValue.warnings.length > 0) {
          warnings.push(
            `${rule.outputKey}: ${derivedValue.warnings.join('; ')}`
          );
        }
      }
    }
    
    // If no new values were derived, we're done
    if (!newValuesDerived) {
      break;
    }
    
    iteration++;
  }
  
  if (iteration >= maxIterations) {
    warnings.push('Maximum iterations reached - solver may not have converged');
  }
  
  // Determine missing required keys (for each model type, see modelRequirements.ts)
  // For now, return empty arrays - will be populated by model-specific functions
  const missing = {
    required: [] as FinancialKey[],
    optional: [] as FinancialKey[],
  };
  
  // Find keys that couldn't be derived
  const cannotDerive: FinancialKey[] = [];
  for (const rule of DERIVATION_RULES) {
    if (!hasValue(state, rule.outputKey) && !isReported(state[rule.outputKey])) {
      // Check if we could derive it but didn't
      if (hasAllInputs(state, rule.requiredInputs)) {
        // We have inputs but didn't derive - might be a validation failure
        // Don't add to cannotDerive yet
      } else {
        // Missing inputs - can't derive
        const missingInputs = rule.requiredInputs.filter(
          key => !hasValue(state, key)
        );
        if (missingInputs.length === 0) {
          // All inputs exist but rule didn't apply - might be edge case
          cannotDerive.push(rule.outputKey);
        }
      }
    }
  }
  
  return {
    resolved: state,
    missing,
    warnings,
    appliedRules,
    cannotDerive,
  };
}

/**
 * Get provenance summary for a specific key
 */
export function getProvenance(
  state: FinancialState,
  key: FinancialKey
): FinancialValue | null {
  return state[key] || null;
}

/**
 * Get all keys with a specific status
 */
export function getKeysByStatus(
  state: FinancialState,
  status: FinancialValue['status']
): FinancialKey[] {
  return Object.keys(state).filter(
    key => state[key as FinancialKey]?.status === status
  ) as FinancialKey[];
}

/**
 * Format resolved state for display
 */
export function formatResolvedState(state: FinancialState): string {
  const lines: string[] = [];
  
  lines.push('Resolved Financial State:');
  lines.push('');
  
  const byStatus: Record<string, FinancialKey[]> = {
    reported: [],
    derived: [],
    derived_from_assumption: [],
    user_provided: [],
    ai_parse: [],
    missing: [],
  };
  
  Object.keys(state).forEach(key => {
    const entry = state[key as FinancialKey];
    if (entry) {
      byStatus[entry.status]?.push(key as FinancialKey);
    }
  });
  
  for (const [status, keys] of Object.entries(byStatus)) {
    if (keys.length > 0) {
      lines.push(`${status.toUpperCase()}:`);
      keys.forEach(key => {
        const entry = state[key];
        if (entry) {
          const valueStr = entry.value !== null ? entry.value.toLocaleString() : 'null';
          lines.push(`  ${key}: ${valueStr}`);
          if (entry.method) {
            lines.push(`    Method: ${entry.method}`);
          }
          if (entry.warnings && entry.warnings.length > 0) {
            lines.push(`    Warnings: ${entry.warnings.join('; ')}`);
          }
        }
      });
      lines.push('');
    }
  }
  
  return lines.join('\n');
}
