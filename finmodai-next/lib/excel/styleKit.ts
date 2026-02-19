/**
 * CapitalBase Excel Style Kit
 * Reusable styling and layout for DCF, Comps, and Three-Statement workbooks.
 * Single font family, consistent hierarchy, no array-in-cell, hide unused area.
 */

import type ExcelJS from 'exceljs';

const FONT = 'Calibri';
const TITLE_SIZE = 17;
const HEADER_SIZE = 12;
const BODY_SIZE = 11;
const SMALL_SIZE = 10;

export const COLORS = {
  titleBar: 'FF2C3E50',
  sectionFill: 'FFECF0F1',
  tableHeader: 'FF34495E',
  white: 'FFFFFFFF',
  inputFill: 'FFE8F4FC',
  outputFill: 'FFE8F8F0',
  border: 'FFBDC3C7',
  text: 'FF2C3E50',
  muted: 'FF7F8C8D',
} as const;

export const NUM_FMT = {
  fmtMoney0: '"$"#,##0_;("$"#,##0)',
  fmtMoney1: '"$"#,##0.0_;("$"#,##0.0)',
  fmtMoney2: '"$"#,##0.00_;("$"#,##0.00)',
  fmtNumber0: '#,##0',
  fmtNumber2: '#,##0.00',
  fmtPercent1: '0.0%',
  fmtPercent2: '0.00%',
  fmtMultiple2: '#,##0.00"x"',
  fmtDate: 'yyyy-mm-dd',
} as const;

function colLetter(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Workbook-level metadata (company, created). */
export function applyWorkbookDefaults(workbook: ExcelJS.Workbook, opts?: { company?: string }): void {
  workbook.creator = opts?.company ?? 'CapitalBase';
  workbook.created = new Date();
  workbook.modified = new Date();
}

/** Sheet view: gridlines off, freeze panes, zoom 100%, margins, fit-to-width. */
export function applySheetDefaults(
  ws: ExcelJS.Worksheet,
  opts: {
    freezeRow?: number;
    freezeCol?: number;
    headerRowCount?: number;
    lastCol?: number;
    lastRow?: number;
  } = {}
): void {
  ws.properties = ws.properties || {};
  ws.properties.showGridLines = false;
  const freezeRow = opts.freezeRow ?? 0;
  const freezeCol = opts.freezeCol ?? 0;
  if (freezeRow > 0 || freezeCol > 0) {
    ws.views = [{
      state: 'frozen',
      xSplit: freezeCol,
      ySplit: freezeRow,
      zoomScale: 100,
      topLeftCell: freezeRow > 0 || freezeCol > 0 ? `${colLetter(freezeCol + 1)}${freezeRow + 1}` : undefined,
    }];
  }
  const headerRows = opts.headerRowCount ?? 5;
  ws.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    orientation: 'landscape',
    margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  };
  ws.pageSetup.printTitlesRow = `1:${headerRows}`;
  if (opts.lastCol != null && opts.lastRow != null) {
    ws.pageSetup.printArea = `A1:${colLetter(opts.lastCol)}${opts.lastRow}`;
  }
}

/** Set column widths from array (1-based index) or record. */
export function setColumnWidths(
  ws: ExcelJS.Worksheet,
  widths: Record<number, number> | number[]
): void {
  if (Array.isArray(widths)) {
    widths.forEach((w, i) => {
      if (typeof w === 'number') ws.getColumn(i + 1).width = w;
    });
  } else {
    Object.entries(widths).forEach(([col, w]) => {
      const c = parseInt(col, 10);
      if (c >= 1 && typeof w === 'number') ws.getColumn(c).width = w;
    });
  }
}

/** Hide columns after lastCol and rows after lastRow to remove massive whitespace. */
export function hideUnusedArea(ws: ExcelJS.Worksheet, lastCol: number, lastRow: number): void {
  for (let c = lastCol + 1; c <= Math.min(lastCol + 30, 50); c++) {
    try { ws.getColumn(c).hidden = true; } catch { /* ignore */ }
  }
  for (let r = lastRow + 1; r <= Math.min(lastRow + 100, 200); r++) {
    try { ws.getRow(r).hidden = true; } catch { /* ignore */ }
  }
}

