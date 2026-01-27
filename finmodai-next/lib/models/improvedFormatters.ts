/**
 * Improved Formatters - Enhanced Readability
 * 
 * - Thousands separators
 * - Consistent precision
 * - Tabular numerals support
 * - Never crash on null/undefined/NaN
 */

/**
 * Format with thousands separators
 */
function addThousandsSeparators(num: number, decimals: number): string {
  const parts = num.toFixed(decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/**
 * Format money with improved readability
 * Examples: $1,234.5M, $326.0M, $12.3B
 */
export function formatMoneyReadable(value: number | null | undefined, forceDecimals = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (abs >= 1e9) {
    const billions = abs / 1e9;
    return `${sign}$${addThousandsSeparators(billions, forceDecimals ? 1 : billions >= 100 ? 0 : 1)}B`;
  }
  if (abs >= 1e6) {
    const millions = abs / 1e6;
    return `${sign}$${addThousandsSeparators(millions, forceDecimals ? 1 : millions >= 100 ? 0 : 1)}M`;
  }
  if (abs >= 1e3) {
    const thousands = abs / 1e3;
    return `${sign}$${addThousandsSeparators(thousands, forceDecimals ? 1 : thousands >= 100 ? 0 : 1)}K`;
  }
  return `${sign}$${addThousandsSeparators(abs, 0)}`;
}

/**
 * Format price with thousands separators
 * Examples: $125.50, $1,234.00
 */
export function formatPriceReadable(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `$${addThousandsSeparators(value, decimals)}`;
}

/**
 * Format percent with consistent precision
 * Examples: 12.5%, 4.40%, 326.0%
 */
export function formatPercentReadable(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const pct = value * 100;
  return `${addThousandsSeparators(pct, decimals)}%`;
}

/**
 * Format multiple with consistent precision
 * Examples: 12.5x, 4.40x, 326.0x
 */
export function formatMultipleReadable(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${addThousandsSeparators(value, decimals)}x`;
}

/**
 * Format number with thousands separators
 * Examples: 1,234, 12,345.67
 */
export function formatNumberReadable(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (abs >= 1e9) {
    return `${sign}${addThousandsSeparators(abs / 1e9, 1)}B`;
  }
  if (abs >= 1e6) {
    return `${sign}${addThousandsSeparators(abs / 1e6, 1)}M`;
  }
  if (abs >= 1e3) {
    return `${sign}${addThousandsSeparators(abs / 1e3, 1)}K`;
  }
  return `${sign}${addThousandsSeparators(abs, decimals)}`;
}

/**
 * Format shares (millions)
 * Examples: 102.3M, 1,234.5M
 */
export function formatSharesReadable(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (abs >= 1e3) {
    return `${sign}${addThousandsSeparators(abs / 1e3, 1)}B`;
  }
  return `${sign}${addThousandsSeparators(abs, 1)}M`;
}

/**
 * Format delta (change from baseline)
 * Examples: +12.5%, -4.3%, +$1.2M
 */
export function formatDelta(
  value: number | null | undefined,
  format: 'percent' | 'currency' = 'percent'
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  
  const sign = value >= 0 ? '+' : '';
  
  if (format === 'percent') {
    return `${sign}${formatPercentReadable(value, 1)}`;
  }
  return `${sign}${formatMoneyReadable(value, true)}`;
}

/**
 * CSS class for tabular numerals
 */
export const TABULAR_NUMS_CLASS = 'font-variant-numeric: tabular-nums';

/**
 * Inline style for tabular numerals
 */
export const tabularNumsStyle = {
  fontVariantNumeric: 'tabular-nums',
} as const;
