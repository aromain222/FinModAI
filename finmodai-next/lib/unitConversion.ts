/**
 * Unit Conversion Utilities
 * Convert between different financial units (thousands, millions, billions)
 */

export type FinancialUnit = 'actual' | 'thousands' | 'millions' | 'billions';

/**
 * Ensure a value is in millions
 */
export function ensureMillions(value: number, currentUnit: FinancialUnit = 'actual'): number {
  switch (currentUnit) {
    case 'actual':
      return value / 1_000_000;
    case 'thousands':
      return value / 1_000;
    case 'millions':
      return value;
    case 'billions':
      return value * 1_000;
    default:
      return value;
  }
}

/**
 * Format a number as millions with proper suffix
 */
export function formatMillions(value: number, decimals: number = 1): string {
  return `$${value.toFixed(decimals)}M`;
}

/**
 * Convert from millions to other units
 */
export function fromMillions(value: number, targetUnit: FinancialUnit): number {
  switch (targetUnit) {
    case 'actual':
      return value * 1_000_000;
    case 'thousands':
      return value * 1_000;
    case 'millions':
      return value;
    case 'billions':
      return value / 1_000;
    default:
      return value;
  }
}

/**
 * Convert between any two units
 */
export function convertUnits(
  value: number,
  fromUnit: FinancialUnit,
  toUnit: FinancialUnit
): number {
  // Convert to millions first, then to target unit
  const inMillions = ensureMillions(value, fromUnit);
  return fromMillions(inMillions, toUnit);
}

/**
 * Detect the likely unit of a financial value
 */
export function detectUnit(value: number): FinancialUnit {
  const absValue = Math.abs(value);
  
  if (absValue >= 1_000_000_000) {
    return 'actual'; // Likely in actual dollars
  } else if (absValue >= 1_000_000) {
    return 'thousands'; // Likely in thousands
  } else if (absValue >= 1_000) {
    return 'millions'; // Likely in millions
  } else {
    return 'billions'; // Likely in billions
  }
}

/**
 * Format a value with automatic unit detection
 */
export function formatAuto(value: number, decimals: number = 1): string {
  const absValue = Math.abs(value);
  
  if (absValue >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(decimals)}B`;
  } else if (absValue >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(decimals)}M`;
  } else if (absValue >= 1_000) {
    return `$${(value / 1_000).toFixed(decimals)}K`;
  } else {
    return `$${value.toFixed(decimals)}`;
  }
}

/**
 * Parse a formatted financial string back to a number
 */
export function parseFormatted(formatted: string): { value: number; unit: FinancialUnit } {
  // Remove currency symbols and whitespace
  const cleaned = formatted.replace(/[$,\s]/g, '');
  
  // Check for unit suffix
  const lastChar = cleaned.slice(-1).toUpperCase();
  const numericPart = cleaned.slice(0, -1);
  const baseValue = parseFloat(numericPart);
  
  if (isNaN(baseValue)) {
    return { value: 0, unit: 'actual' };
  }
  
  switch (lastChar) {
    case 'K':
      return { value: baseValue * 1_000, unit: 'thousands' };
    case 'M':
      return { value: baseValue * 1_000_000, unit: 'millions' };
    case 'B':
      return { value: baseValue * 1_000_000_000, unit: 'billions' };
    default:
      // No suffix, try to parse the whole string
      const fullValue = parseFloat(cleaned);
      return { value: fullValue, unit: detectUnit(fullValue) };
  }
}

/**
 * Normalize an array of values to the same unit
 */
export function normalizeArray(
  values: number[],
  targetUnit: FinancialUnit = 'millions'
): number[] {
  if (values.length === 0) return [];
  
  // Detect the unit of the first value
  const detectedUnit = detectUnit(values[0]);
  
  // Convert all values to target unit
  return values.map(v => convertUnits(v, detectedUnit, targetUnit));
}