/**
 * Model header (Title + Units banner).
 *
 * Layout:
 * Row 1: Title (merged across colSpan)
 * Row 2: Units banner (merged across colSpan)
 *
 * Freeze panes are handled elsewhere (typically ySplit=3 to freeze through Row 3 headers).
 */
export function titleBar(ws: ExcelJS.Worksheet, titleText: string, colSpan: number = 10): number {
  const titleRow = 1;
  const titleCell = ws.getCell(titleRow, 1);
  titleCell.value = titleText;
  titleCell.font = { name: FONT, size: 16, bold: true, color: { argb: 'FF111827' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  if (colSpan > 1) {
    try { ws.mergeCells(titleRow, 1, titleRow, colSpan); } catch { /* merge may fail if already merged */ }
  }
  ws.getRow(titleRow).height = 26;

  const unitsRow = 2;
  const unitsCell = ws.getCell(unitsRow, 1);
  unitsCell.value = 'All financial figures are in USD millions unless otherwise noted.';
  unitsCell.font = { name: FONT, size: 11, italic: true, color: { argb: 'FF4B5563' } };
  unitsCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  if (colSpan > 1) {
    try { ws.mergeCells(unitsRow, 1, unitsRow, colSpan); } catch { /* merge may fail if already merged */ }
  }
  ws.getRow(unitsRow).height = 18;

  return unitsRow + 1;
}

/** Section header row: subtle fill, bold. */
export function sectionHeader(ws: ExcelJS.Worksheet, row: number, label: string, colSpan: number = 10): void {
  const cell = ws.getCell(row, 1);
  cell.value = label;
  cell.font = { name: FONT, size: HEADER_SIZE, bold: true, color: { argb: COLORS.text } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sectionFill } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } };
  if (colSpan > 1) {
    try { ws.mergeCells(row, 1, row, colSpan); } catch { }
  }
  ws.getRow(row).height = 20;
}

/** Table header row: dark fill, white text, borders (colStart..colEnd). */
export function tableHeader(ws: ExcelJS.Worksheet, row: number, colStart: number, colEnd: number): void {
  for (let c = colStart; c <= colEnd; c++) {
    const cell = ws.getCell(row, c);
    cell.font = { name: FONT, size: SMALL_SIZE, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.tableHeader } };
    cell.alignment = { vertical: 'middle', horizontal: c === colStart ? 'left' : 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.border } },
      bottom: { style: 'thin', color: { argb: COLORS.border } },
      left: { style: 'thin', color: { argb: COLORS.border } },
      right: { style: 'thin', color: { argb: COLORS.border } },
    };
  }
  ws.getRow(row).height = 22;
}

/** Zebra striping for data rows. */
export function zebraRows(
  ws: ExcelJS.Worksheet,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number
): void {
  const fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF8F9FA' } };
  for (let r = rowStart; r <= rowEnd; r++) {
    if ((r - rowStart) % 2 === 1) {
      for (let c = colStart; c <= colEnd; c++) {
        ws.getCell(r, c).fill = fill;
      }
    }
  }
}

/** Input cell: light blue/gray fill, border. */
export function inputCell(cell: ExcelJS.Cell): void {
  cell.font = { name: FONT, size: BODY_SIZE, color: { argb: COLORS.text } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.inputFill } };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
  };
}

/** Output cell: light green fill, bold, border. */
export function outputCell(cell: ExcelJS.Cell): void {
  cell.font = { name: FONT, size: BODY_SIZE, bold: true, color: { argb: COLORS.text } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.outputFill } };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
  };
}

/** Body cell (calculated, no fill). */
export function bodyCell(cell: ExcelJS.Cell): void {
  cell.font = { name: FONT, size: BODY_SIZE, color: { argb: COLORS.text } };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
}

