import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a currency value, showing "—" for zero/null/NaN/invalid values
 */
export function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  
  if (absValue >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  } else if (absValue >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  } else if (absValue >= 1e3) {
    return `$${(value / 1e3).toFixed(0)}K`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

/**
 * Formats a value or shows "—" if it's zero, null, undefined, or NaN
 * Useful for displaying financial data where zeros indicate missing/invalid data
 */
export function formatValueOrDash(
  value: number | null | undefined,
  formatter: (v: number) => string = formatCurrency
): string {
  if (value === null || value === undefined || isNaN(value) || value === 0) {
    return '—';
  }
  return formatter(value);
}
