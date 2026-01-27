/**
 * Safe Formatters - Never crash on null/undefined/NaN
 * 
 * All formatters return "—" for invalid values
 */

export function formatMoney(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (abs >= 1e9) {
    return `${sign}$${(abs / 1e9).toFixed(decimals)}B`;
  }
  if (abs >= 1e6) {
    return `${sign}$${(abs / 1e6).toFixed(decimals)}M`;
  }
  if (abs >= 1e3) {
    return `${sign}$${(abs / 1e3).toFixed(decimals)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatMultiple(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(decimals)}x`;
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (abs >= 1e9) {
    return `${sign}${(abs / 1e9).toFixed(1)}B`;
  }
  if (abs >= 1e6) {
    return `${sign}${(abs / 1e6).toFixed(1)}M`;
  }
  if (abs >= 1e3) {
    return `${sign}${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign}${abs.toFixed(decimals)}`;
}

export function formatPrice(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `$${value.toFixed(decimals)}`;
}

export function formatYears(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const years = Math.floor(value);
  return years === 1 ? '1 year' : `${years} years`;
}

/**
 * Safe getter for nested object properties
 */
export function safeGet<T>(
  obj: any,
  path: string,
  defaultValue: T
): T {
  if (!obj || typeof obj !== 'object') return defaultValue;
  
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return defaultValue;
    }
    current = current[key];
  }
  
  return current === undefined ? defaultValue : current;
}

/**
 * Safe array access
 */
export function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Format with fallback
 */
export function formatWithFallback(
  value: any,
  formatter: (v: any) => string,
  fallback = '—'
): string {
  try {
    if (value === null || value === undefined) return fallback;
    return formatter(value);
  } catch {
    return fallback;
  }
}
