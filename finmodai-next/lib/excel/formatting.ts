/**
 * Excel Formatting Utilities
 * Professional IB/PE-grade formatting standards
 */

import ExcelJS from 'exceljs';
import { WORKBOOK_FONT_NAME, sanitizeWorkbookText } from './workbookText';

// Color constants (ARGB format)
export const COLORS = {
  BLUE_HEADER: 'FF4472C4',      // Section headers
  WHITE: 'FFFFFFFF',             // White text
  BLACK: 'FF000000',             // Black text (formulas)
  BLUE_INPUT: 'FF0066CC',       // Blue font for inputs
  GREEN_LINK: 'FF00B050',       // Green font for links
  GREY_SUBHEADER: 'FFD9D9D9',   // Grey sub-headers
  LIGHT_GREY: 'FFE7E6E6',       // Light grey background
  BORDER_GREY: 'FFD0D0D0',      // Border color
} as const;

/**
 * Add a global model title + units banner to the top of a sheet.
 *
 * Layout:
 * Row 1: Model title (merged across totalColumns)
 * Row 2: Units banner (merged across totalColumns)
 *
 * Freeze panes at Row 4 so Row 3 (column headers) stays visible.
 * Caller should start writing content at Row 3.
 */
export function addModelHeader(
  sheet: ExcelJS.Worksheet,
  title: string,
  totalColumns: number,
  options?: { freezeCol?: number }
): void {
  const freezeCol = options?.freezeCol ?? 1;

  sheet.properties.showGridLines = false;

  sheet.getRow(1).height = 26;
  sheet.getCell(1, 1).value = sanitizeWorkbookText(title);
  sheet.mergeCells(1, 1, 1, totalColumns);
  sheet.getCell(1, 1).font = {
    name: WORKBOOK_FONT_NAME,
    size: 16,
    bold: true,
    color: { argb: 'FF111827' },
  };
  sheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(1, 1).border = {};

  sheet.getRow(2).height = 18;
  sheet.getCell(2, 1).value = 'All financial figures are in USD millions unless otherwise noted.';
  sheet.mergeCells(2, 1, 2, totalColumns);
  sheet.getCell(2, 1).font = {
    name: WORKBOOK_FONT_NAME,
    size: 11,
    italic: true,
    color: { argb: 'FF4B5563' },
  };
  sheet.getCell(2, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell(2, 1).border = {};

  // Freeze panes at Row 4 (ySplit=3) so title+units+column headers remain visible.
  sheet.views = [{ state: 'frozen', xSplit: freezeCol, ySplit: 3 }];
}

/**
 * Create header style for section headers
 * Blue background, white text, bold, 12pt
 */
export function createHeaderStyle(): Partial<ExcelJS.Style> {
  return {
    font: {
      name: WORKBOOK_FONT_NAME,
      size: 12,
      bold: true,
      color: { argb: COLORS.WHITE },
    },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.BLUE_HEADER },
    },
    alignment: {
      vertical: 'middle',
      horizontal: 'left',
    },
    border: {
      bottom: { style: 'thick', color: { argb: COLORS.BLUE_HEADER } },
    },
  };
}

/**
 * Create input style for editable assumptions
 * Blue font, italic for hardcoded constants
 */
export function createInputStyle(isConstant: boolean = false): Partial<ExcelJS.Style> {
  return {
    font: {
      name: WORKBOOK_FONT_NAME,
      size: 11,
      color: { argb: COLORS.BLUE_INPUT },
      italic: isConstant,
    },
    alignment: {
      vertical: 'middle',
      horizontal: 'right',
    },
  };
}

/**
 * Create formula style for calculated cells
 * Black font
 */
export function createFormulaStyle(): Partial<ExcelJS.Style> {
  return {
    font: {
      name: WORKBOOK_FONT_NAME,
      size: 11,
      color: { argb: COLORS.BLACK },
    },
    alignment: {
      vertical: 'middle',
      horizontal: 'right',
    },
  };
}

