/**
 * Financial Formatting Utilities
 * 
 * Consistent formatting for money, percentages, multiples across the app.
 * Never shows incorrect scales (e.g., mega-cap EV as "$2K").
 */

export type MoneyUnit = 'raw' | 'thousands' | 'millions' | 'billions';
export type FormatType = 'money' | 'pct' | 'multiple' | 'text' | 'integer';

/**
 * Format a number as currency with automatic scaling
 * 
 * @param value - The numeric value (raw, not scaled)
 * @param unit - The unit of the input value ('raw' = actual dollars, 'millions' = value is in millions, etc.)
 * @param options - Formatting options
 * @returns Formatted string like "$721.6B" or "—" if null/undefined
 */
export function formatMoney(
  value: number | null | undefined,
  unit: MoneyUnit = 'raw',
  options: {
    decimals?: number;
    showZero?: boolean;
    compact?: boolean;
  } = {}
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (value === 0 && !options.showZero) {
    return '$0';
  }

  const { decimals = 1, compact = true } = options;

  // Convert to raw dollars first
  let rawValue = value;
  switch (unit) {
    case 'thousands':
      rawValue = value * 1_000;
      break;
    case 'millions':
      rawValue = value * 1_000_000;
      break;
    case 'billions':
      rawValue = value * 1_000_000_000;
      break;
    case 'raw':
    default:
      rawValue = value;
      break;
  }

  // Determine scale for display
  const absValue = Math.abs(rawValue);
  let displayValue: number;
  let suffix: string;

  if (compact) {
    if (absValue >= 1_000_000_000_000) {
      // Trillions
      displayValue = rawValue / 1_000_000_000_000;
      suffix = 'T';
    } else if (absValue >= 1_000_000_000) {
      // Billions
      displayValue = rawValue / 1_000_000_000;
      suffix = 'B';
    } else if (absValue >= 1_000_000) {
      // Millions
      displayValue = rawValue / 1_000_000;
      suffix = 'M';
    } else if (absValue >= 1_000) {
      // Thousands
      displayValue = rawValue / 1_000;
      suffix = 'K';
    } else {
      // Raw
      displayValue = rawValue;
      suffix = '';
    }
  } else {
    // Always show in millions
    displayValue = rawValue / 1_000_000;
    suffix = 'M';
  }

  // Format with appropriate decimals
  const formatted = displayValue.toFixed(decimals);
  // Remove trailing zeros after decimal point
  const trimmed = formatted.replace(/\.?0+$/, '');

  return `$${trimmed}${suffix}`;
}

/**
 * Format a percentage
 * 
 * @param value - Percentage as decimal (0.10 = 10%)
 * @param decimals - Number of decimal places
 * @returns Formatted string like "10.0%" or "—" if null/undefined
 */
export function formatPct(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a multiple (e.g., EV/EBITDA)
 * 
 * @param value - The multiple value
 * @param decimals - Number of decimal places
 * @returns Formatted string like "12.5x" or "—" if null/undefined
 */
export function formatMultiple(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return `${value.toFixed(decimals)}x`;
}

/**
 * Format a price per share
 * 
 * @param value - Price in dollars
 * @param decimals - Number of decimal places
 * @returns Formatted string like "$95.22" or "—" if null/undefined
 */
export function formatPrice(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return `$${value.toFixed(decimals)}`;
}

/**
 * Format an integer
 * 
 * @param value - Integer value
 * @returns Formatted string with commas or "—" if null/undefined
 */
export function formatInteger(
  value: number | null | undefined
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  return Math.round(value).toLocaleString();
}

/**
 * Format text (pass-through, but handles null)
 * 
 * @param value - Text value
 * @returns The text or "—" if null/undefined
 */
export function formatText(
  value: string | null | undefined
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return value;
}

/**
 * Format a value based on format type
 * 
 * @param value - The value to format
 * @param format - The format type
 * @param options - Additional options (unit, decimals, etc.)
 * @returns Formatted string
 */
export function formatValue(
  value: any,
  format: FormatType,
  options: {
    unit?: MoneyUnit;
    decimals?: number;
    showZero?: boolean;
    compact?: boolean;
  } = {}
): string {
  switch (format) {
    case 'money':
      return formatMoney(value, options.unit, options);
    case 'pct':
      return formatPct(value, options.decimals);
    case 'multiple':
      return formatMultiple(value, options.decimals);
    case 'integer':
      return formatInteger(value);
    case 'text':
      return formatText(value);
    default:
      return String(value ?? '—');
  }
}
