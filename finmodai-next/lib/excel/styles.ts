/**
 * Global Excel style system for investor-grade workbooks.
 * Single module: palette, typography, section/table styles, number formats, borders, print.
 * Use across DCF, Comps, and Three-Statement generators.
 */

import type ExcelJS from 'exceljs';

// --- Palette (minimal, modern) ---
export const PALETTE = {
  // Neutrals
  black: 'FF1A1A1A',
  grey900: 'FF333333',
  grey700: 'FF555555',
  grey500: 'FF777777',
  grey400: 'FF999999',
  grey300: 'FFB0B0B0',
  grey200: 'FFD0D0D0',
  grey100: 'FFE8E8E8',
  grey50: 'FFF5F5F5',
  white: 'FFFFFFFF',
  // Accent (blue, sell-side)
  accent: 'FF2563EB',
  accentLight: 'FFEFF6FF',
  inputFill: 'FFE8F0FA',
} as const;

// --- Typography ---
export const TYPOGRAPHY = {
  fontName: 'Calibri',
  titleSize: 14,
  subtitleSize: 11,
  sectionSize: 11,
  tableHeaderSize: 10,
  bodySize: 11,
  footnoteSize: 9,
} as const;

// --- Number formats (currency = USD millions, negative in parentheses) ---
export const NUM_FMT = {
  currency: '"$"#,##0_;("$"#,##0)',
  currencyDecimals: '"$"#,##0.00_;("$"#,##0.00)',
  integer: '#,##0',
  percent: '0.0%',
  percentDecimals: '0.00%',
  multiple: '#,##0.0"x"',
  decimal: '#,##0.00',
} as const;

export type NumberKind = 'currency' | 'integer' | 'percent' | 'multiple' | 'decimal';

/** Set sheet view: freeze panes, zoom, gridlines, ready for print. */
export function setSheetViewDefaults(
  ws: ExcelJS.Worksheet,
  options: { freezeRow?: number; freezeCol?: number; showGridLines?: boolean } = {}
): void {
  const freezeRow = options.freezeRow ?? 0;
  const freezeCol = options.freezeCol ?? 1;
  ws.properties = ws.properties || {};
  ws.properties.showGridLines = options.showGridLines ?? true;
  if (freezeRow > 0 || freezeCol > 0) {
    ws.views = [
      {
        state: 'frozen',
        xSplit: freezeCol,
        ySplit: freezeRow,
        topLeftCell: freezeRow > 0 && freezeCol > 0 ? getCellRef(freezeRow + 1, freezeCol + 1) : undefined,
        activeCell: freezeRow > 0 && freezeCol > 0 ? getCellRef(freezeRow + 1, freezeCol + 1) : undefined,
      },
    ];
  }
}

