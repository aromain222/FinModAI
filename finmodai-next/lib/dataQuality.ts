/**
 * Data Quality & Validation
 * 
 * Enforces strict data integrity rules globally across CapitalBase:
 * - Never default missing values to 0
 * - Never output NaN
 * - Explicit flagging of missing/inferred data
 * - Clear data provenance labeling
 * - Graceful degradation with explanations
 */

import { evaluate, isNaN as mathIsNaN } from 'mathjs';

export type DataQualityLevel = 'verified' | 'inferred' | 'proxy' | 'missing';

export interface DataPoint<T = number> {
  value: T | null;
  quality: DataQualityLevel;
  source: string;
  explanation?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Converts any value to a finite number or null
 * CRITICAL: Use this everywhere before returning numeric values to UI
 * Never allows NaN or Infinity to propagate
 */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
}

/**
 * Validates a numeric value, ensuring it's not NaN and is finite
 * Never allows NaN or Infinity to propagate
 */
export function validateNumeric(
  value: unknown,
  label: string
): { valid: boolean; value: number | null; error?: string } {
  if (value === null || value === undefined) {
    return { valid: false, value: null, error: `${label} is missing` };
  }

  const num = typeof value === 'number' ? value : Number(value);

  if (mathIsNaN(num)) {
    return { valid: false, value: null, error: `${label} is NaN` };
  }

  if (!isFinite(num)) {
    return { valid: false, value: null, error: `${label} is not finite` };
  }

  return { valid: true, value: num };
}

/**
 * Creates a labeled data point with explicit quality and provenance
 */
export function createDataPoint<T = number>(
  value: T | null,
  source: string,
  quality: DataQualityLevel = 'verified',
  explanation?: string
): DataPoint<T> {
  return {
    value,
    quality,
    source,
    explanation,
  };
}

/**
 * Flags missing data in a dataset and returns a report
 */
export function flagMissingData(
  dataset: Record<string, unknown> | object
): { missing: string[]; present: string[]; completeness: number } {
  const missing: string[] = [];
  const present: string[] = [];

  for (const [key, value] of Object.entries(dataset as Record<string, unknown>)) {
    if (value === null || value === undefined || value === '') {
      missing.push(key);
    } else if (typeof value === 'number' && (mathIsNaN(value) || !isFinite(value))) {
      missing.push(key);
    } else {
      present.push(key);
    }
  }

  const total = missing.length + present.length;
  const completeness = total > 0 ? present.length / total : 0;

  return { missing, present, completeness };
}

/**
 * Labels data with its provenance (source)
 */
export function labelDataProvenance(
  value: number | null,
  source: 'stooq' | 'fmp' | 'polygon' | 'fred' | 'user_input' | 'inferred' | 'historical_avg',
  additionalContext?: string
): DataPoint {
  const sourceLabels: Record<typeof source, string> = {
    stooq: 'Stooq daily close',
    fmp: 'Financial Modeling Prep',
    polygon: 'Polygon.io',
    fred: 'Federal Reserve Economic Data',
    user_input: 'User input',
    inferred: 'Inferred from available data',
    historical_avg: 'Historical average',
  };

  const quality: DataQualityLevel =
    source === 'user_input' || source === 'stooq' || source === 'fmp' || source === 'polygon' || source === 'fred'
      ? 'verified'
      : source === 'inferred'
      ? 'inferred'
      : 'proxy';

  return createDataPoint(
    value,
    sourceLabels[source],
    quality,
    additionalContext
  );
}

/**
 * Graceful fallback with explanation when primary value is unavailable
 */
export function gracefulFallback<T>(
  primaryValue: T | null | undefined,
  fallbackFn: () => T,
  explanation: string
): DataPoint<T> {
  if (primaryValue !== null && primaryValue !== undefined) {
    return createDataPoint(primaryValue, 'Primary source', 'verified');
  }

  const fallbackValue = fallbackFn();
  return createDataPoint(fallbackValue, 'Fallback', 'proxy', explanation);
}

/**
 * Validates an entire dataset and returns a comprehensive report
 */
export function validateDataset(
  data: Record<string, unknown>,
  requiredFields: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  for (const field of requiredFields) {
    if (!(field in data) || data[field] === null || data[field] === undefined) {
      errors.push(`Required field "${field}" is missing`);
      continue;
    }

    // Validate numeric fields
    if (typeof data[field] === 'number') {
      const validation = validateNumeric(data[field], field);
      if (!validation.valid && validation.error) {
        errors.push(validation.error);
      }
    }
  }

  // Check data quality
  const { missing, completeness } = flagMissingData(data);
  if (completeness < 0.7) {
    warnings.push(
      `Data completeness is ${(completeness * 100).toFixed(0)}%. Missing: ${missing.join(', ')}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Safe division that never returns NaN or Infinity
 */
export function safeDivide(
  numerator: number,
  denominator: number,
  fallback: number | null = null
): number | null {
  if (denominator === 0 || mathIsNaN(numerator) || mathIsNaN(denominator)) {
    return fallback;
  }

  const result = numerator / denominator;
  if (!isFinite(result)) {
    return fallback;
  }

  return result;
}

/**
 * Safe percentage calculation
 */
export function safePercentage(
  value: number,
  total: number,
  fallback: number | null = null
): number | null {
  const result = safeDivide(value, total, fallback);
  return result !== null ? result * 100 : null;
}

/**
 * Formats a value for display, showing "—" for missing/invalid data
 */
export function formatForDisplay(
  value: number | null | undefined,
  formatter: (val: number) => string = (v) => v.toFixed(2)
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  const validation = validateNumeric(value, 'value');
  if (!validation.valid || validation.value === null) {
    return '—';
  }

  return formatter(validation.value);
}

/**
 * Clamps a value within a reasonable range, with explicit warning
 */
export function clampWithWarning(
  value: number,
  min: number,
  max: number,
  label: string
): { value: number; warning?: string } {
  if (value < min) {
    return {
      value: min,
      warning: `${label} (${value}) was below minimum (${min}), clamped to ${min}`,
    };
  }

  if (value > max) {
    return {
      value: max,
      warning: `${label} (${value}) was above maximum (${max}), clamped to ${max}`,
    };
  }

  return { value };
}
