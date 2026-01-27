/**
 * Format helpers for model previews
 * Returns "—" for null/undefined values instead of $0
 */

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${value.toFixed(2)}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}x`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}
