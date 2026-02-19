/**
 * Schema Mapping Rules
 * 
 * Defines how ModelDocument maps to Excel and UI
 */

import type { ModelDocument, TableBlock, Row, Cell, Column, Section } from './ModelDocument';
import { DEFAULT_STYLE_TOKENS, type StyleTokens } from './StyleTokens';
import ExcelJS from 'exceljs';
import { titleBar } from '../../excel/styleKit';

/**
 * Excel Mapping Rules
 */

type TableExcelMapOptions = {
  sheetWidth?: number;
};

const EXCEL_COLORS = {
  white: 'FFFFFFFF',
  black: 'FF111827',
  mutedText: 'FF6B7280',
  lightGray: 'FFF3F4F6',
  lighterGray: 'FFF9FAFB',
  totalGray: 'FFE5E7EB',
  sectionGray: 'FFF3F4F6',
  borderLight: 'FFD1D5DB',
  borderDark: 'FF6B7280',
  inputBlue: 'FF1D4ED8',
  inputBlueFill: 'FFDBEAFE',
  inputBlueBorder: 'FF93C5FD',
} as const;

const BASE_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, color: { argb: EXCEL_COLORS.black } };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isYearColumn(col: Column): boolean {
  return /^\d{4}$/.test(col.label) || /^y\d{4}$/i.test(col.key);
}

function normalizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || 'Model';
}

function columnLetter(index: number): string {
  let result = '';
  let num = index;
  while (num > 0) {
    const mod = (num - 1) % 26;
    result = String.fromCharCode(65 + mod) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}

function resolveFormulaTemplate(
  formula: string,
  rowNumber: number,
  columnAddressMap: Record<string, string>
): string {
  if (!formula.includes('{')) return formula;
  return formula.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const col = columnAddressMap[key];
    if (!col) return match;
    return `${col}${rowNumber}`;
  });
}

function getSectionsMaxColumns(sections: Section[]): number {
  const maxTableColumns = sections
    .flatMap((section) => section.blocks)
    .filter((block): block is TableBlock => block.type === 'table')
    .reduce((max, block) => Math.max(max, block.columns.length), 0);
  // Keep a reasonable minimum width for small/narrow sheets (e.g., Scorecard),
  // without forcing a wide 8-column canvas that creates large empty whitespace.
  return Math.max(5, maxTableColumns || 0);
}

function applyBaseCellStyle(cell: ExcelJS.Cell): void {
  cell.font = { ...BASE_FONT };
  cell.alignment = { vertical: 'middle' };
}

