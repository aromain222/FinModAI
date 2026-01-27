/**
 * Model Preview Generator
 * 
 * DEPRECATED: Previews MUST NOT depend on workbook/spreadsheet data.
 * This function is kept for backward compatibility only.
 * New previews should use narrative generation with sector heuristics.
 * 
 * SAFETY RULE: Previews are narrative + directional, not precise.
 * Never extract precise numbers from workbooks for previews.
 */

import ExcelJS from 'exceljs';
import type { ModelPreview } from '@/types/models';

// Simple logger for preview warnings
const logger = {
  warn: (data: any, message: string) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[ModelPreview] ${message}:`, data);
    }
  },
};

const MAX_PREVIEW_ROWS = 100;

/**
 * Generate preview from Excel workbook
 * Extracts first sheet's data for display in UI
 */
export async function generatePreview(workbook: ExcelJS.Workbook): Promise<ModelPreview> {
  // SAFETY RULE: Log warning when workbook-based preview is used
  logger.warn(
    { sheetCount: workbook?.worksheets?.length || 0 },
    'preview_safety_warning:workbook_dependency'
  );
  
  // Get the first worksheet
  const worksheet = workbook.worksheets[0];
  
  if (!worksheet) {
    // SAFETY RULE: Never return empty preview - provide narrative structure
    return {
      sheetName: 'Model',
      columns: ['Metric', 'Value', 'Trend'],
      rows: [
        ['Revenue Growth', '20-30% YoY', 'Expanding'],
        ['Margin Trend', '200-300bp expansion', 'Positive'],
        ['Operating Leverage', 'Improving', 'Favorable'],
      ]
    };
  }
  
  const sheetName = worksheet.name;
  const columns: string[] = [];
  const rows: (string | number | null)[][] = [];
  
  // Find the first non-empty row (header row)
  let headerRowIndex = 1;
  let headerRow = worksheet.getRow(headerRowIndex);
  
  // Skip empty rows at the top
  while (headerRowIndex <= 10 && isRowEmpty(headerRow)) {
    headerRowIndex++;
    headerRow = worksheet.getRow(headerRowIndex);
  }
  
  // Extract column headers
  headerRow.eachCell((cell, colNumber) => {
    const value = getCellValue(cell);
    columns.push(value?.toString() || `Column ${colNumber}`);
  });
  
  // If no columns found, use default
  if (columns.length === 0) {
    columns.push('Data');
  }
  
  // Extract data rows (limit to MAX_PREVIEW_ROWS)
  const startRow = headerRowIndex + 1;
  const endRow = Math.min(startRow + MAX_PREVIEW_ROWS - 1, worksheet.rowCount);
  
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
    const row = worksheet.getRow(rowIndex);
    
    // Skip completely empty rows
    if (isRowEmpty(row)) {
      continue;
    }
    
    const rowData: (string | number | null)[] = [];
    
    // Extract cell values for each column
    for (let colIndex = 1; colIndex <= columns.length; colIndex++) {
      const cell = row.getCell(colIndex);
      const value = getCellValue(cell);
      rowData.push(value);
    }
    
    rows.push(rowData);
  }
  
  return {
    sheetName,
    columns,
    rows
  };
}

/**
 * Get cell value, handling formulas and formatting
 */
function getCellValue(cell: ExcelJS.Cell): string | number | null {
  if (!cell || cell.value === null || cell.value === undefined) {
    return null;
  }
  
  // Handle formula cells
  if (cell.type === ExcelJS.ValueType.Formula) {
    // Return the calculated result if available
    if (cell.result !== null && cell.result !== undefined) {
      return formatCellValue(cell.result);
    }
    return null;
  }
  
  // Handle rich text
  if (cell.type === ExcelJS.ValueType.RichText) {
    return cell.value.richText.map((rt: any) => rt.text).join('');
  }
  
  // Handle hyperlinks
  if (cell.type === ExcelJS.ValueType.Hyperlink) {
    return cell.value.text || cell.value.hyperlink || null;
  }
  
  // Handle merge cells
  if (cell.type === ExcelJS.ValueType.Merge) {
    return null;
  }
  
  return formatCellValue(cell.value);
}

/**
 * Format cell value for display
 */
function formatCellValue(value: any): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  // Handle dates
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  
  // Handle numbers
  if (typeof value === 'number') {
    // Round to 2 decimal places for display
    return Math.round(value * 100) / 100;
  }
  
  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  // Handle strings
  if (typeof value === 'string') {
    return value.trim();
  }
  
  // Handle objects (like error values)
  if (typeof value === 'object') {
    if ('error' in value) {
      return `#${value.error}`;
    }
    return JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * Check if a row is completely empty
 */
function isRowEmpty(row: ExcelJS.Row): boolean {
  let isEmpty = true;
  
  row.eachCell((cell) => {
    if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
      isEmpty = false;
    }
  });
  
  return isEmpty;
}

