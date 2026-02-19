/**
 * Chart formatting — axis labels, tooltips, and Y-domain padding.
 * Consistent $ / % / K,M,B across all finance charts.
 */

/**
 * Format number for axis: compact $1.2K, $1.2M, $1.2B
 */
export function formatAxisCurrency(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Format number for axis: percentage, 1 decimal max
 */
export function formatAxisPercent(value: number): string {
  if (!Number.isFinite(value)) return '';
  return `${value.toFixed(1)}%`;
}

/**
 * Format for tooltip: full precision with commas and optional unit
 */
export function formatTooltipValue(
  value: number | null | undefined,
  format: 'currency' | 'percent' | 'number' = 'currency'
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (format === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Y-axis domain with padding (headroom). Prevents flat lines from touching edges.
 */
export function yDomainWithPadding(
  values: (number | null)[],
  paddingPct: number = 0.05,
  minSpan?: number
): [number, number] {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (valid.length === 0) return [0, 1];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === max) {
    const pad = minSpan ?? Math.max(Math.abs(min) * 0.01, 1);
    return [min - pad, max + pad];
  }
  const span = max - min;
  const pad = Math.max(span * paddingPct, minSpan ?? 0);
  return [min - pad, max + pad];
}

/** Suggested number of axis ticks for readability */
export const SUGGESTED_TICK_COUNT = 6;
