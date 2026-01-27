/**
 * Number formatting utilities with smart rounding and decimal clamping
 * Used for preview display to avoid long float values
 */

export type FormatScale = 'MILLIONS' | 'BILLIONS' | 'NONE' | 'RAW';

export type FormatOptions = {
  scale?: FormatScale;
  decimals?: number;
  mode?: 'table' | 'card';
};

/**
 * Smart round: clamp decimals based on value magnitude
 */
export function smartRound(value: number, maxDecimals: number = 2): number {
  if (!Number.isFinite(value)) return value;
  const absValue = Math.abs(value);
  
  // For very large numbers, reduce decimals
  if (absValue >= 1000) {
    return Math.round(value);
  }
  if (absValue >= 100) {
    return Math.round(value * 10) / 10;
  }
  
  // Apply max decimals
  const factor = Math.pow(10, maxDecimals);
  return Math.round(value * factor) / factor;
}

/**
 * Format currency with scale handling and decimal clamping
 */
export function formatCurrency(value: number | null | undefined, options: FormatOptions = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  
  const { scale = 'MILLIONS', decimals = 2, mode = 'table' } = options;
  const val = Number(value);
  const rounded = smartRound(val, decimals);
  
  if (scale === 'MILLIONS') {
    if (mode === 'card') {
      if (Math.abs(rounded) >= 1000) {
        return `$${(rounded / 1000).toFixed(1)}B`;
      }
      return `$${rounded.toFixed(1)}M`;
    }
    // Table mode: show millions with 0-2 decimals
    const clampedDecimals = Math.min(Math.max(0, decimals), 2);
    return `$${rounded.toLocaleString(undefined, { 
      maximumFractionDigits: clampedDecimals,
      minimumFractionDigits: 0,
    })}`;
  }
  
  if (scale === 'BILLIONS') {
    if (mode === 'card') {
      return `$${rounded.toFixed(1)}B`;
    }
    const clampedDecimals = Math.min(Math.max(0, decimals), 2);
    return `$${rounded.toLocaleString(undefined, { 
      maximumFractionDigits: clampedDecimals,
      minimumFractionDigits: 0,
    })}`;
  }
  
  if (scale === 'RAW') {
    const compact = Intl.NumberFormat('en', { 
      notation: 'compact', 
      maximumFractionDigits: 1 
    }).format(rounded);
    return `$${compact}`;
  }
  
  // NONE or default
  const clampedDecimals = Math.min(Math.max(0, decimals), 2);
  return `$${rounded.toLocaleString(undefined, { 
    maximumFractionDigits: clampedDecimals,
    minimumFractionDigits: 0,
  })}`;
}

/**
 * Format percent with decimal clamping (1 decimal by default)
 */
export function formatPercent(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const clampedDecimals = Math.min(Math.max(1, decimals), 2);
  const rounded = smartRound(pct, clampedDecimals);
  
  return `${rounded.toFixed(clampedDecimals)}%`;
}

/**
 * Format percent with commas for large values
 */
export function formatPercentWithCommas(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const clampedDecimals = Math.min(Math.max(1, decimals), 2);
  const rounded = smartRound(pct, clampedDecimals);
  
  // Use commas for values >= 100
  if (Math.abs(rounded) >= 100) {
    return `${rounded.toLocaleString(undefined, {
      maximumFractionDigits: clampedDecimals,
      minimumFractionDigits: 0,
    })}%`;
  }
  
  return `${rounded.toFixed(clampedDecimals)}%`;
}

/**
 * Format ratio/factor with decimal clamping (2-3 decimals)
 */
export function formatRatio(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  
  const clampedDecimals = Math.min(Math.max(2, decimals), 3);
  const rounded = smartRound(value, clampedDecimals);
  
  return rounded.toFixed(clampedDecimals);
}

/**
 * Format shares (in millions) with 1 decimal
 */
export function formatShares(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return '—';
  
  const rounded = smartRound(value, 1);
  return `${rounded.toFixed(1)}mm`;
}

/**
 * Format number with smart rounding and K/M/B abbreviations
 */
export function formatNumber(value: number | null | undefined, decimals: number = 1, useAbbreviation: boolean = true): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  
  const rounded = smartRound(value, decimals);
  const clampedDecimals = Math.min(Math.max(0, decimals), 3);
  const absValue = Math.abs(rounded);
  const sign = rounded < 0 ? '-' : '';
  
  // Use abbreviations for large numbers if enabled
  if (useAbbreviation) {
    if (absValue >= 1_000_000_000) {
      return `${sign}${(absValue / 1_000_000_000).toFixed(clampedDecimals)}B`;
    }
    if (absValue >= 1_000_000) {
      return `${sign}${(absValue / 1_000_000).toFixed(clampedDecimals)}M`;
    }
    if (absValue >= 1_000) {
      return `${sign}${(absValue / 1_000).toFixed(clampedDecimals)}K`;
    }
  }
  
  return rounded.toLocaleString(undefined, {
    maximumFractionDigits: clampedDecimals,
    minimumFractionDigits: 0,
  });
}

/**
 * Format currency with K/M/B abbreviations
 */
export function formatCurrencyCompact(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  
  const rounded = smartRound(value, decimals);
  const clampedDecimals = Math.min(Math.max(0, decimals), 2);
  const absValue = Math.abs(rounded);
  const sign = rounded < 0 ? '-$' : '$';
  
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(clampedDecimals)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(clampedDecimals)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(clampedDecimals)}K`;
  }
  
  return `${sign}${rounded.toLocaleString(undefined, {
    maximumFractionDigits: clampedDecimals,
    minimumFractionDigits: 0,
  })}`;
}

