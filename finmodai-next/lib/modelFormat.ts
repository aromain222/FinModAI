/**
 * Model Format — Shared row schema, style config, and formatters
 * Used by Excel template and preview UI so structure stays consistent.
 */

import {
  createHeaderStyle,
  createSubHeaderStyle,
  createNormalStyle,
  createTotalStyle,
  createFormulaStyle,
  COLORS,
} from './excel/formatting';

// ─── Row schema (drives both Excel and UI) ─────────────────────────────────

export type RowKind = 'section' | 'line' | 'total' | 'spacer';
export type CellFormat = 'currency' | 'percent' | 'number' | 'integer' | 'text';

export interface StatementRowSchema {
  key: string;
  label: string;
  kind: RowKind;
  indent?: number; // 0 = no indent, 1 = 1 level, etc.
  format?: CellFormat;
  tooltip?: string;
  /** For CF: display as negative when true (e.g. Capex) */
  displayNegative?: boolean;
}

export interface ModelStyleConfig {
  fontName: string;
  baseFontSize: number;
  headerFontSize: number;
  sectionHeaderFontSize: number;
  labelColumnWidth: number;
  yearColumnWidth: number;
  currencyFormat: string;
  currencyNegativeFormat: string;
  percentFormat: string;
  /** Use for section header fill */
  sectionFillArgb: string;
  borderArgb: string;
}

export const DEFAULT_MODEL_STYLE: ModelStyleConfig = {
  fontName: 'Calibri',
  baseFontSize: 10,
  headerFontSize: 12,
  sectionHeaderFontSize: 10,
  labelColumnWidth: 38,
  yearColumnWidth: 13,
  currencyFormat: '#,##0',
  currencyNegativeFormat: '(#,##0)',
  percentFormat: '0.0%',
  sectionFillArgb: COLORS.GREY_SUBHEADER,
  borderArgb: COLORS.BORDER_GREY,
};

// ─── Income Statement row schema (mandatory order) ─────────────────────────

export const INCOME_STATEMENT_ROW_SCHEMA: StatementRowSchema[] = [
  { key: 'revenue', label: 'Revenue', kind: 'line', indent: 0, format: 'currency', tooltip: 'Total revenue' },
  { key: 'cogs', label: '(-) COGS', kind: 'line', indent: 1, format: 'currency', tooltip: 'Cost of goods sold' },
  { key: 'grossProfit', label: '= Gross Profit', kind: 'total', indent: 1, format: 'currency', tooltip: 'Revenue minus COGS' },
  { key: '_spacer1', label: '', kind: 'spacer' },
  { key: 'opEx', label: '(-) OpEx', kind: 'line', indent: 1, format: 'currency', tooltip: 'Operating expenses' },
  { key: 'ebitda', label: '= EBITDA', kind: 'total', indent: 1, format: 'currency', tooltip: 'Earnings before interest, tax, D&A' },
  { key: 'da', label: '(-) D&A', kind: 'line', indent: 1, format: 'currency', tooltip: 'Depreciation & amortization' },
  { key: 'ebit', label: '= EBIT', kind: 'total', indent: 1, format: 'currency', tooltip: 'Earnings before interest and tax' },
  { key: '_spacer2', label: '', kind: 'spacer' },
  { key: 'interestExpense', label: '(-) Interest', kind: 'line', indent: 1, format: 'currency', tooltip: 'Interest expense' },
  { key: 'ebt', label: '= Pre-Tax Income', kind: 'total', indent: 1, format: 'currency', tooltip: 'Earnings before tax' },
  { key: 'tax', label: '(-) Taxes', kind: 'line', indent: 1, format: 'currency', displayNegative: true, tooltip: 'Income tax expense' },
  { key: 'netIncome', label: '= Net Income', kind: 'total', indent: 1, format: 'currency', tooltip: 'Net income' },
];

// ─── Balance Sheet row schema ─────────────────────────────────────────────

export const BALANCE_SHEET_ROW_SCHEMA: StatementRowSchema[] = [
  { key: 'assets_header', label: 'ASSETS', kind: 'section', format: 'text' },
  { key: 'cash', label: 'Cash', kind: 'line', indent: 1, format: 'currency', tooltip: 'Cash and equivalents' },
  { key: 'ar', label: 'Accounts Receivable', kind: 'line', indent: 1, format: 'currency' },
  { key: 'inventory', label: 'Inventory', kind: 'line', indent: 1, format: 'currency' },
  { key: 'currentAssets', label: 'Current Assets', kind: 'total', indent: 1, format: 'currency' },
  { key: 'ppe', label: 'PP&E', kind: 'line', indent: 1, format: 'currency', tooltip: 'Property, plant & equipment' },
  { key: 'totalAssets', label: 'Total Assets', kind: 'total', indent: 1, format: 'currency' },
  { key: '_spacer1', label: '', kind: 'spacer' },
  { key: 'liab_header', label: 'LIABILITIES & EQUITY', kind: 'section', format: 'text' },
  { key: 'ap', label: 'Accounts Payable', kind: 'line', indent: 1, format: 'currency' },
  { key: 'currentLiabilities', label: 'Current Liabilities', kind: 'total', indent: 1, format: 'currency' },
  { key: 'debt', label: 'Debt', kind: 'line', indent: 1, format: 'currency' },
  { key: 'totalLiabilities', label: 'Total Liabilities', kind: 'total', indent: 1, format: 'currency' },
  { key: 'equity', label: 'Equity', kind: 'line', indent: 1, format: 'currency' },
  { key: 'totalLiabAndEquity', label: 'Total Liab. & Equity', kind: 'total', indent: 1, format: 'currency' },
];

