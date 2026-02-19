/**
 * Macro Snapshot Validation
 * 
 * Provides runtime validation for MacroSnapshot objects to prevent
 * undefined property access crashes in API routes
 */

import type { MacroSnapshot } from '@/lib/macroData';

export class MacroSnapshotError extends Error {
  constructor(message: string, public readonly missingField?: string) {
    super(message);
    this.name = 'MacroSnapshotError';
  }
}

/**
 * Validates and asserts that a snapshot has the required structure
 * Throws MacroSnapshotError if validation fails
 * 
 * Use this at API route boundaries before accessing snapshot properties
 */
export function assertMacroSnapshot(snapshot: any): MacroSnapshot {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new MacroSnapshotError('Snapshot is not an object', 'snapshot');
  }

  if (!snapshot.series || typeof snapshot.series !== 'object') {
    throw new MacroSnapshotError('Snapshot missing series object', 'series');
  }

  if (!snapshot.metrics || typeof snapshot.metrics !== 'object') {
    throw new MacroSnapshotError('Snapshot missing metrics object', 'metrics');
  }

  // Validate required series exist
  const requiredSeries = ['sp500', 'fedFunds', 'cpi', 'treasury10y', 'unemployment', 'vix'];
  for (const key of requiredSeries) {
    if (!snapshot.series[key]) {
      throw new MacroSnapshotError(`Missing required series: ${key}`, `series.${key}`);
    }
  }

  // Validate required metrics exist
  const requiredMetrics = [
    'sp500Current',
    'sp500Change1d',
    'sp500Change1w',
    'fedFundsCurrent',
    'cpiCurrent',
    'treasury10yCurrent',
    'unemploymentCurrent',
    'vixCurrent',
  ];

  for (const key of requiredMetrics) {
    if (snapshot.metrics[key] === undefined || snapshot.metrics[key] === null) {
      throw new MacroSnapshotError(`Missing required metric: ${key}`, `metrics.${key}`);
    }
  }

  return snapshot as MacroSnapshot;
}

/**
 * Validates a snapshot and returns validation result without throwing
 * Useful for logging/debugging
 */
export function validateMacroSnapshot(snapshot: any): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    assertMacroSnapshot(snapshot);
    return { isValid: true, errors, warnings };
  } catch (error) {
    if (error instanceof MacroSnapshotError) {
      errors.push(error.message);
    } else {
      errors.push('Unknown validation error');
    }
    return { isValid: false, errors, warnings };
  }
}
