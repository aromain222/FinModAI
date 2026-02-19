/**
 * Model Template — renderStatementSheet and print/freeze helpers
 * Single config-driven renderer so Excel and UI stay consistent.
 */

import ExcelJS from 'exceljs';
import { applyBorders, applyTotalBorder, COLORS } from './excel/formatting';
import {
  type StatementRowSchema,
  type ModelStyleConfig,
  DEFAULT_MODEL_STYLE,
  applyHeaderStyle,
  applySectionStyle,
  applyTotalStyle,
  applyLineStyle,
  formatNumberCell,
} from './modelFormat';

export type StatementDataByKey = Record<string, number[]>;

/**
 * Render a statement sheet (IS, BS, or CF) from row schema + data.
 * Same row order and labels as preview UI.
 */
export function renderStatementSheet(
  sheet: ExcelJS.Worksheet,
  title: string,
  schema: StatementRowSchema[],
  data: StatementDataByKey,
  years: number[],
  styleConfig: ModelStyleConfig = DEFAULT_MODEL_STYLE
): number {
  let row = 1;
  const numCols = years.length + 1;
  const labelCol = 1;
  const firstYearCol = 2;

  // Model title row (Row 1) + units banner row (Row 2)
  const titleRow = sheet.getRow(row);
  titleRow.height = 26;
  sheet.mergeCells(row, 1, row, numCols);
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF111827' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.border = {};
  row += 1;

  const unitsRow = sheet.getRow(row);
  unitsRow.height = 18;
  sheet.mergeCells(row, 1, row, numCols);
  const unitsCell = sheet.getCell(row, 1);
  unitsCell.value = 'All financial figures are in USD millions unless otherwise noted.';
  unitsCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF4B5563' } };
  unitsCell.alignment = { vertical: 'middle', horizontal: 'center' };
  unitsCell.border = {};
  row += 1;

  // Header row (Line Item | Y1 | Y2 | ...)
  sheet.getCell(row, labelCol).value = 'Line Item';
  applySectionStyle(sheet.getCell(row, labelCol), styleConfig);
  years.forEach((y, idx) => {
    const cell = sheet.getCell(row, firstYearCol + idx);
    cell.value = y;
    applySectionStyle(cell, styleConfig);
  });
  row++;

  const dataStartRow = row;
  const totalRows: number[] = [];

  for (const r of schema) {
    if (r.kind === 'spacer') {
      row++;
      continue;
    }

    const labelCell = sheet.getCell(row, labelCol);
    labelCell.value = r.label;
    labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: r.indent ?? 0 };

    const values = r.key.startsWith('_') ? [] : (data[r.key] ?? []);
    for (let i = 0; i < years.length; i++) {
      const cell = sheet.getCell(row, firstYearCol + i);
      const val = values[i] != null && Number.isFinite(values[i]) ? values[i] : 0;
      if (r.kind === 'section') {
        applySectionStyle(labelCell, styleConfig);
        cell.value = null;
      } else if (r.kind === 'total') {
        applyTotalStyle(labelCell, styleConfig);
        applyTotalStyle(cell, styleConfig);
        formatNumberCell(cell, val, r.format ?? 'currency', styleConfig, r.displayNegative ?? false);
        totalRows.push(row);
      } else {
        applyLineStyle(labelCell, styleConfig);
        applyLineStyle(cell, styleConfig);
        formatNumberCell(cell, val, r.format ?? 'currency', styleConfig, r.displayNegative ?? false);
      }
    }

    if (r.kind === 'section') {
      applySectionStyle(labelCell, styleConfig);
    }
    row++;
  }

  // Thin grid for body
  applyBorders(sheet, dataStartRow, row - 1, labelCol, numCols, 'all');
  // Totals: stronger top border
  totalRows.forEach((r) => applyTotalBorder(sheet, r, labelCol, numCols));

  // Column widths
  sheet.getColumn(labelCol).width = styleConfig.labelColumnWidth;
  for (let i = 0; i < years.length; i++) {
    sheet.getColumn(firstYearCol + i).width = styleConfig.yearColumnWidth;
  }

  return row;
}

/**
 * Freeze first column and top header rows for statement sheets.
 */
export function freezeFirstColumnAndHeader(
  sheet: ExcelJS.Worksheet,
  headerRowCount: number = 3
): void {
  sheet.views = [
    {
      state: 'frozen',
      xSplit: 1,
      ySplit: headerRowCount,
      topLeftCell: `B${headerRowCount + 1}`,
      activeCell: `B${headerRowCount + 1}`,
    },
  ];
}

/**
 * Print setup: fit to one page wide, repeat header rows, margins.
 */
export function applyPrintSetup(sheet: ExcelJS.Worksheet, headerRowCount: number = 3): void {
  sheet.pageSetup = {
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
  sheet.pageSetup.printTitlesRow = `1:${headerRowCount}`;
}
