import type { PreviewV3 } from '@/types/preview-v3';
import type { DerivedPreview, UnitsScale } from './types';

type RowMap = Record<string, Array<number | null>>;

const normalizeLabel = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/^[\+\-\•\s]+/, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();

const isMissingCell = (v: unknown) => v === null || v === undefined || String(v).trim() === '' || ['—', '-', 'N/A', 'NA'].includes(String(v).trim().toUpperCase());

const coerceNumber = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const str = String(v).trim();
  if (isMissingCell(str)) return null;
  const cleaned = str.replace(/[\$,]/g, '').replace(/%/g, '');
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  if (str.includes('%') && Math.abs(num) > 1) return num / 100;
  return num;
};

const detectUnits = (rows: any[]): { label: string; scale: UnitsScale } => {
  for (const r of rows) {
    if (!r || r.length === 0) continue;
    const first = String(r[0] ?? '').toLowerCase();
    if (first.startsWith('units')) {
      const text = String(r.join(' ')).toLowerCase();
      if (text.includes('billion')) return { label: 'USD Billions', scale: 'BILLIONS' };
      if (text.includes('million')) return { label: 'USD Millions', scale: 'MILLIONS' };
      return { label: r.join(' '), scale: 'RAW' };
    }
  }
  return { label: 'Unknown', scale: 'UNKNOWN' };
};

const detectYears = (preview: PreviewV3): Array<number | string> => {
  for (const row of preview.rows) {
    if (!row || row.length < 2) continue;
    const first = normalizeLabel(row[0]);
    if (first === 'FISCAL YEAR') {
      return row
        .slice(1)
        .filter((v) => !isMissingCell(v))
        .map((v) => {
          const n = Number(String(v).trim());
          return Number.isNaN(n) ? String(v).trim() : n;
        });
    }
  }
  const headerYears = preview.columns.slice(1).filter((c) => /^\d{4}$/.test(String(c))).map((c) => Number(c));
  return headerYears;
};

const buildRowMap = (rows: any[], years: Array<number | string>): RowMap => {
  const map: RowMap = {};
  rows.forEach((row) => {
    if (!row || row.length === 0) return;
    const label = normalizeLabel(row[0]);
    if (!label) return;
    const values = row.slice(1, 1 + years.length).map(coerceNumber);
    map[label] = values;
  });
  return map;
};

const pickFirst = (vals?: Array<number | null>): number | null => {
  if (!vals) return null;
  for (const v of vals) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
  }
  return null;
};

const seriesFrom = (
  label: string,
  rows: RowMap,
  years: Array<number | string>,
  opts?: { asPercent?: boolean }
): Array<{ year: number | string; value: number }> | undefined => {
  const vals = rows[label];
  if (!vals || vals.length === 0) return undefined;
  return years.map((y, idx) => {
    const raw = vals[idx];
    let val = typeof raw === 'number' ? raw : NaN;
    if (opts?.asPercent && !Number.isNaN(val) && Math.abs(val) > 1) val = val / 100;
    return { year: y, value: val };
  });
};

const labelAliases: Record<string, string[]> = {
  ENTERPRISE_VALUE: ['ENTERPRISE VALUE'],
  EQUITY_VALUE: ['EQUITY VALUE'],
  NET_DEBT: ['NET DEBT', '- NET DEBT', 'NETDEBT'],
  SHARES: ['SHARES OUTSTANDING (MM)', 'SHARES OUTSTANDING', 'SHARES (MM)', 'SHARES'],
  PRICE: ['PRICE PER SHARE', 'PRICE / SHARE', 'PRICE/SHARE'],
  REVENUE: ['REVENUE'],
  EBIT: ['EBIT'],
  NOPAT: ['NOPAT'],
  FCF: ['UNLEVERED FREE CASH FLOW', 'FREE CASH FLOW', 'FCF'],
  EBIT_MARGIN: ['EBIT MARGIN'],
  TAX_RATE: ['TAX RATE'],
  REVENUE_GROWTH: ['REVENUE GROWTH'],
  WACC: ['WACC'],
  TERMINAL_GROWTH: ['TERMINAL GROWTH', 'TERMINAL GROWTH RATE'],
  DISCOUNT_FACTOR: ['DISCOUNT FACTOR'],
};