/** Apply title bar: row 1 = title, optional row 2 = subtitle. Returns next row index. */
export function applyTitleBar(
  ws: ExcelJS.Worksheet,
  opts: { title: string; subtitle?: string }
): number {
  const cell = ws.getCell(1, 1);
  cell.value = opts.title;
  cell.font = {
    name: TYPOGRAPHY.fontName,
    size: TYPOGRAPHY.titleSize,
    bold: true,
    color: { argb: PALETTE.black },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  let row = 2;
  if (opts.subtitle) {
    const sub = ws.getCell(row, 1);
    sub.value = opts.subtitle;
    sub.font = {
      name: TYPOGRAPHY.fontName,
      size: TYPOGRAPHY.footnoteSize,
      color: { argb: PALETTE.grey500 },
    };
    sub.alignment = { vertical: 'middle', horizontal: 'left' };
    row++;
  }
  return row;
}

/** Apply metadata block (Company, Ticker, Model, As-of, Generated, Units). Returns next row index. */
export function applyMetaBlock(
  ws: ExcelJS.Worksheet,
  opts: {
    company?: string;
    ticker?: string;
    model?: string;
    asOf?: string;
    generatedAt?: string;
    units?: string;
    currency?: string;
  },
  startRow: number,
  valueCol: number = 2
): number {
  const raw: Array<[string, string | undefined]> = [
    ['Company', opts.company],
    ['Ticker', opts.ticker],
    ['Model', opts.model],
    ['As-of', opts.asOf],
    ['Generated', opts.generatedAt],
    ['Units', opts.units ?? (opts.currency ? `${opts.currency} / millions` : 'USD / millions')],
  ];
  const entries = raw.filter(([, v]) => v != null && v !== '') as Array<[string, string | undefined]>;
  let r = startRow;
  for (const [label, value] of entries) {
    const labelCell = ws.getCell(r, 1);
    labelCell.value = label;
    labelCell.font = { name: TYPOGRAPHY.fontName, size: TYPOGRAPHY.bodySize, color: { argb: PALETTE.grey700 } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left' };
    const valueCell = ws.getCell(r, valueCol);
    valueCell.value = value ?? '';
    valueCell.font = { name: TYPOGRAPHY.fontName, size: TYPOGRAPHY.bodySize, color: { argb: PALETTE.black } };
    valueCell.alignment = { vertical: 'middle', horizontal: 'left' };
    r++;
  }
  return r;
}

/** Style a section header (single cell or row range). */
export function styleSectionHeader(rowOrRange: ExcelJS.Cell | ExcelJS.Row): void {
  const row = rowOrRange as ExcelJS.Row;
  if ('eachCell' in row && typeof row.eachCell === 'function') {
    row.eachCell((cell: ExcelJS.Cell) => applySectionHeaderToCell(cell));
  } else {
    applySectionHeaderToCell(rowOrRange as ExcelJS.Cell);
  }
}

function applySectionHeaderToCell(cell: ExcelJS.Cell): void {
  cell.font = {
    name: TYPOGRAPHY.fontName,
    size: TYPOGRAPHY.sectionSize,
    bold: true,
    color: { argb: PALETTE.black },
  };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PALETTE.grey100 },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = {
    bottom: { style: 'thin', color: { argb: PALETTE.grey200 } },
  };
}

/** Style a table header row (year labels or column headers). */
export function styleTableHeader(rowOrRange: ExcelJS.Cell | ExcelJS.Row): void {
  const row = rowOrRange as ExcelJS.Row;
  if ('eachCell' in row && typeof row.eachCell === 'function') {
    row.eachCell((cell: ExcelJS.Cell) => applyTableHeaderToCell(cell));
  } else {
    applyTableHeaderToCell(rowOrRange as ExcelJS.Cell);
  }
}

function applyTableHeaderToCell(cell: ExcelJS.Cell): void {
  cell.font = {
    name: TYPOGRAPHY.fontName,
    size: TYPOGRAPHY.tableHeaderSize,
    bold: true,
    color: { argb: PALETTE.black },
  };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PALETTE.grey100 },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = {
    top: { style: 'thin', color: { argb: PALETTE.grey200 } },
    bottom: { style: 'thin', color: { argb: PALETTE.grey200 } },
    left: { style: 'thin', color: { argb: PALETTE.grey200 } },
    right: { style: 'thin', color: { argb: PALETTE.grey200 } },
  };
}

/** Style an input (editable) cell — light blue fill, no formula. */
export function styleInputCell(cell: ExcelJS.Cell): void {
  cell.font = {
    name: TYPOGRAPHY.fontName,
    size: TYPOGRAPHY.bodySize,
    color: { argb: PALETTE.grey900 },
  };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PALETTE.inputFill },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  cell.border = {
    top: { style: 'thin', color: { argb: PALETTE.grey200 } },
    bottom: { style: 'thin', color: { argb: PALETTE.grey200 } },
    left: { style: 'thin', color: { argb: PALETTE.grey200 } },
    right: { style: 'thin', color: { argb: PALETTE.grey200 } },
  };
}

/** Style a calculated (formula or result) cell — no fill, black text. */
export function styleCalculatedCell(cell: ExcelJS.Cell): void {
  cell.font = {
    name: TYPOGRAPHY.fontName,
    size: TYPOGRAPHY.bodySize,
    color: { argb: PALETTE.black },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
}

/** Apply number format by kind. */
export function styleNumber(cell: ExcelJS.Cell, kind: NumberKind): void {
  cell.numFmt = NUM_FMT[kind === 'currency' ? 'currency' : kind === 'percent' ? 'percent' : kind === 'multiple' ? 'multiple' : kind === 'integer' ? 'integer' : 'decimal'];
}

/** Light outline for a range; optional section divider (thick bottom). */
export function borderRange(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  options: { thickBottom?: boolean; thin?: boolean } = {}
): void {
  const thin = { style: 'thin' as const, color: { argb: PALETTE.grey200 } };
  const thickBottom = { style: 'medium' as const, color: { argb: PALETTE.grey300 } };
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: thin,
        left: thin,
        right: thin,
        bottom: r === endRow && options.thickBottom ? thickBottom : thin,
      };
    }
  }
}

