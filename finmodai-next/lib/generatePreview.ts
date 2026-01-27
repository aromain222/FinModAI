/**
 * Preview Generator
 * 
 * SAFETY RULE: This function is DEPRECATED for preview generation.
 * Previews MUST NOT depend on workbook/spreadsheet data.
 * Use sector-based heuristics instead.
 * 
 * This function is kept only for backward compatibility with legacy code.
 * New previews should use narrative generation with sector heuristics.
 */

import type ExcelJS from 'exceljs';
import type { ModelPreviewTable } from '@/components/models/ModelPreview';

// Simple logger for preview warnings
const logger = {
  warn: (data: any, message: string) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[GeneratePreview] ${message}:`, data);
    }
  },
};

const MAX_PREVIEW_ROWS = 50;

/**
 * Extract preview data from a workbook
 */
export function generatePreviewFromWorkbook(
  workbook: ExcelJS.Workbook,
  modelType: string
): ModelPreviewTable | null {
  // SAFETY RULE: Log warning when workbook-based preview is used
  logger.warn(
    { modelType, hasWorkbook: !!workbook, sheetCount: workbook?.worksheets?.length || 0 },
    'preview_safety_warning:workbook_dependency'
  );
  
  if (!workbook || workbook.worksheets.length === 0) {
    // SAFETY RULE: Never return null - but this function is legacy
    // New code should not call this
    return null;
  }

  // For LBO models, return null (preview not supported)
  if (modelType.toLowerCase() === 'lbo') {
    return null;
  }

  // Find the main model sheet
  const mainSheetNames = {
    'dcf': 'DCF Model',
    'three-statement': 'Three-Statement Model',
    'comps': 'Comps Analysis',
  };

  const targetSheetName = mainSheetNames[modelType.toLowerCase() as keyof typeof mainSheetNames];
  let sheet = targetSheetName ? workbook.getWorksheet(targetSheetName) : null;

  // Fallback to first sheet if target not found
  if (!sheet && workbook.worksheets.length > 0) {
    sheet = workbook.worksheets[0];
  }

  if (!sheet) {
    return null;
  }

  // Extract columns from first row
  const headerRow = sheet.getRow(1);
  const columns: string[] = [];
  let colIndex = 1;
  while (colIndex <= sheet.columnCount) {
    const cell = headerRow.getCell(colIndex);
    const value = cell.value;
    if (value === null || value === undefined) {
      break;
    }
    const cellText = String(value).trim();
    if (!cellText) {
      break;
    }
    columns.push(cellText);
    colIndex++;
  }

  if (columns.length === 0) {
    // Try to infer columns from first few rows
    for (let rowNum = 1; rowNum <= Math.min(5, sheet.rowCount); rowNum++) {
      const row = sheet.getRow(rowNum);
      let hasData = false;
      const rowCols: string[] = [];
      for (let c = 1; c <= Math.min(10, sheet.columnCount); c++) {
        const cell = row.getCell(c);
        const val = cell.value;
        if (val !== null && val !== undefined && String(val).trim()) {
          rowCols.push(String(val).trim());
          hasData = true;
        }
      }
      if (hasData && rowCols.length > 0) {
        columns.push(...rowCols);
        break;
      }
    }
  }

  // Extract rows
  const rows: (string | number | null)[][] = [];
  const startRow = columns.length > 0 ? 2 : 1; // Skip header if we found columns

  for (let rowNum = startRow; rowNum <= Math.min(startRow + MAX_PREVIEW_ROWS, sheet.rowCount); rowNum++) {
    const row = sheet.getRow(rowNum);
    const rowData: (string | number | null)[] = [];
    let hasNonEmptyCell = false;

    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const cell = row.getCell(colIdx + 1);
      let cellValue: string | number | null = null;

      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === 'number') {
          cellValue = cell.value;
          hasNonEmptyCell = true;
        } else if (typeof cell.value === 'string') {
          const trimmed = cell.value.trim();
          if (trimmed) {
            cellValue = trimmed;
            hasNonEmptyCell = true;
          }
        } else if (typeof cell.value === 'object' && 'result' in cell.value) {
          // Formula cell - use result if available
          const formulaValue = cell.value as { result?: number | string };
          if (formulaValue.result !== null && formulaValue.result !== undefined) {
            cellValue = typeof formulaValue.result === 'number' 
              ? formulaValue.result 
              : String(formulaValue.result).trim() || null;
            if (cellValue !== null) {
              hasNonEmptyCell = true;
            }
          }
        } else {
          const strValue = String(cell.value).trim();
          if (strValue) {
            cellValue = strValue;
            hasNonEmptyCell = true;
          }
        }
      }

      rowData.push(cellValue);
    }

    // Only add row if it has at least one non-empty cell
    if (hasNonEmptyCell) {
      rows.push(rowData);
    }
  }

  // If we have no rows but have columns, create a placeholder row
  if (rows.length === 0 && columns.length > 0) {
    // Try to extract data from any row in the sheet
    for (let rowNum = 1; rowNum <= Math.min(20, sheet.rowCount); rowNum++) {
      const row = sheet.getRow(rowNum);
      const rowData: (string | number | null)[] = [];
      let hasData = false;

      for (let colIdx = 0; colIdx < columns.length; colIdx++) {
        const cell = row.getCell(colIdx + 1);
        let val: string | number | null = null;

        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'number') {
            val = cell.value;
            hasData = true;
          } else if (typeof cell.value === 'string' && cell.value.trim()) {
            val = cell.value.trim();
            hasData = true;
          } else if (typeof cell.value === 'object' && 'result' in cell.value) {
            const formulaValue = cell.value as { result?: number | string };
            if (formulaValue.result !== null && formulaValue.result !== undefined) {
              val = typeof formulaValue.result === 'number' 
                ? formulaValue.result 
                : String(formulaValue.result).trim() || null;
              if (val !== null) {
                hasData = true;
              }
            }
          }
        }
        rowData.push(val);
      }

      if (hasData) {
        rows.push(rowData);
        break; // Found at least one row with data
      }
    }
  }

  // Final fallback: if still no rows, create a minimal preview
  if (rows.length === 0) {
    if (columns.length === 0) {
      // Create default columns based on model type
      if (modelType.toLowerCase() === 'dcf') {
        columns.push('Metric', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5');
      } else if (modelType.toLowerCase() === 'three-statement') {
        columns.push('Line Item', 'Year 1', 'Year 2', 'Year 3');
      } else if (modelType.toLowerCase() === 'comps') {
        columns.push('Company', 'EV/Revenue', 'EV/EBITDA', 'P/E');
      } else {
        columns.push('Column 1', 'Column 2', 'Column 3');
      }
    }
    // Add a placeholder row indicating data is available
    rows.push([
      'Model generated successfully',
      'Download to view full details',
      ...Array(columns.length - 2).fill(null)
    ]);
  }

  return {
    sheetName: sheet.name,
    columns,
    rows,
  };
}
