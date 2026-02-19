/**
 * Generate Excel Preview - Extract Full Excel Model Structure
 * Extracts complete table structures from Excel workbooks to display in preview
 */

import ExcelJS from 'exceljs';

export interface ExcelTable {
  title: string;
  headers: string[];
  rows: ExcelRow[];
  startRow: number;
  endRow: number;
}

export interface ExcelRow {
  cells: (string | number | null)[];
  isHeader?: boolean;
  isTotal?: boolean;
  isSectionHeader?: boolean;
}

export interface ExcelSheetPreview {
  sheetName: string;
  tables: ExcelTable[];
  rawData: {
    columns: string[];
    rows: (string | number | null)[][];
  };
}

/**
 * Generate comprehensive preview from Excel workbook
 * Extracts all tables and structures to match Excel format
 */
export async function generateExcelPreview(
  workbook: ExcelJS.Workbook,
  maxRows: number = 200
): Promise<ExcelSheetPreview | null> {
  try {
    // Get first worksheet (main model sheet)
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return null;
    
    const tables: ExcelTable[] = [];
    const allRows: (string | number | null)[][] = [];
    
    // Extract all rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > maxRows) return;
      
      const rowData: (string | number | null)[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const value = cell.value;
        if (value === null || value === undefined) {
          rowData[colNumber - 1] = null;
        } else if (typeof value === 'object' && 'result' in value) {
          // Formula cell - use calculated result
          rowData[colNumber - 1] = (value as any).result;
        } else {
          rowData[colNumber - 1] = value as string | number;
        }
      });
      
      allRows.push(rowData);
    });
    
    // Detect table structures
    let currentTable: ExcelTable | null = null;
    let currentHeaders: string[] = [];
    let tableStartRow = 0;
    
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const firstCell = row[0];
      
      // Check if this is a section header (bold, colored, or all caps)
      const isSectionHeader = typeof firstCell === 'string' && 
        (firstCell.toUpperCase() === firstCell || 
         firstCell.includes('STATEMENT') ||
         firstCell.includes('PROJECTIONS') ||
         firstCell.includes('VALUATION') ||
         firstCell.includes('ASSUMPTIONS'));
      
      // Check if this looks like a header row (has multiple non-empty cells)
      const nonEmptyCells = row.filter(cell => cell !== null && cell !== '');
      const isHeaderRow = nonEmptyCells.length >= 2 && 
        (typeof row[0] === 'string' && 
         (row[0].toLowerCase().includes('metric') || 
          row[0].toLowerCase().includes('line item') ||
          row[0].toLowerCase().includes('period') ||
          row[0].toLowerCase().includes('year')));
      
      if (isSectionHeader) {
        // Save previous table if exists
        if (currentTable && currentTable.rows.length > 0) {
          currentTable.endRow = i - 1;
          tables.push(currentTable);
        }
        
        // Start new table
        currentTable = {
          title: String(firstCell),
          headers: [],
          rows: [],
          startRow: i,
          endRow: i,
        };
        currentHeaders = [];
      } else if (isHeaderRow && currentTable) {
        // This is the header row for the current table
        currentHeaders = row.map(cell => String(cell || ''));
        currentTable.headers = currentHeaders;
      } else if (currentTable && nonEmptyCells.length > 0) {
        // This is a data row
        const isTotalRow = typeof firstCell === 'string' && 
          (firstCell.startsWith('=') || 
           firstCell.startsWith('Total') ||
           firstCell.includes('Net Income') ||
           firstCell.includes('Equity Value') ||
           firstCell.includes('Price Per Share'));
        
        currentTable.rows.push({
          cells: row,
          isTotal: isTotalRow,
        });
      }
    }
    
    // Save last table if exists
    if (currentTable && currentTable.rows.length > 0) {
      currentTable.endRow = allRows.length - 1;
      tables.push(currentTable);
    }
    
    // If no tables detected, create a simple table from all data
    if (tables.length === 0 && allRows.length > 0) {
      // Find header row (usually row 1 or first non-empty row)
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(5, allRows.length); i++) {
        const nonEmpty = allRows[i].filter(cell => cell !== null && cell !== '').length;
        if (nonEmpty >= 2) {
          headerRowIndex = i;
          break;
        }
      }
      
      const headers = allRows[headerRowIndex]?.map(cell => String(cell || '')) || [];
      const dataRows = allRows.slice(headerRowIndex + 1);
      
      tables.push({
        title: worksheet.name,
        headers,
        rows: dataRows.map(row => ({ cells: row })),
        startRow: headerRowIndex,
        endRow: allRows.length - 1,
      });
    }
    
    // Extract column headers for raw data view
    const columns: string[] = [];
    if (allRows.length > 0) {
      const firstRow = allRows[0];
      firstRow.forEach((cell, idx) => {
        columns[idx] = String(cell || `Column ${idx + 1}`);
      });
    }
    
    return {
      sheetName: worksheet.name,
      tables,
      rawData: {
        columns,
        rows: allRows,
      },
    };
  } catch (error) {
    console.error('[generateExcelPreview] Error:', error);
    return null;
  }
}

/**
 * Extract specific table from Excel by section title
 */
export function extractTableByTitle(
  preview: ExcelSheetPreview,
  title: string
): ExcelTable | null {
  return preview.tables.find(t => 
    t.title.toLowerCase().includes(title.toLowerCase())
  ) || null;
}
