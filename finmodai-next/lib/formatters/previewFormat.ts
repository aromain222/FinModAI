import type { UnitsScale } from '@/lib/previewDerived/types';

const moneyAbbrev = (value: number) =>
  Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export const formatMoney = (value: number | null | undefined, scale: UnitsScale, mode: 'table' | 'card' = 'table') => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const val = Number(value);
  if (scale === 'MILLIONS') {
    if (mode === 'card') {
      if (Math.abs(val) >= 1000) return `$${moneyAbbrev(val / 1000)}B`;
      return `$${moneyAbbrev(val)}M`;
    }
    return `$${val.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  }
  if (scale === 'BILLIONS') {
    if (mode === 'card') return `$${moneyAbbrev(val)}B`;
    return `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (scale === 'RAW') return `$${moneyAbbrev(val)}`;
  return `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
};

export const formatFactor = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(3);
};

export const formatSharesMm = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return '—';
  return `${value.toFixed(1)}mm`;
};

export const getRowKind = (label: string): 'percent' | 'factor' | 'money' | 'shares' | 'text' => {
  const pctLabels = ['REVENUE GROWTH', 'EBIT MARGIN', 'TAX RATE', 'WACC', 'TERMINAL GROWTH', 'TERMINAL GROWTH RATE'];
  const factorLabels = ['DISCOUNT FACTOR'];
  const shareLabels = ['SHARES OUTSTANDING (MM)', 'SHARES OUTSTANDING', 'SHARES (MM)', 'SHARES'];
  if (pctLabels.includes(label)) return 'percent';
  if (factorLabels.includes(label)) return 'factor';
  if (shareLabels.includes(label)) return 'shares';
  return 'money';
};

export const formatCell = (label: string, value: any, units: UnitsScale, mode: 'table' | 'card' = 'table') => {
  if (value === null || value === undefined || value === '') return '—';
  const kind = getRowKind(label);
  if (kind === 'percent') return formatPercent(typeof value === 'number' ? value : Number(value));
  if (kind === 'factor') return formatFactor(typeof value === 'number' ? value : Number(value));
  if (kind === 'shares') return formatSharesMm(typeof value === 'number' ? value : Number(value));
  if (typeof value === 'number') return formatMoney(value, units, mode);
  const parsed = Number(String(value));
  if (!Number.isNaN(parsed)) return formatMoney(parsed, units, mode);
  return String(value);
};
