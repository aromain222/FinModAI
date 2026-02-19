/**
 * Sheet Structure Builder
 * Standardized sheet creation with consistent structure
 */

import ExcelJS from 'exceljs';
import {
  createHeaderStyle,
  createSubHeaderStyle,
  createNormalStyle,
  createInputStyle,
  createFormulaStyle,
  createTotalStyle,
  applyBorders,
  applySectionHeaderBorder,
  applyTotalBorder,
  freezeTopRow,
  setColumnWidths,
  disableGridlines,
  applyNumberFormat,
  NUMBER_FORMATS,
  COLORS,
} from './formatting';

export interface TimeColumnConfig {
  baseYearLabel?: string; // e.g., "LTM" or "Base Year"
  forecastYears: number;   // Number of forecast years (typically 5)
  startYear?: number;      // Starting year for FY labels
  includeTerminal?: boolean; // Include terminal value column
}

/**
 * Create a sheet with standardized structure
 */
export function createSheetWithStructure(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  freezeHeaderRows: number = 1
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(sheetName);
  
  // Disable gridlines
  disableGridlines(sheet);
  
  // Freeze top row(s)
  if (freezeHeaderRows > 0) {
    freezeTopRow(sheet, freezeHeaderRows);
  }
  
  return sheet;
}

/**
 * Add section header row
 * Blue background, white text, bold, thick bottom border
 */
export function addSectionHeader(
  worksheet: ExcelJS.Worksheet,
  row: number,
  text: string,
  startCol: number = 1,
  endCol?: number
): void {
  const cell = worksheet.getCell(row, startCol);
  cell.value = text;
  const headerStyle = createHeaderStyle();
  Object.assign(cell, headerStyle);
  
  // Apply thick bottom border across columns if specified
  if (endCol && endCol > startCol) {
    applySectionHeaderBorder(worksheet, row, startCol, endCol);
  }
}

/**
 * Add time-based columns (LTM, FY1-FY5, Terminal)
 * Column B: Metric/Line Item
 * Column C: LTM/Base Year
 * Columns D onward: Forecast years
 */
export function addTimeColumns(
  worksheet: ExcelJS.Worksheet,
  row: number,
  config: TimeColumnConfig
): number {
  const { baseYearLabel = 'LTM', forecastYears = 5, startYear, includeTerminal = true } = config;
  
  let col = 2; // Start at column B
  
  // Column B: Metric/Line Item label (if needed)
  // This is typically set by the caller
  
  // Column C: Base Year / LTM
  col = 3;
  const baseCell = worksheet.getCell(row, col);
  baseCell.value = baseYearLabel;
  const subHeaderStyle = createSubHeaderStyle();
  Object.assign(baseCell, subHeaderStyle);
  
  // Columns D onward: Forecast years (FY1, FY2, etc.)
  const currentYear = startYear || new Date().getFullYear();
  for (let i = 0; i < forecastYears; i++) {
    col++;
    const yearCell = worksheet.getCell(row, col);
    const year = currentYear + i + 1;
    yearCell.value = `FY ${year}`;
    Object.assign(yearCell, subHeaderStyle);
  }
  
  // Terminal column (if included)
  if (includeTerminal) {
    col++;
    const terminalCell = worksheet.getCell(row, col);
    terminalCell.value = 'Terminal';
    Object.assign(terminalCell, subHeaderStyle);
  }
  
  return col; // Return last column number
}

/**
 * Add a metric row with time-based values
 */