/** Apply number format by key. */
export function applyNumFmt(cell: ExcelJS.Cell, key: keyof typeof NUM_FMT): void {
  cell.numFmt = NUM_FMT[key];
}

/** Thin border box around range. */
export function borderBox(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number
): void {
  const thin = { style: 'thin' as const, color: { argb: COLORS.border } };
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: thin,
        bottom: thin,
        left: thin,
        right: thin,
      };
    }
  }
}

export function rightAlign(cell: ExcelJS.Cell): void {
  cell.alignment = cell.alignment || {};
  cell.alignment.horizontal = 'right';
}
export function centerAlign(cell: ExcelJS.Cell): void {
  cell.alignment = cell.alignment || {};
  cell.alignment.horizontal = 'center';
}
export function wrap(cell: ExcelJS.Cell): void {
  cell.alignment = cell.alignment || {};
  cell.alignment.wrapText = true;
}
export function indent(cell: ExcelJS.Cell, level: number): void {
  cell.alignment = cell.alignment || {};
  cell.alignment.indent = level;
}

/** Write a matrix of values safely (no array/object stringify). */
export function writeValues(
  ws: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  matrix: (string | number | null)[][],
  opts: { numFmt?: keyof typeof NUM_FMT; style?: 'input' | 'output' | 'body' } = {}
): void {
  const styleFn = opts.style === 'input' ? inputCell : opts.style === 'output' ? outputCell : bodyCell;
  matrix.forEach((rowArr, i) => {
    rowArr.forEach((val, j) => {
      const cell = ws.getCell(startRow + i, startCol + j);
      if (typeof val === 'number' && Number.isFinite(val)) {
        cell.value = val;
        if (opts.numFmt) applyNumFmt(cell, opts.numFmt);
      } else if (typeof val === 'string') {
        cell.value = val;
      } else {
        cell.value = null;
      }
      styleFn(cell);
    });
  });
}

/**
 * Write a series across year columns. NEVER stringify an array into one cell.
 * - If series is number[]: write series[i] in colStart+i (one cell per year).
 * - If series is number: write same value in every year column.
 */
export function writeSeriesAcrossYears(
  ws: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  years: number[],
  series: number | number[],
  numFmt: keyof typeof NUM_FMT,
  styleFn: (cell: ExcelJS.Cell) => void
): void {
  const n = years.length;
  const values: number[] = typeof series === 'number'
    ? Array(n).fill(series)
    : Array.isArray(series)
      ? series.length >= n
        ? series.slice(0, n)
        : [...series, ...Array(n - series.length).fill(series[series.length - 1] ?? 0)]
      : Array(n).fill(0);
  values.forEach((v, i) => {
    const cell = ws.getCell(row, colStart + i);
    if (v != null && Number.isFinite(v)) {
      cell.value = v;
      applyNumFmt(cell, numFmt);
    } else {
      cell.value = null;
    }
    styleFn(cell);
  });
}

/** Compact metadata block (Model, As Of, Generated, Currency/Units). Returns next row. */
export function metadataBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  opts: { model?: string; asOf?: string; generated?: string; units?: string },
  valueCol: number = 2
): number {
  const rows: [string, string][] = [];
  if (opts.model) rows.push(['Model', opts.model]);
  if (opts.asOf) rows.push(['As Of', opts.asOf]);
  if (opts.generated) rows.push(['Generated', opts.generated]);
  if (opts.units) rows.push(['Currency / Units', opts.units]);
  rows.forEach(([label, value], i) => {
    const r = startRow + i;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { name: FONT, size: SMALL_SIZE, color: { argb: COLORS.muted } };
    ws.getCell(r, 1).alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getCell(r, valueCol).value = value;
    ws.getCell(r, valueCol).font = { name: FONT, size: SMALL_SIZE, color: { argb: COLORS.text } };
    ws.getCell(r, valueCol).alignment = { vertical: 'middle', horizontal: 'left' };
  });
  return startRow + rows.length;
}

export { colLetter };
