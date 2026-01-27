/**
 * Safe Number Utility
 * 
 * Converts any value to a safe number for LBO calculations.
 * Returns 0 for null, undefined, NaN, or Infinity to prevent math errors.
 */

export function safeNumber(x: any): number {
  if (x === null || x === undefined) {
    return 0;
  }
  
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) {
      return 0; // NaN or Infinity → 0
    }
    return x;
  }
  
  if (typeof x === 'string') {
    const trimmed = x.trim();
    if (!trimmed || trimmed === '') {
      return 0;
    }
    const normalized = trimmed.replace(/,/g, '');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return parsed;
  }
  
  if (typeof x === 'boolean') {
    return x ? 1 : 0;
  }
  
  // Try to convert to number
  const converted = Number(x);
  if (Number.isFinite(converted)) {
    return converted;
  }
  
  return 0; // Default fallback
}

/**
 * Safe number with bounds clamping
 */
export function safeNumberClamp(x: any, min: number, max: number): number {
  const value = safeNumber(x);
  return Math.max(min, Math.min(max, value));
}

/**
 * Safe number with minimum value
 */
export function safeNumberMin(x: any, min: number): number {
  return Math.max(safeNumber(x), min);
}

