/**
 * Demo finance formatting — units, scaling, and strict rounding for demo models.
 * All core financial tables: USD (millions). No raw floating-point in outputs.
 *
 * Rules:
 * - Financial line items (Revenue, EBITDA, EBIT, FCF): 0 decimals, thousands separators.
 * - Percentages: 1 decimal max.
 * - Prices: 2 decimals max.
 * - Optional: "≈ $443B" helper when value > 100,000 (USD mm).
 */

export const DEMO_UNIT_LABEL = 'USD millions';
export const DEMO_UNIT_SUBLABEL = '(USD mm)';

/**
 * Format currency for demo: 0 decimals, thousands separators. Never show raw float.
 * Values are assumed in USD millions.
 */
export function formatDemoCurrency(
  value: number | null | undefined,
  opts?: { decimals?: number; showApproxB?: boolean }
): string {
  if (value == null || !Number.isFinite(value)) return '';
  const decimals = opts?.decimals ?? 0;
  const rounded = decimals === 0 ? Math.round(value) : Number(value.toFixed(decimals));
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(rounded);
  if (opts?.showApproxB && Math.abs(value) > 100_000) {
    const b = (value / 1_000).toFixed(1);
    return `${formatted} (≈ $${b}B)`;
  }
  return formatted;
}

/**
 * Format percentage for demo: 1 decimal max. Never show raw float.
 */
export function formatDemoPercent(value: number | null | undefined, maxDecimals = 1): string {
  if (value == null || !Number.isFinite(value)) return '';
  const normalized = Math.abs(value) > 1.5 ? value / 100 : value;
  const rounded = Number((normalized * 100).toFixed(maxDecimals)) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
    useGrouping: false,
  }).format(rounded);
}

/**
 * Format price per share: 2 decimals max.
 */
export function formatDemoPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(2));
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(rounded);
}

/**
 * Format multiple (e.g. EV/EBITDA): 1 decimal.
 */
export function formatDemoMultiple(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(1));
  return `${rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}

/**
 * Optional helper text for large numbers (display-only): "≈ $443B" when value > 100,000 (USD mm).
 */
export function demoApproxB(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) <= 100_000) return '';
  const b = (value / 1_000).toFixed(1);
  return `≈ $${b}B`;
}