/** Print: fit to one page wide, repeat header rows, margins. */
export function setPrintArea(
  ws: ExcelJS.Worksheet,
  options: { headerRowCount?: number; printArea?: string } = {}
): void {
  const headerRowCount = options.headerRowCount ?? 4;
  ws.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    orientation: 'landscape',
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3,
    },
  };
  ws.pageSetup.printTitlesRow = `1:${headerRowCount}`;
  if (options.printArea) {
    ws.pageSetup.printArea = options.printArea;
  }
}

/** Column letter from 1-based index (e.g. 1 -> A, 27 -> AA). */
export function colLetter(col: number): string {
  let letter = '';
  let n = col;
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** A1-style cell reference from 1-based row and column. */
export function getCellRef(row: number, col: number): string {
  return `${colLetter(col)}${row}`;
}

// --- Shared workbook utilities (no array-in-cell, consistent formatting) ---

/** Convert number | number[] to array of length N; pad with last/first or fallback. Never return string. */
export function normalizeSeries(
  input: number | number[] | undefined,
  years: number[],
  fallback: number
): number[] {
  const n = years.length;
  if (n === 0) return [];
  if (typeof input === 'number' && Number.isFinite(input)) return Array(n).fill(input);
  if (Array.isArray(input) && input.length > 0) {
    const arr = input.filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
    if (arr.length >= n) return arr.slice(0, n);
    const last = arr[arr.length - 1] ?? fallback;
    return [...arr, ...Array(n - arr.length).fill(last)];
  }
  return Array(n).fill(fallback);
}

/** Write a row of values starting at colStart; apply numFmt and style. Never write array as string. */
export function writeRowSeries(
  ws: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  values: (number | null)[],
  numFmt?: NumberKind
): void {
  values.forEach((v, i) => {
    const cell = ws.getCell(row, colStart + i);
    if (v != null && Number.isFinite(v)) {
      cell.value = v;
      if (numFmt) styleNumber(cell, numFmt);
      styleCalculatedCell(cell);
    } else {
      cell.value = null;
      styleCalculatedCell(cell);
    }
  });
}

/** Alias for table header row styling. */
export function styleHeaderRow(row: ExcelJS.Cell | ExcelJS.Row): void {
  styleTableHeader(row);
}

/** Style input cell with optional number format. */
export function styleInputCellWithFormat(cell: ExcelJS.Cell, numFmt?: NumberKind): void {
  styleInputCell(cell);
  if (numFmt) styleNumber(cell, numFmt);
}

/** Apply sheet defaults: freeze, gridlines, print setup, margins, hide columns after lastUsedCol. */
export function applySheetDefaults(
  ws: ExcelJS.Worksheet,
  options: {
    freezeRow?: number;
    freezeCol?: number;
    showGridLines?: boolean;
    headerRowCount?: number;
    lastUsedCol?: number;
    lastUsedRow?: number;
    hideColumnsAfter?: number;
    hideRowsAfter?: number;
  } = {}
): void {
  setSheetViewDefaults(ws, {
    freezeRow: options.freezeRow ?? 0,
    freezeCol: options.freezeCol ?? 1,
    showGridLines: options.showGridLines ?? false,
  });
  setPrintArea(ws, {
    headerRowCount: options.headerRowCount ?? 4,
    printArea:
      options.lastUsedCol != null && options.lastUsedRow != null
        ? `A1:${colLetter(options.lastUsedCol)}${options.lastUsedRow}`
        : undefined,
  });
  const hideAfterCol = options.hideColumnsAfter ?? options.lastUsedCol;
  if (hideAfterCol != null && hideAfterCol < 50) {
    for (let c = hideAfterCol + 1; c <= Math.min(hideAfterCol + 20, 50); c++) {
      const col = ws.getColumn(c);
      col.hidden = true;
    }
  }
}
