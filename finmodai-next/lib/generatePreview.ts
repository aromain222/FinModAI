/**
 * Generate Preview from Workbook
 * Extract preview data from Excel workbooks
 */

import ExcelJS from 'exceljs';

export interface WorkbookPreview {
  sheetName: string;
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  columnCount: number;
}

/**
 * Generate preview from Excel workbook
 */
export async function generatePreviewFromWorkbook(
  workbook: ExcelJS.Workbook,
  maxRows: number = 50
): Promise<WorkbookPreview | null> {
  try {
    // Get first worksheet
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return null;
    
    const columns: string[] = [];
    const rows: (string | number | null)[][] = [];
    
    // Extract column headers (first row)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      columns[colNumber - 1] = cell.value?.toString() || `Col ${colNumber}`;
    });
    
    // Extract data rows
    let rowCount = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      if (rowCount >= maxRows) return;
      
      const rowData: (string | number | null)[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const value = cell.value;
        if (value === null || value === undefined) {
          rowData[colNumber - 1] = null;
        } else if (typeof value === 'object' && 'result' in value) {
          // Formula cell
          rowData[colNumber - 1] = (value as any).result;
        } else {
          rowData[colNumber - 1] = value as string | number;
        }
      });
      
      rows.push(rowData);
      rowCount++;
    });
    
    return {
      sheetName: worksheet.name,
      columns,
      rows,
      rowCount: rows.length,
      columnCount: columns.length
    };
  } catch (error) {
    console.error('[generatePreviewFromWorkbook] Error:', error);
    return null;
  }
}
