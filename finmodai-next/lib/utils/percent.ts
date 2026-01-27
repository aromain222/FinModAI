/**
 * Percentage normalization utilities
 * 
 * Detects if a value is already a percentage (e.g., 12 for 12%) or a decimal (e.g., 0.12 for 12%)
 * and normalizes to decimal format for consistent display.
 * Includes validation to detect and clamp insane values.
 */

export interface NormalizedPercent {
  value: number; // Normalized decimal (0.12 for 12%)
  isValid: boolean; // True if value is within reasonable bounds
  reason?: string; // Reason if invalid
}

/**
 * Reasonable percentage bounds by context
 * Values outside these bounds are likely scale errors
 */
const REASONABLE_BOUNDS = {
  daily: { max: 50, min: -50 }, // Daily moves: -50% to +50%
  weekly: { max: 100, min: -100 }, // Weekly moves: -100% to +100%
  monthly: { max: 200, min: -200 }, // Monthly moves: -200% to +200%
  default: { max: 200, min: -200 }, // Default: -200% to +200%
};

/**
 * Normalizes a percentage value to decimal format (0.12 for 12%)
 * Detects scale errors and clamps insane values
 * 
 * Detection logic:
 * - If abs(value) <= 1, treat as decimal (already in 0-1 range, likely 0.12 for 12%)
 * - If abs(value) > 1 and <= 200, treat as percentage (already in percentage form, like 12 for 12%)
 * - If abs(value) > 200, likely a scale error (e.g., double conversion), try to fix or mark invalid
 * 
 * @param value - The percentage value (could be decimal like 0.12 or percentage like 12)
 * @param context - Context for validation bounds ('daily' | 'weekly' | 'monthly' | 'default')
 * @returns NormalizedPercent object with value, isValid flag, and optional reason
 * 
 * @example
 * toPct(12) => { value: 0.12, isValid: true }  // Already a percentage
 * toPct(0.12) => { value: 0.12, isValid: true }  // Already a decimal
 * toPct(-1152) => { value: -11.52, isValid: false, reason: 'exceeds_bounds' }  // Scale error detected
 * toPct(0.962) => { value: 0.962, isValid: true }  // Decimal form, keep as is
 */
export function toPct(
  value: number | null | undefined,
  context: 'daily' | 'weekly' | 'monthly' | 'default' = 'default'
): NormalizedPercent {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { value: 0, isValid: false, reason: 'invalid_input' };
  }

  const absValue = Math.abs(value);
  const bounds = REASONABLE_BOUNDS[context] || REASONABLE_BOUNDS.default;

  // If value is <= 1, assume it's already a decimal (0.12 for 12%)
  if (absValue <= 1) {
    const normalized = value;
    // Check if normalized value is within reasonable bounds
    const percentValue = normalized * 100;
    const isValid = percentValue >= bounds.min && percentValue <= bounds.max;
    return {
      value: normalized,
      isValid,
      reason: isValid ? undefined : 'exceeds_bounds',
    };
  }

  // If value is > 1 and <= 200, assume it's a percentage (12 for 12%), convert to decimal
  if (absValue > 1 && absValue <= 200) {
    const normalized = value / 100;
    // Check if normalized value is within reasonable bounds
    const percentValue = normalized * 100; // This is just the original value
    const isValid = percentValue >= bounds.min && percentValue <= bounds.max;
    return {
      value: normalized,
      isValid,
      reason: isValid ? undefined : 'exceeds_bounds',
    };
  }

  // If value is > 200, likely a scale error (e.g., double conversion: 12% → 12 → 1200)
  // Try to fix by dividing by 100 again
  if (absValue > 200) {
    // Check if dividing by 100 again would make it reasonable
    const doubleNormalized = value / 100;
    const doubleNormalizedPercent = Math.abs(doubleNormalized) * 100;
    
    if (doubleNormalizedPercent >= bounds.min && doubleNormalizedPercent <= bounds.max) {
      // This was likely a double conversion, fix it
      return {
        value: doubleNormalized / 100,
        isValid: true,
        reason: 'scale_error_fixed',
      };
    }
    
    // Still insane after fixing, mark as invalid
    return {
      value: 0,
      isValid: false,
      reason: 'exceeds_bounds',
    };
  }

  // Fallback (shouldn't reach here)
  return { value: 0, isValid: false, reason: 'unknown_error' };
}

/**
 * Simple version that returns just the normalized value (backward compatibility)
 * Use toPct() for validation
 */
export function toPctSimple(value: number | null | undefined): number {
  const result = toPct(value);
  return result.value;
}

/**
 * Formats a percentage value to a display string (e.g., "12.00%")
 * Validates and normalizes the value, shows "—" if invalid
 * 
 * Guard: If displayed absolute percent > 50%, logs a warning and clamps to prevent absurd values
 * 
 * @param value - The percentage value (could be decimal like 0.12 or percentage like 12)
 * @param context - Context for validation bounds ('daily' | 'weekly' | 'monthly' | 'default')
 * @returns Formatted string like "12.00%" or "—" if invalid
 * 
 * @example
 * fmtPct(0.12) => "12.00%"
 * fmtPct(12) => "12.00%"
 * fmtPct(1200) => "—"  // Invalid (scale error)
 */
export function fmtPct(
  value: number | null | undefined,
  context: 'daily' | 'weekly' | 'monthly' | 'default' = 'default'
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  
  // Normalize and validate
  const result = toPct(value, context);
  if (!result.isValid) {
    return '—';
  }
  
  // Convert normalized decimal to percentage for display
  const displayPercent = result.value * 100;
  
  // Guard: If displayed absolute percent > 50%, log warning and clamp
  const absDisplayPercent = Math.abs(displayPercent);
  if (absDisplayPercent > 50) {
    console.warn(
      `[fmtPct] Absurd percentage detected: ${displayPercent.toFixed(2)}% (context: ${context}). ` +
      `Original value: ${value}. Clamping to ±50% to prevent display issues.`
    );
    // Clamp to ±50%
    const clamped = Math.max(-50, Math.min(50, displayPercent));
    return `${clamped.toFixed(2)}%`;
  }
  
  return `${displayPercent.toFixed(2)}%`;
}

/**
 * Formats a percentage value with validation info for tooltip
 * Returns the formatted string and whether it's valid
 * 
 * @param value - The percentage value
 * @param context - Context for validation bounds
 * @returns Object with formatted string, isValid flag, and reason if invalid
 */
export function fmtPctWithValidation(
  value: number | null | undefined,
  context: 'daily' | 'weekly' | 'monthly' | 'default' = 'default'
): { display: string; isValid: boolean; reason?: string } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { display: '—', isValid: false, reason: 'invalid_input' };
  }
  
  const result = toPct(value, context);
  if (!result.isValid) {
    return {
      display: '—',
      isValid: false,
      reason: result.reason || 'data_anomaly',
    };
  }
  
  return {
    display: `${(result.value * 100).toFixed(2)}%`,
    isValid: true,
  };
}

/**
 * Formats a percentage value that is already normalized to decimal format
 * Use this if you've already called toPct() on the value
 * 
 * @param normalizedDecimal - The normalized decimal value (0.12 for 12%)
 * @returns Formatted string like "12.00%"
 */
export function fmtPctNormalized(normalizedDecimal: number | null | undefined): string {
  if (normalizedDecimal === null || normalizedDecimal === undefined || !Number.isFinite(normalizedDecimal)) {
    return '—';
  }
  
  return `${(normalizedDecimal * 100).toFixed(2)}%`;
}