// ─── Cash Flow row schema ─────────────────────────────────────────────────

export const CASH_FLOW_ROW_SCHEMA: StatementRowSchema[] = [
  { key: 'netIncome', label: 'Net Income', kind: 'line', indent: 0, format: 'currency' },
  { key: 'da', label: '+ D&A', kind: 'line', indent: 1, format: 'currency', tooltip: 'Add-back depreciation & amortization' },
  { key: 'changeNWC', label: '± Change in NWC', kind: 'line', indent: 1, format: 'currency', tooltip: 'Change in net working capital' },
  { key: 'cfo', label: '= Cash From Operations', kind: 'total', indent: 1, format: 'currency' },
  { key: '_spacer1', label: '', kind: 'spacer' },
  { key: 'capex', label: '(-) Capex', kind: 'line', indent: 1, format: 'currency', displayNegative: true, tooltip: 'Capital expenditures (outflow)' },
  { key: 'cfi', label: '= Cash From Investing', kind: 'total', indent: 1, format: 'currency' },
  { key: '_spacer2', label: '', kind: 'spacer' },
  { key: 'cff', label: '= Cash From Financing', kind: 'total', indent: 1, format: 'currency' },
  { key: 'netCashChange', label: 'Net Change in Cash', kind: 'total', indent: 1, format: 'currency' },
  { key: 'endingCash', label: 'Ending Cash', kind: 'total', indent: 1, format: 'currency', tooltip: 'Ties to Balance Sheet' },
];

// ─── Excel style helpers (apply to cells) ───────────────────────────────────
// Cell type: ExcelJS.Cell-compatible (value, numFmt, style props)

export function applyHeaderStyle(cell: any, _config?: ModelStyleConfig): void {
  const style = createHeaderStyle();
  Object.assign(cell, style);
}

export function applySectionStyle(cell: any, config: ModelStyleConfig = DEFAULT_MODEL_STYLE): void {
  const style = createSubHeaderStyle();
  Object.assign(cell, style);
  if (config.sectionFillArgb) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: config.sectionFillArgb },
    };
  }
}

export function applyTotalStyle(cell: any, _config?: ModelStyleConfig): void {
  const style = createTotalStyle();
  Object.assign(cell, style);
}

export function applyLineStyle(cell: any, _config?: ModelStyleConfig): void {
  const style = createFormulaStyle();
  Object.assign(cell, style);
}

export function applyNormalStyle(cell: any): void {
  const style = createNormalStyle();
  Object.assign(cell, style);
}

/** Format a number cell in Excel (currency, percent, integer). No "—"; use 0 for missing so projection is fully populated. */
export function formatNumberCell(
  cell: any,
  value: number | null | undefined,
  format: CellFormat,
  config: ModelStyleConfig = DEFAULT_MODEL_STYLE,
  displayNegative = false
): void {
  const num = value != null && Number.isFinite(value) ? value : 0;
  const displayVal = displayNegative && num > 0 ? -num : num;
  cell.value = displayVal;
  if (format === 'currency') {
    cell.numFmt = displayVal < 0 ? config.currencyNegativeFormat : config.currencyFormat;
  } else if (format === 'percent') {
    cell.numFmt = config.percentFormat;
  } else if (format === 'integer') {
    cell.numFmt = '#,##0';
  } else {
    cell.numFmt = config.currencyFormat;
  }
}

// ─── UI display formatters (no Excel) ─────────────────────────────────────

export function formatCurrency(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return '';
  const rounded = decimals === 0 ? Math.round(value) : Number(value.toFixed(decimals));
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(rounded);
}

export function formatCurrencySigned(value: number | null | undefined, displayNegative: boolean, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return '';
  const v = displayNegative && value > 0 ? -value : value;
  if (v < 0) return `(${formatCurrency(-v, decimals)})`;
  return formatCurrency(v, decimals);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return '';
  const norm = Math.abs(value) > 1.5 ? value / 100 : value;
  const pct = norm * 100;
  const rounded = decimals === 0 ? Math.round(pct) : Number(pct.toFixed(decimals));
  return `${rounded}%`;
}

/** For UI: no "—"; strict rounding — 0 decimals for currency, 1 for percent. No raw float. */
export function formatCellDisplay(
  value: number | null | undefined,
  format: CellFormat,
  opts?: { displayNegative?: boolean; decimals?: number }
): string {
  if (value == null || !Number.isFinite(value)) return '';
  const v = opts?.displayNegative && value > 0 ? -value : value;
  const dec = opts?.decimals;
  if (format === 'currency') {
    const d = dec ?? 0;
    const rounded = d === 0 ? Math.round(v) : Number(v.toFixed(d));
    return rounded < 0 ? `(${formatCurrency(-rounded, d)})` : formatCurrency(rounded, d);
  }
  if (format === 'percent') {
    const d = dec ?? 1;
    return formatPercent(v, d);
  }
  if (format === 'integer') return formatCurrency(Math.round(v), 0);
  return formatCurrency(v, dec ?? 0);
}