function formatIsoUtc(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  // "YYYY-MM-DD HH:MM UTC"
  const iso = parsed.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${date} ${time} UTC`;
}

function baseRowHeight(sheet: ExcelJS.Worksheet, rowNumber: number, height = 18): void {
  sheet.getRow(rowNumber).height = height;
}

function writeMergedRowLabel(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  text: string,
  width: number,
  style: Partial<ExcelJS.Style>
): void {
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = text;
  applyBaseCellStyle(cell);
  cell.style = {
    ...cell.style,
    ...style,
  };
  if (width > 1) {
    sheet.mergeCells(rowNumber, 1, rowNumber, width);
  }
}

function inferredNumberFormat(column: Column, value: number, label?: string): string {
  if (column.format) return column.format;

  const lowerLabel = (label || `${column.label} ${column.key}`).toLowerCase();
  if (column.type === 'percent' || lowerLabel.includes('margin') || lowerLabel.includes('growth') || lowerLabel.includes('wacc')) {
    return '0.00%';
  }
  if (column.type === 'multiple') return '0.00"x"';
  const looksLikeCurrency =
    column.type === 'currency' ||
    lowerLabel.includes('price per share') ||
    lowerLabel.includes('per share') ||
    lowerLabel.includes('enterprise value') ||
    lowerLabel.includes('equity value') ||
    lowerLabel.includes('pv ') ||
    lowerLabel.includes('present value') ||
    lowerLabel.includes('terminal value') ||
    lowerLabel.includes('free cash flow') ||
    lowerLabel.includes('fcf') ||
    lowerLabel.includes('revenue') ||
    lowerLabel.includes('capex') ||
    lowerLabel.includes('debt') ||
    lowerLabel.includes('cash');

  if (looksLikeCurrency) {
    return lowerLabel.includes('per share') ? '$#,##0.00' : '$#,##0';
  }
  if (column.type === 'number') {
    return Math.abs(value) < 1000 ? '#,##0.00' : '#,##0';
  }
  return '#,##0.00';
}

function getCellFormatOverride(styleToken?: string): string | null {
  switch (styleToken) {
    case 'format:currency':
      return '$#,##0';
    case 'format:currency_2':
      return '$#,##0.00';
    case 'format:percent':
      return '0.00%';
    case 'format:money_mm':
      return '#,##0;(#,##0)';
    case 'format:percent_1':
      return '0.0%';
    case 'format:multiple_1':
      return '0.0"x"';
    case 'format:number':
      return '#,##0';
    default:
      return null;
  }
}

function numberFormatFromColumnType(column: Column, value: number, rowLabel?: string): string | null {
  if (column.format) return column.format;

  switch (column.type) {
    case 'currency':
      return (rowLabel || column.label).toLowerCase().includes('per share') ? '$#,##0.00' : '$#,##0';
    case 'percent':
      return '0.00%';
    case 'multiple':
      return '0.00"x"';
    case 'number':
      return Math.abs(value) < 1000 ? '#,##0.00' : '#,##0';
    default:
      return null;
  }
}

function applyRowTypeBorders(
  excelCell: ExcelJS.Cell,
  rowType: Row['rowType']
): void {
  const topStyle = rowType === 'total' ? 'thick' : rowType === 'subtotal' ? 'medium' : undefined;
  if (!topStyle) return;
  const existing = excelCell.border || {};
  excelCell.border = {
    ...existing,
    top: { style: topStyle, color: { argb: EXCEL_COLORS.borderDark } },
  };
}

function resolveLabelWidth(table: TableBlock): number {
  const longestLabel = table.rows.reduce((max, row) => {
    const len = (row.labelCell || row.cells?.[table.columns[0]?.key || '']?.value || '').toString().length;
    return Math.max(max, len);
  }, table.columns[0]?.label?.length || 0);
  const calculated = Math.ceil(longestLabel * 1.05);
  const preferred = clamp(calculated, 22, 34);
  return clamp(preferred, 12, 40);
}

function applyColumnWidths(sheet: ExcelJS.Worksheet, table: TableBlock): void {
  const firstColumnWidth = resolveLabelWidth(table);
  table.columns.forEach((col, index) => {
    const colNumber = index + 1;
    let width = col.width;
    if (!width) {
      if (index === 0) {
        width = firstColumnWidth;
      } else if (isYearColumn(col)) {
        width = 16;
      } else if (col.type === 'text') {
        width = 20;
      } else {
        width = 14;
      }
    }
    if (index > 0 && isYearColumn(col)) {
      width = clamp(width, 14, 18);
    }
    sheet.getColumn(colNumber).width = clamp(width, 10, 60);
  });
}

function renderMetadataBlock(
  sheet: ExcelJS.Worksheet,
  document: ModelDocument,
  sheetWidth: number,
  startRow: number = 1
): number {
  writeMergedRowLabel(sheet, startRow, `${document.meta.companyName} (${document.meta.ticker})`, sheetWidth, {
    font: { ...BASE_FONT, size: 18, bold: true },
    border: { bottom: { style: 'thick', color: { argb: EXCEL_COLORS.borderDark } } },
    alignment: { vertical: 'middle', horizontal: 'left' },
  });
  baseRowHeight(sheet, startRow, 28);

  const metadataRows: Array<[string, string]> = [
    ['Model', document.meta.modelType.toUpperCase()],
    ['As of', document.meta.asOfDate],
    ['Generated', formatIsoUtc(document.meta.generatedAt)],
    ['Currency / Units', `${document.meta.currency} / ${document.meta.units}`],
  ];

  let row = startRow + 1;
  for (const [label, value] of metadataRows) {
    const labelCell = sheet.getCell(row, 1);
    const valueCell = sheet.getCell(row, 2);
    applyBaseCellStyle(labelCell);
    applyBaseCellStyle(valueCell);
    labelCell.value = label;
    labelCell.font = { ...BASE_FONT, bold: true };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.lightGray } };
    valueCell.value = value;
    valueCell.font = { ...BASE_FONT, color: { argb: EXCEL_COLORS.mutedText } };
    row += 1;
  }

  return row + 1;
}

/**
 * Map ModelDocument to Excel Workbook
 */
export async function mapDocumentToExcel(
  document: ModelDocument,
  tokens?: StyleTokens
): Promise<ExcelJS.Workbook> {
  const styleTokens = tokens || DEFAULT_STYLE_TOKENS;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const defaultSheetName = `${document.meta.ticker}-${document.meta.modelType}`;
  const grouped = new Map<string, Section[]>();

  document.sections.forEach((section) => {
    const key = section.sheetName || defaultSheetName;
    const list = grouped.get(key) || [];
    list.push(section);
    grouped.set(key, list);
  });

  const sheetKeys = Array.from(grouped.keys());
  const primarySheetKey = sheetKeys.includes('Overview') ? 'Overview' : sheetKeys[0];

  for (const [sheetKey, sections] of grouped.entries()) {
    const sheetName = normalizeSheetName(sheetKey);
    const sheet = workbook.addWorksheet(sheetName);
    const sheetWidth = getSectionsMaxColumns(sections);
    const includeMetadata = sheetKey === primarySheetKey;

    const hasModelHeader = includeMetadata && document.meta.modelType === 'comps';
    let currentRow = 1;
    if (hasModelHeader) {
      titleBar(sheet, 'Comparable Company Analysis', sheetWidth);
      currentRow = renderMetadataBlock(sheet, document, sheetWidth, 3);
    } else if (includeMetadata) {
      currentRow = renderMetadataBlock(sheet, document, sheetWidth);
    }
    let isFirstSection = true;

    for (const section of sections) {
      if (section.title) {
        if (!isFirstSection) {
          currentRow += 1; // exactly one spacer row between major sections
        }
        writeMergedRowLabel(sheet, currentRow, section.title, sheetWidth, {
          font: { ...BASE_FONT, size: 14, bold: true },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.sectionGray } },
          border: {
            top: { style: 'thick', color: { argb: EXCEL_COLORS.borderDark } },
            bottom: { style: 'thin', color: { argb: EXCEL_COLORS.borderLight } },
          },
        });
        baseRowHeight(sheet, currentRow, 22);
        currentRow += 1;
      }

      if (section.subtitle) {
        const subtitleCell = sheet.getCell(currentRow, 1);
        applyBaseCellStyle(subtitleCell);
        subtitleCell.value = section.subtitle;
        subtitleCell.font = { ...BASE_FONT, size: 10, color: { argb: EXCEL_COLORS.mutedText }, italic: true };
        sheet.mergeCells(currentRow, 1, currentRow, sheetWidth);
        currentRow += 1;
      }

      for (const block of section.blocks) {
        if (block.type === 'table') {
          currentRow = mapTableBlockToExcel(block, sheet, currentRow, styleTokens, { sheetWidth });
        } else if (block.type === 'text') {
          const textCell = sheet.getCell(currentRow, 1);
          applyBaseCellStyle(textCell);
          textCell.value = block.content;
          textCell.alignment = { vertical: 'middle', wrapText: true };
          textCell.font = { ...BASE_FONT, size: 10, color: { argb: EXCEL_COLORS.mutedText } };
          sheet.mergeCells(currentRow, 1, currentRow, sheetWidth);
          baseRowHeight(sheet, currentRow, 22);
          currentRow += 1;
        } else if (block.type === 'spacer') {
          currentRow += block.height || 1;
        } else if (block.type === 'callout') {
          const calloutCell = sheet.getCell(currentRow, 1);
          applyBaseCellStyle(calloutCell);
          calloutCell.value = block.content;
          calloutCell.font = { ...BASE_FONT, italic: true, color: { argb: EXCEL_COLORS.mutedText } };
          calloutCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.lighterGray } };
          calloutCell.border = { left: { style: 'medium', color: { argb: EXCEL_COLORS.borderDark } } };
          sheet.mergeCells(currentRow, 1, currentRow, sheetWidth);
          baseRowHeight(sheet, currentRow, 20);
          currentRow += 1;
        }
      }
      isFirstSection = false;
    }

    const frozenRows = hasModelHeader ? 3 : includeMetadata ? 4 : 1;
    sheet.views = [
      {
        state: 'frozen',
        ySplit: frozenRows,
        xSplit: sheetWidth > 6 ? 1 : 0,
        topLeftCell: sheet.getCell(frozenRows + 1, sheetWidth > 6 ? 2 : 1).address,
        showGridLines: true,
      },
    ];

    sheet.pageSetup = {
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      orientation: sheetWidth > 8 ? 'landscape' : 'portrait',
      horizontalCentered: false,
      verticalCentered: false,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };

    for (let i = 1; i <= sheetWidth; i += 1) {
      const col = sheet.getColumn(i);
      if (!col.width) {
        col.width = i === 1 ? 28 : 14;
      }
    }
  }

  return workbook;
}

/**
 * Map TableBlock to Excel worksheet
 */
export function mapTableBlockToExcel(
  table: TableBlock,
  sheet: ExcelJS.Worksheet,
  startRow: number,
  _tokens?: StyleTokens,
  options: TableExcelMapOptions = {}
): number {
  const sheetWidth = options.sheetWidth || Math.max(table.columns.length, 5);
  let row = startRow;
  const columnAddressMap: Record<string, string> = {};
  table.columns.forEach((col, idx) => {
    columnAddressMap[col.key] = columnLetter(idx + 1);
  });

  if (table.title) {
    writeMergedRowLabel(sheet, row, table.title, sheetWidth, {
      font: { ...BASE_FONT, size: 13, bold: true },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.lightGray } },
      border: {
        top: { style: 'thick', color: { argb: EXCEL_COLORS.borderDark } },
        bottom: { style: 'thin', color: { argb: EXCEL_COLORS.borderLight } },
      },
    });
    baseRowHeight(sheet, row, 20);
    row += 1;
  }

  if (table.subtitle) {
    const subtitleCell = sheet.getCell(row, 1);
    applyBaseCellStyle(subtitleCell);
    subtitleCell.value = table.subtitle;
    subtitleCell.font = { ...BASE_FONT, size: 10, color: { argb: EXCEL_COLORS.mutedText }, italic: true };
    sheet.mergeCells(row, 1, row, sheetWidth);
    row += 1;
  }

  applyColumnWidths(sheet, table);

  const hasGroups = table.columns.some((col) => col.group);
  if (hasGroups) {
    const groupMap = new Map<string, number[]>();
    table.columns.forEach((col, idx) => {
      if (!col.group) return;
      const indices = groupMap.get(col.group) || [];
      indices.push(idx + 1);
      groupMap.set(col.group, indices);
    });

    groupMap.forEach((colIndices, groupName) => {
      const startCol = colIndices[0];
      const endCol = colIndices[colIndices.length - 1];
      if (endCol > startCol) {
        sheet.mergeCells(row, startCol, row, endCol);
      }
      const groupCell = sheet.getCell(row, startCol);
      applyBaseCellStyle(groupCell);
      groupCell.value = groupName;
      groupCell.font = { ...BASE_FONT, size: 10, bold: true };
      groupCell.alignment = { vertical: 'middle', horizontal: 'center' };
      groupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.lighterGray } };
      groupCell.border = {
        bottom: { style: 'thin', color: { argb: EXCEL_COLORS.borderLight } },
      };
    });
    row += 1;
  }

  const headerRow = sheet.getRow(row);
  table.columns.forEach((col, idx) => {
    const headerCell = headerRow.getCell(idx + 1);
    applyBaseCellStyle(headerCell);
    headerCell.value = col.label;
    headerCell.font = { ...BASE_FONT, bold: true };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.lightGray } };
    headerCell.alignment = {
      vertical: 'middle',
      horizontal: isYearColumn(col) ? 'center' : col.align,
      wrapText: true,
    };
    headerCell.border = {
      bottom: { style: 'medium', color: { argb: EXCEL_COLORS.borderDark } },
    };
  });
  headerRow.height = 20;
  row += 1;

  const dataStartRow = row;
  let zebraToggle = false;
  for (const dataRow of table.rows) {
    if (dataRow.rowType === 'blank') {
      row += 1;
      continue;
    }

    const excelRow = sheet.getRow(row);
    const shouldStripe = dataRow.rowType === 'data' && zebraToggle;

    table.columns.forEach((col, colIdx) => {
      const excelCell = excelRow.getCell(colIdx + 1);
      applyBaseCellStyle(excelCell);
      const fallbackLabel =
        colIdx === 0 && dataRow.labelCell !== undefined
          ? `${'  '.repeat(Math.max(0, dataRow.indentLevel || 0))}${dataRow.labelCell}`
          : undefined;
      const cell = dataRow.cells[col.key] || (fallbackLabel !== undefined ? ({ value: fallbackLabel } as Cell) : undefined);

      if (!cell) {
        if (fallbackLabel !== undefined) {
          excelCell.value = fallbackLabel;
        }
      } else if (cell.formula) {
        const resolvedFormula = resolveFormulaTemplate(cell.formula, row, columnAddressMap);
        excelCell.value = { formula: resolvedFormula, result: typeof cell.value === 'number' ? cell.value : undefined } as any;
      } else if (
        dataRow.rowType === 'total' &&
        cell.meta?.method === 'sumAbove' &&
        colIdx > 0
      ) {
        const columnLetterRef = columnAddressMap[col.key];
        const rangeStart = dataStartRow;
        const rangeEnd = row - 1;
        const formula = `SUM(${columnLetterRef}${rangeStart}:${columnLetterRef}${rangeEnd})`;
        excelCell.value = { formula, result: typeof cell.value === 'number' ? cell.value : undefined } as any;
      } else if (cell.value === null || cell.meta?.status === 'missing') {
        excelCell.value = '—';
        excelCell.font = { ...BASE_FONT, color: { argb: EXCEL_COLORS.mutedText } };
      } else {
        excelCell.value = cell.value;
      }

      if (cell?.display && (cell.value === null || cell.value === undefined)) {
        excelCell.value = cell.display;
      }

      if (shouldStripe) {
        excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.lighterGray } };
      }

      if (dataRow.rowType === 'header') {
        excelCell.font = { ...BASE_FONT, bold: true };
        excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.lightGray } };
      }

      if (dataRow.rowType === 'subtotal' || dataRow.rowType === 'total') {
        excelCell.font = { ...BASE_FONT, bold: true };
        if (dataRow.rowType === 'total') {
          excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.totalGray } };
        }
        applyRowTypeBorders(excelCell, dataRow.rowType);
      }

      if (cell?.meta?.status === 'user_provided') {
        excelCell.font = { ...BASE_FONT, bold: false, italic: true, color: { argb: EXCEL_COLORS.inputBlue } };
        excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.inputBlueFill } };
        excelCell.border = {
          ...(excelCell.border || {}),
          top: { style: 'thin', color: { argb: EXCEL_COLORS.inputBlueBorder } },
          left: { style: 'thin', color: { argb: EXCEL_COLORS.inputBlueBorder } },
          right: { style: 'thin', color: { argb: EXCEL_COLORS.inputBlueBorder } },
          bottom: { style: 'thin', color: { argb: EXCEL_COLORS.inputBlueBorder } },
        };
      }

      if (cell?.meta?.status === 'missing' || cell?.value === null) {
        excelCell.numFmt = 'General';
      } else if (typeof cell?.value === 'number') {
        const columnDrivenFormat = numberFormatFromColumnType(col, cell.value, dataRow.labelCell || col.label);
        const styleOverrideFormat = getCellFormatOverride(cell.style);
        let resolvedFormat = columnDrivenFormat;

        // For generic numeric columns, allow explicit semantic override from builder.
        if (col.type === 'number' && styleOverrideFormat) {
          resolvedFormat = styleOverrideFormat;
        }

        // If still generic, fall back to label-based inference.
        if (!resolvedFormat || (col.type === 'number' && !styleOverrideFormat)) {
          resolvedFormat = inferredNumberFormat(col, cell.value, dataRow.labelCell || col.label);
        }

        excelCell.numFmt = resolvedFormat || '#,##0.00';
      }

      excelCell.alignment = {
        vertical: 'middle',
        horizontal: colIdx === 0 ? 'left' : col.align,
        wrapText: false,
      };
    });

    excelRow.height = 18;
    if (dataRow.rowType === 'data') {
      zebraToggle = !zebraToggle;
    }
    row += 1;
  }

  if (table.footnotes?.length) {
    row += 1;
    table.footnotes.forEach((footnote, idx) => {
      const noteCell = sheet.getCell(row + idx, 1);
      applyBaseCellStyle(noteCell);
      noteCell.value = footnote;
      noteCell.font = { ...BASE_FONT, size: 9, italic: true, color: { argb: EXCEL_COLORS.mutedText } };
      sheet.mergeCells(row + idx, 1, row + idx, sheetWidth);
    });
    row += table.footnotes.length;
  }

  return row + 1;
}

/**
 * UI Mapping Rules
 */

/**
 * Map ModelDocument to UI Preview
 */
export interface UIPreviewConfig {
  maxRows?: number; // Max rows to show before truncation
  maxYears?: number; // Max years to show (show first + last)
  showTruncation?: boolean; // Show truncation indicators
}

/**
 * Get truncated rows for UI
 */
export function getTruncatedRows(
  rows: Row[],
  config: UIPreviewConfig = {}
): { visible: Row[]; hidden: number; indicator?: Row } {
  const { maxRows = 50, showTruncation = true } = config;
  
  if (rows.length <= maxRows) {
    return { visible: rows, hidden: 0 };
  }
  
  const visible = rows.slice(0, maxRows);
  const hidden = rows.length - maxRows;
  
  let indicator: Row | undefined;
  if (showTruncation && hidden > 0) {
    indicator = {
      rowKey: 'truncation-indicator',
      rowType: 'blank',
      cells: {},
    };
  }
  
  return { visible, hidden, indicator };
}

/**
 * Get truncated columns for UI (for time series)
 */
export function getTruncatedColumns(
  columns: Column[],
  config: UIPreviewConfig = {}
): { visible: Column[]; hidden: number } {
  const { maxYears } = config;
  
  if (!maxYears) {
    return { visible: columns, hidden: 0 };
  }
  
  // Find year columns (heuristic: columns with numeric labels or 'y20xx' pattern)
  const yearColumns = columns.filter(col => 
    /^\d{4}$/.test(col.label) || /^y20\d{2}$/i.test(col.key)
  );
  
  if (yearColumns.length <= maxYears) {
    return { visible: columns, hidden: 0 };
  }
  
  // Show first, last, and middle columns
  const first = yearColumns[0];
  const last = yearColumns[yearColumns.length - 1];
  const middle = yearColumns.slice(1, -1).slice(0, maxYears - 2);
  
  const visibleYearKeys = new Set([
    first.key,
    ...middle.map(c => c.key),
    last.key,
  ]);
  
  const visible = columns.filter(col => 
    !yearColumns.includes(col) || visibleYearKeys.has(col.key)
  );
  
  const hidden = columns.length - visible.length;
  
  return { visible, hidden };
}

/**
 * Format cell value for UI display
 */
export function formatCellForUI(cell: Cell, column: Column): string {
  if (cell.value === null || cell.value === undefined) {
    return ''; // Excel shows blank for null
  }
  
  // Use display if provided
  if (cell.display) {
    return cell.display;
  }
  
  // Format based on column type
  if (column.type === 'currency') {
    const num = typeof cell.value === 'number' ? cell.value : parseFloat(String(cell.value));
    if (isNaN(num)) return String(cell.value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  }
  
  if (column.type === 'percent') {
    const num = typeof cell.value === 'number' ? cell.value : parseFloat(String(cell.value));
    if (isNaN(num)) return String(cell.value);
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(num);
  }
  
  if (column.type === 'multiple') {
    const num = typeof cell.value === 'number' ? cell.value : parseFloat(String(cell.value));
    if (isNaN(num)) return String(cell.value);
    return `${num.toFixed(1)}x`;
  }
  
  return String(cell.value);
}

/**
 * Get cell style for UI
 */
export function getCellStyleForUI(cell: Cell, row: Row, tokens?: StyleTokens): Record<string, any> {
  const style: React.CSSProperties = {};
  
  // Apply style based on cell meta
  if (cell.meta?.status === 'user_provided') {
    style.color = tokens?.colors.text.input || '#0066CC';
    style.fontStyle = 'italic';
  } else if (cell.meta?.status === 'derived') {
    style.color = tokens?.colors.text.formula || '#000000';
  }
  
  // Apply row type styles
  if (row.rowType === 'total' || row.rowType === 'subtotal') {
    style.fontWeight = 'bold';
    style.borderTop = '2px solid #999999';
  }
  
  if (row.rowType === 'header') {
    style.fontWeight = 'bold';
    style.backgroundColor = tokens?.colors.background.header || '#E8E8E8';
  }
  
  return style;
}
