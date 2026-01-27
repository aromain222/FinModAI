/**
 * Valuation Output Formatter
 * 
 * Helper functions to format and display valuation outputs with source tracking
 * and explicit missing reasons.
 */

export type ValuationSource = 'workbook' | 'sheet' | 'results' | 'polygon' | 'fmp' | 'finnhub' | 'computed' | 'unknown';

export interface ValuationOutput<T> {
  value: T | null;
  source?: ValuationSource | null;
  reason?: string | null;
  shareSource?: ValuationSource | null;
  confidence?: 'high' | 'med' | 'low' | null;
}

/**
 * Format a valuation output for display.
 * 
 * @param output - The valuation output to format
 * @param formatter - Function to format the value (e.g., formatCurrency)
 * @param fallback - Fallback display value when value is null (default: "—")
 * @returns Formatted display value
 * 
 * @example
 * const evOutput = formatValuationOutput(
 *   { value: 15000, source: 'workbook' },
 *   (v) => formatCurrency(v, 'MILLIONS')
 * );
 * // Returns: "$15,000M"
 */
export function formatValuationOutput<T>(
  output: ValuationOutput<T>,
  formatter: (value: T) => string,
  fallback: string = '—'
): string {
  if (output.value === null || output.value === undefined) {
    return fallback;
  }
  return formatter(output.value);
}

/**
 * Get the display label for a data source badge.
 * 
 * @param source - The source identifier
 * @returns Human-readable source label
 */
export function getSourceLabel(source: ValuationSource | string | null | undefined): string {
  if (!source) return 'Unknown';
  
  const sourceMap: Record<string, string> = {
    workbook: 'Workbook',
    sheet: 'Workbook',
    results: 'Workbook',
    polygon: 'Polygon',
    fmp: 'FMP',
    finnhub: 'Finnhub',
    computed: 'Computed',
    unknown: 'Unknown',
  };
  
  return sourceMap[source] || source;
}

/**
 * Get the badge styling class for a data source.
 * 
 * @param source - The source identifier
 * @returns Tailwind CSS classes for the badge
 */
export function getSourceBadgeClass(source: ValuationSource | string | null | undefined): string {
  if (!source) return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
  
  // Workbook sources (most trusted)
  if (source === 'workbook' || source === 'sheet' || source === 'results') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
  
  // Computed (from market data)
  if (source === 'computed') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }
  
  // Market data providers
  if (source === 'polygon' || source === 'fmp' || source === 'finnhub') {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
  }
  
  // Default
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
}

/**
 * Get the reason why a valuation output is missing.
 * 
 * @param output - The valuation output
 * @param fieldName - The name of the field (e.g., "Price / Share")
 * @returns Human-readable missing reason
 */
export function getMissingReason(
  output: ValuationOutput<any>,
  fieldName: string = 'Value'
): string | null {
  if (output.value !== null && output.value !== undefined) {
    return null;
  }
  
  if (output.reason) {
    return output.reason;
  }
  
  // Default reasons based on field
  if (fieldName.includes('Price') || fieldName.includes('Share')) {
    if (output.shareSource) {
      return `Shares from ${getSourceLabel(output.shareSource)} - cannot compute from market data`;
    }
    return 'Shares missing from model';
  }
  
  return `${fieldName} unavailable`;
}
