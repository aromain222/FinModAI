import type { PreviewV3 } from '@/types/preview-v3';

type NumericSeries = Array<{ year: string | number; value: number }>;

export type DerivedPreview = {
  sheetMeta: { sheetName: string; rowCount: number; colCount: number; fiscalYears: Array<string | number> };
  keyOutputs: {
    enterpriseValue?: number | null;
    equityValue?: number | null;
    pricePerShare?: number | null;
    netDebt?: number | null;
    shares?: number | null;
  };
  assumptions: Record<string, number | string | null>;
  series: {
    revenue?: NumericSeries;
    ebit?: NumericSeries;
    nopat?: NumericSeries;
    fcf?: NumericSeries;
    ebitMargin?: NumericSeries;
  };
  debug: { matchedLabels: string[] };
};

const normalizeLabel = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const str = String(value).trim();
  if (!str || str === '—' || str === '-') return null;
  const cleaned = str.replace(/[$,%]/g, '').replace(/,/g, '');
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  if (str.includes('%') && Math.abs(n) <= 1) return n; // already percent form
  if (str.includes('%')) return n / 100;
  return n;
};

const isYearLike = (value: unknown) => {
  const str = String(value ?? '').trim();
  return /^\d{4}$/.test(str);
};

const coerceYear = (value: unknown): string | number => {
  const str = String(value ?? '').trim();
  if (/^\d{4}$/.test(str)) return Number(str);
  return str || '';
};

const extractYears = (preview: PreviewV3): Array<string | number> => {
  const byColumns = (preview.columns || []).slice(1).filter((c) => isYearLike(c)).map(coerceYear);
  if (byColumns.length) return byColumns;

  for (const row of preview.rows || []) {
    if (!row || row.length < 2) continue;
    const first = normalizeLabel(row[0]);
    const restYears = row.slice(1).filter(isYearLike).map(coerceYear);
    if (first === 'FISCAL YEAR' && restYears.length) return restYears;
    if (restYears.length >= 2) return restYears;
  }
  return [];
};

export function extractFromSheet(preview: PreviewV3 | null | undefined): DerivedPreview | null {
  if (!preview?.rows || preview.rows.length === 0) return null;

  const years = extractYears(preview);
  const rowsMap: Record<string, number[]> = {};
  const matchedLabels: string[] = [];

  for (const row of preview.rows) {
    if (!row || row.length === 0) continue;
    const label = normalizeLabel(row[0]);
    if (!label) continue;
    const values = row.slice(1).map(parseNumber);
    rowsMap[label] = values;
  }

  const valueForLabel = (label: string): number | null => {
    const vals = rowsMap[label];
    if (!vals || vals.length === 0) return null;
    const numeric = vals.filter((v) => typeof v === 'number' && !Number.isNaN(v)) as number[];
    if (numeric.length === 0) return null;
    matchedLabels.push(label);
    return numeric[numeric.length - 1];
  };

  const seriesFrom = (label: string): NumericSeries | undefined => {
    const vals = rowsMap[label];
    if (!vals || vals.length === 0 || years.length === 0) return undefined;
    matchedLabels.push(label);
    return years.map((y, idx) => {
      const raw = vals[idx];
      const num = typeof raw === 'number' ? raw : null;
      return { year: y, value: num ?? NaN };
    });
  };

  const percentSeriesFrom = (label: string): NumericSeries | undefined => {
    const vals = rowsMap[label];
    if (!vals || vals.length === 0 || years.length === 0) return undefined;
    matchedLabels.push(label);
    return years.map((y, idx) => {
      const raw = vals[idx];
      const val = typeof raw === 'number' ? raw : null;
      const pct = val !== null && Math.abs(val) > 1 ? val / 100 : val;
      return { year: y, value: pct ?? NaN };
    });
  };

  const keyOutputs = {
    enterpriseValue: valueForLabel('ENTERPRISE VALUE'),
    equityValue: valueForLabel('EQUITY VALUE'),
    pricePerShare: valueForLabel('PRICE / SHARE') ?? valueForLabel('PRICE PER SHARE'),
    netDebt: valueForLabel('NET DEBT'),
    shares: valueForLabel('SHARES') ?? valueForLabel('SHARES OUTSTANDING'),
  };

  const assumptions: Record<string, number | string | null> = {};
  const setAssumption = (key: string, label: string) => {
    const v = valueForLabel(label);
    if (v !== null && v !== undefined) assumptions[key] = v;
  };
  setAssumption('taxRate', 'TAX RATE');
  setAssumption('revenueGrowth', 'REVENUE GROWTH');
  setAssumption('ebitMargin', 'EBIT MARGIN');

  const derived: DerivedPreview = {
    sheetMeta: {
      sheetName: preview.sheetName ?? 'Sheet',
      rowCount: preview.rows.length,
      colCount: preview.columns.length,
      fiscalYears: years,
    },
    keyOutputs,
    assumptions,
    series: {
      revenue: seriesFrom('REVENUE'),
      ebit: seriesFrom('EBIT'),
      nopat: seriesFrom('NOPAT'),
      fcf: seriesFrom('FREE CASH FLOW') ?? seriesFrom('FCF'),
      ebitMargin: percentSeriesFrom('EBIT MARGIN'),
    },
    debug: { matchedLabels },
  };

  return derived;
}