export function addMetricRow(
  worksheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  values: (number | string)[],
  isInput: boolean = false,
  isTotal: boolean = false,
  numberFormat: keyof typeof NUMBER_FORMATS = 'CURRENCY',
  startCol: number = 3 // Start at column C (base year)
): void {
  // Column B: Label
  const labelCell = worksheet.getCell(row, 2);
  labelCell.value = label;
  const normalStyle = createNormalStyle();
  Object.assign(labelCell, normalStyle);
  labelCell.alignment = { vertical: 'middle', horizontal: 'left' };
  
  if (isTotal) {
    labelCell.font = { ...labelCell.font, bold: true };
  }
  
  // Value columns
  values.forEach((value, index) => {
    const col = startCol + index;
    const cell = worksheet.getCell(row, col);
    
    if (typeof value === 'string' && value.startsWith('=')) {
      // Formula
      cell.value = { formula: value.substring(1) };
      const formulaStyle = isTotal ? createTotalStyle() : createFormulaStyle();
      Object.assign(cell, formulaStyle);
    } else {
      // Value
      cell.value = value;
      if (isTotal) {
        const totalStyle = createTotalStyle();
        Object.assign(cell, totalStyle);
      } else if (isInput) {
        const inputStyle = createInputStyle(false);
        Object.assign(cell, inputStyle);
      } else {
        Object.assign(cell, normalStyle);
      }
    }
    
    // Apply number format
    if (typeof value === 'number' || (typeof value === 'string' && !value.startsWith('='))) {
      applyNumberFormat(cell, numberFormat);
    }
  });
  
  // Apply borders
  const endCol = startCol + values.length - 1;
  if (isTotal) {
    applyTotalBorder(worksheet, row, 2, endCol);
  } else {
    applyBorders(worksheet, row, row, 2, endCol, 'all');
  }
}

/**
 * Add a simple two-column row (label, value)
 */
export function addLabelValueRow(
  worksheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: any,
  isInput: boolean = false,
  isTotal: boolean = false,
  numberFormat?: keyof typeof NUMBER_FORMATS
): void {
  // Label column
  const labelCell = worksheet.getCell(row, 1);
  labelCell.value = label;
  const normalStyle = createNormalStyle();
  Object.assign(labelCell, normalStyle);
  labelCell.alignment = { vertical: 'middle', horizontal: 'left' };
  
  if (isTotal) {
    labelCell.font = { ...labelCell.font, bold: true };
  }
  
  // Value column
  const valueCell = worksheet.getCell(row, 2);
  valueCell.value = value;
  
  if (isTotal) {
    const totalStyle = createTotalStyle();
    Object.assign(valueCell, totalStyle);
  } else if (isInput) {
    const inputStyle = createInputStyle(false);
    Object.assign(valueCell, inputStyle);
  } else {
    Object.assign(valueCell, normalStyle);
  }
  
  if (numberFormat) {
    applyNumberFormat(valueCell, numberFormat);
  }
  
  // Apply borders
  if (isTotal) {
    applyTotalBorder(worksheet, row, 1, 2);
  } else {
    applyBorders(worksheet, row, row, 1, 2, 'all');
  }
}

/**
 * Set standard column widths for time-based sheets
 */
export function setTimeBasedColumnWidths(
  worksheet: ExcelJS.Worksheet,
  forecastYears: number = 5,
  includeTerminal: boolean = true
): void {
  const widths: number[] = [
    30, // Column B: Metric/Line Item
    15, // Column C: LTM/Base Year
  ];
  
  // Forecast year columns
  for (let i = 0; i < forecastYears; i++) {
    widths.push(15);
  }
  
  // Terminal column
  if (includeTerminal) {
    widths.push(15);
  }
  
  setColumnWidths(worksheet, widths);
}

/**
 * Add empty row for spacing
 */
export function addEmptyRow(worksheet: ExcelJS.Worksheet, row: number): number {
  return row + 1;
}

/**
 * Create a checks section
 * All checks should resolve to TRUE/OK
 */
export function addCheckRow(
  worksheet: ExcelJS.Worksheet,
  row: number,
  checkName: string,
  formula: string,
  expectedValue: boolean | string = true
): void {
  // Check name
  const nameCell = worksheet.getCell(row, 1);
  nameCell.value = checkName;
  const normalStyle = createNormalStyle();
  Object.assign(nameCell, normalStyle);
  nameCell.alignment = { vertical: 'middle', horizontal: 'left' };
  
  // Check formula
  const checkCell = worksheet.getCell(row, 2);
  checkCell.value = { formula };
  Object.assign(checkCell, normalStyle);
  
  // Status (formula that compares to expected)
  const statusCell = worksheet.getCell(row, 3);
  const statusFormula = typeof expectedValue === 'boolean'
    ? `=IF(${checkCell.address}=${expectedValue},"OK","ERROR")`
    : `=IF(${checkCell.address}="${expectedValue}","OK","ERROR")`;
  statusCell.value = { formula: statusFormula };
  Object.assign(statusCell, normalStyle);
  
  // Apply borders
  applyBorders(worksheet, row, row, 1, 3, 'all');
}