/**
 * Create link style for cross-sheet references
 * Green font
 */
export function createLinkStyle(): Partial<ExcelJS.Style> {
  return {
    font: {
      name: WORKBOOK_FONT_NAME,
      size: 11,
      color: { argb: COLORS.GREEN_LINK },
    },
    alignment: {
      vertical: 'middle',
      horizontal: 'right',
    },
  };
}

/**
 * Create total style for subtotals and totals
 * Bold with thin top border
 */
export function createTotalStyle(): Partial<ExcelJS.Style> {
  return {
    font: {
      name: WORKBOOK_FONT_NAME,
      size: 11,
      bold: true,
      color: { argb: COLORS.BLACK },
    },
    alignment: {
      vertical: 'middle',
      horizontal: 'right',
    },
    border: {
      top: { style: 'thin', color: { argb: COLORS.BORDER_GREY } },
    },
  };
}

/**
 * Create sub-header style for year labels
 * Grey background, bold
 */
export function createSubHeaderStyle(): Partial<ExcelJS.Style> {
  return {
    font: {
      name: WORKBOOK_FONT_NAME,
      size: 10,
      bold: true,
      color: { argb: COLORS.BLACK },
    },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.GREY_SUBHEADER },
    },
    alignment: {
      vertical: 'middle',
      horizontal: 'center',
    },
    border: {
      top: { style: 'thin', color: { argb: COLORS.BORDER_GREY } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER_GREY } },
      left: { style: 'thin', color: { argb: COLORS.BORDER_GREY } },
      right: { style: 'thin', color: { argb: COLORS.BORDER_GREY } },
    },
  };
}

/**
 * Create normal cell style
 * Default formatting for regular cells
 */
export function createNormalStyle(): Partial<ExcelJS.Style> {
  return {
    font: {
      name: WORKBOOK_FONT_NAME,
      size: 11,
      color: { argb: COLORS.BLACK },
    },
    alignment: {
      vertical: 'middle',
      horizontal: 'right',
    },
  };
}

/**
 * Number format constants
 */
export const NUMBER_FORMATS = {
  CURRENCY: '$#,##0',              // $1,234
  CURRENCY_NEGATIVE: '($#,##0)',   // ($1,234)
  CURRENCY_DECIMALS: '$#,##0.00',  // $1,234.56
  PERCENTAGE: '0.0%',              // 2.5%
  PERCENTAGE_DECIMALS: '0.00%',    // 2.50%
  INTEGER: '#,##0',                 // 1,234
  DECIMAL: '#,##0.00',              // 1,234.56
} as const;

/**
 * Apply borders to a cell range
 */
export function applyBorders(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  borderType: 'all' | 'top' | 'bottom' | 'left' | 'right' | 'thick-bottom' = 'all'
): void {
  const borderStyle = borderType === 'thick-bottom' ? 'thick' : 'thin';
  const borderColor = { argb: COLORS.BORDER_GREY };

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const cell = worksheet.getCell(row, col);
      if (!cell.border) {
        cell.border = {};
      }

      if (borderType === 'all') {
        cell.border = {
          top: { style: 'thin', color: borderColor },
          bottom: { style: 'thin', color: borderColor },
          left: { style: 'thin', color: borderColor },
          right: { style: 'thin', color: borderColor },
        };
      } else if (borderType === 'thick-bottom') {
        cell.border.bottom = { style: 'thick', color: borderColor };
      } else {
        cell.border[borderType] = { style: 'thin', color: borderColor };
      }
    }
  }
}

/**
 * Apply section header formatting (thick bottom border)
 */
export function applySectionHeaderBorder(
  worksheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  endCol: number
): void {
  for (let col = startCol; col <= endCol; col++) {
    const cell = worksheet.getCell(row, col);
    if (!cell.border) {
      cell.border = {};
    }
    cell.border.bottom = { style: 'thick', color: { argb: COLORS.BLUE_HEADER } };
  }
}

