import type { DealCategory, DealCurrency } from '@/lib/deal-intelligence/types';

const DEAL_CATEGORY_LABELS: Record<DealCategory, string> = {
  'M&A': 'M&A',
  'Venture Funding': 'Venture Funding',
  'Private Equity / Buyouts': 'Private Equity / Buyouts',
  ECM: 'Equity Capital Markets',
  DCM: 'Debt Capital Markets',
  'Strategic Partnership': 'Strategic Partnerships',
  Restructuring: 'Restructuring',
};

export function getDealCategoryLabel(category: DealCategory): string {
  return DEAL_CATEGORY_LABELS[category];
}

export function formatWeekDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  if (sameMonth) {
    const month = start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${month} ${start.getUTCDate()} - ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }

  if (sameYear) {
    const startLabel = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const endLabel = end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${startLabel} - ${endLabel}`;
  }

  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return `${startLabel} - ${endLabel}`;
}

export function formatDealSize(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return 'Undisclosed';
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}B`;
  return `$${Math.round(value).toLocaleString('en-US')}M`;
}

export function formatDealSizeWithCurrency(value: number | null, currency: DealCurrency): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return 'Undisclosed';
  return `${formatDealSize(value)} ${currency}`;
}

export function normalizeDealCurrency(value: string | null | undefined): DealCurrency {
  const normalized = (value ?? 'USD').trim().toUpperCase();
  if (normalized === 'EUR' || normalized === 'GBP' || normalized === 'JPY' || normalized === 'CAD') return normalized;
  return 'USD';
}