const findLabel = (key: string, rows: RowMap): string | null => {
  for (const alias of labelAliases[key] || []) {
    if (rows[alias]) return alias;
  }
  return null;
};

const inferYearRange = (years: Array<number | string>): string => {
  if (!years || years.length === 0) return '—';
  const first = years[0];
  const last = years[years.length - 1];
  return `${first}–${last}`;
};

export function extractFromSheet(preview: PreviewV3 | null | undefined): DerivedPreview | null {
  if (!preview?.rows || preview.rows.length === 0) return null;

  const units = detectUnits(preview.rows);
  const years = detectYears(preview);
  const rowMap = buildRowMap(preview.rows, years);
  const matchedLabels: string[] = [];

  const mark = (label: string | null) => {
    if (label) matchedLabels.push(label);
    return label;
  };

  const getValue = (key: string): number | null => {
    const label = mark(findLabel(key, rowMap));
    if (!label) return null;
    const vals = rowMap[label];
    return pickFirst(vals);
  };

  const assumptions: Record<string, { label: string; value: number | string | null; kind: 'percent' | 'money' | 'number' | 'text' }> = {};

  const setAssumption = (field: string, label: string, kind: 'percent' | 'money' | 'number' | 'text') => {
    const value = getValue(label);
    if (value !== null && value !== undefined) assumptions[field] = { label, value, kind };
  };

  setAssumption('taxRate', 'TAX_RATE', 'percent');
  setAssumption('revenueGrowth', 'REVENUE_GROWTH', 'percent');
  setAssumption('ebitMargin', 'EBIT_MARGIN', 'percent');
  setAssumption('wacc', 'WACC', 'percent');
  setAssumption('terminalGrowth', 'TERMINAL_GROWTH', 'percent');
  setAssumption('discountFactor', 'DISCOUNT_FACTOR', 'number');

  const series = {
    revenue: seriesFrom(findLabel('REVENUE', rowMap) ?? '', rowMap, years),
    ebit: seriesFrom(findLabel('EBIT', rowMap) ?? '', rowMap, years),
    nopat: seriesFrom(findLabel('NOPAT', rowMap) ?? '', rowMap, years),
    fcf: seriesFrom(findLabel('FCF', rowMap) ?? '', rowMap, years),
    ebitMargin: seriesFrom(findLabel('EBIT_MARGIN', rowMap) ?? '', rowMap, years, { asPercent: true }),
  };

  const derived: DerivedPreview = {
    units,
    sheetMeta: {
      sheetName: preview.sheetName ?? 'Sheet',
      rowCount: preview.rows.length,
      colCount: preview.columns.length,
      years,
      yearRangeLabel: inferYearRange(years),
    },
    keyOutputs: {
      enterpriseValue: getValue('ENTERPRISE_VALUE'),
      equityValue: getValue('EQUITY_VALUE'),
      netDebt: getValue('NET_DEBT'),
      sharesMm: (() => {
        const shares = getValue('SHARES');
        if (shares === 0) return null;
        return shares;
      })(),
      pricePerShare: getValue('PRICE'),
      notes: [],
    },
    assumptions,
    series,
    file: { ready: false, label: 'Not available' },
    debug: { matchedLabels, chosenSources: ['sheet'] },
  };

  if ((!derived.keyOutputs.pricePerShare || Number.isNaN(derived.keyOutputs.pricePerShare)) && derived.keyOutputs.equityValue && derived.keyOutputs.sharesMm && derived.keyOutputs.sharesMm > 0) {
    derived.keyOutputs.pricePerShare = derived.keyOutputs.equityValue / derived.keyOutputs.sharesMm;
  }

  if (!derived.keyOutputs.pricePerShare) {
    derived.keyOutputs.notes?.push('Price/share unavailable: shares missing in workbook.');
  }

  return derived;
}