/**
 * Apply total row formatting (thin top border)
 */
export function applyTotalBorder(
  worksheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  endCol: number
): void {
  for (let col = startCol; col <= endCol; col++) {
    const cell = worksheet.getCell(row, col);
    if (!cell.border) {
      cell.border = {};
    }
    cell.border.top = { style: 'thin', color: { argb: COLORS.BORDER_GREY } };
  }
}

/**
 * Freeze top row(s) of a worksheet
 */
export function freezeTopRow(worksheet: ExcelJS.Worksheet, numRows: number = 1): void {
  worksheet.views = [
    {
      state: 'frozen',
      ySplit: numRows,
      topLeftCell: `A${numRows + 1}`,
      activeCell: `A${numRows + 1}`,
    },
  ];
}

/**
 * Set consistent column widths
 */
export function setColumnWidths(
  worksheet: ExcelJS.Worksheet,
  widths: Array<{ key: string; width: number } | number>
): void {
  widths.forEach((width, index) => {
    const colNumber = index + 1;
    if (typeof width === 'number') {
      worksheet.getColumn(colNumber).width = width;
    } else {
      // Find column by key if needed
      const col = worksheet.getColumn(colNumber);
      if (col) {
        col.width = width.width;
      }
    }
  });
}

/**
 * Disable gridlines for a worksheet
 */
export function disableGridlines(worksheet: ExcelJS.Worksheet): void {
  worksheet.views = [
    {
      showGridLines: false,
    },
  ];
}

/**
 * Apply number format to a cell
 */
export function applyNumberFormat(
  cell: ExcelJS.Cell,
  format: keyof typeof NUMBER_FORMATS | string
): void {
  const formatString = NUMBER_FORMATS[format as keyof typeof NUMBER_FORMATS] || format;
  cell.numFmt = formatString;
}

/**
 * Create a boxed section (visual grouping with borders)
 */
export function createBoxedSection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  title?: string
): void {
  // Apply borders to all cells
  applyBorders(worksheet, startRow, endRow, startCol, endCol, 'all');

  // Add title if provided
  if (title) {
    const titleCell = worksheet.getCell(startRow, startCol);
    titleCell.value = title;
    titleCell.font = { name: 'Calibri', size: 11, bold: true };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  }
}

/**
 * Format a cell as a header
 */
export function formatAsHeader(
  cell: ExcelJS.Cell,
  text: string,
  spanColumns?: number
): void {
  cell.value = text;
  const headerStyle = createHeaderStyle();
  Object.assign(cell, headerStyle);

  if (spanColumns && spanColumns > 1) {
    // Note: We avoid merged cells per requirements, but this is for reference
    // In practice, we'll use individual cells with same formatting
  }
}

/**
 * Format a cell as an input
 */
export function formatAsInput(
  cell: ExcelJS.Cell,
  value: any,
  isConstant: boolean = false
): void {
  cell.value = value;
  const inputStyle = createInputStyle(isConstant);
  Object.assign(cell, inputStyle);
}

/**
 * Format a cell as a formula
 */
export function formatAsFormula(
  cell: ExcelJS.Cell,
  formula: string,
  numberFormat?: keyof typeof NUMBER_FORMATS
): void {
  cell.value = { formula };
  const formulaStyle = createFormulaStyle();
  Object.assign(cell, formulaStyle);
  
  if (numberFormat) {
    applyNumberFormat(cell, numberFormat);
  }
}

/**
 * Format a cell as a total
 */
export function formatAsTotal(
  cell: ExcelJS.Cell,
  value: any,
  numberFormat?: keyof typeof NUMBER_FORMATS
): void {
  cell.value = value;
  const totalStyle = createTotalStyle();
  Object.assign(cell, totalStyle);
  
  if (numberFormat) {
    applyNumberFormat(cell, numberFormat);
  }
}
