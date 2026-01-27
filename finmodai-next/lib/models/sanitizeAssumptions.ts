/**
 * Safe Sanitize Assumptions Guard
 * 
 * Provides a safe wrapper around sanitizeAssumptions and validateSanitizedAssumptions
 * that returns a Result type instead of throwing errors.
 * 
 * This allows routes to fail gracefully without referencing uninitialized variables.
 */

import type { ThreeStatementAssumptions } from '@/types/threeStatementAssumptions';
import { 
  sanitizeAssumptions as sanitizeAssumptionsImpl,
  validateSanitizedAssumptions,
  type SanitizationResult 
} from '@/lib/sanitizeAssumptions';

/**
 * Result type for safe operations
 */
export type SafeResult<T> = 
  | { ok: true; value: T }
  | { ok: false; error: string; details?: string };

/**
 * Safe wrapper around sanitizeAssumptions and validateSanitizedAssumptions
 * 
 * Returns { ok: true, value } if sanitization succeeds, or { ok: false, error } if it fails.
 * Never throws - all errors are caught and returned as Result.
 * 
 * @param input - Assumptions to sanitize (can be partial)
 * @returns SafeResult with sanitized assumptions or error
 */
export function safeSanitizeAssumptions(
  input: Partial<ThreeStatementAssumptions>
): SafeResult<ThreeStatementAssumptions> {
  try {
    // Sanitize assumptions
    const sanitizationResult: SanitizationResult = sanitizeAssumptionsImpl(input);
    
    // Validate sanitized assumptions (may throw)
    try {
      validateSanitizedAssumptions(sanitizationResult);
    } catch (validationError: unknown) {
      // Validation failed - return error result
      const errorMessage = validationError instanceof Error 
        ? validationError.message 
        : typeof validationError === 'string'
          ? validationError
          : 'Validation failed';
      
      // Include validation errors in details
      const errorDetails = sanitizationResult.errors.length > 0
        ? sanitizationResult.errors.map(e => `${e.field}: ${e.issue}`).join('; ')
        : errorMessage;
      
      return {
        ok: false,
        error: 'Assumptions validation failed',
        details: errorDetails,
      };
    }
    
    // Check for critical errors in sanitization result
    const criticalErrors = sanitizationResult.errors.filter(err => 
      err.field.includes('revenue[0]') || 
      err.issue.includes('Cannot generate')
    );
    
    if (criticalErrors.length > 0) {
      const errorMessages = criticalErrors.map(err => 
        `${err.field}: ${err.issue}${err.suggestion ? ` (${err.suggestion})` : ''}`
      ).join('; ');
      
      return {
        ok: false,
        error: 'Critical validation errors',
        details: errorMessages,
      };
    }
    
    // Sanitization succeeded - return success result
    return {
      ok: true,
      value: sanitizationResult.sanitized,
    };
    
  } catch (error: unknown) {
    // Catch any unexpected errors during sanitization
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string'
        ? error
        : 'Unknown error during sanitization';
    
    console.error('[safeSanitizeAssumptions] Unexpected error:', error);
    
    return {
      ok: false,
      error: 'Sanitization failed',
      details: errorMessage,
    };
  }
}

