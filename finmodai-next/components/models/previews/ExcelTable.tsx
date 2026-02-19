/**
 * ExcelTable Component
 * 
 * Literal, read-only rendering of Excel spreadsheet data
 * Matches Excel structure exactly - no transformations, no calculations
 */

"use client";

import React from 'react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';

export interface ExcelTableData {
  columns: string[];
  rows: (string | number | null | undefined)[][];
  headerRows?: number; // Number of header rows (for merged headers)
  frozenColumns?: number; // Number of frozen columns
  rowLabels?: string[]; // Row labels (first column)
}

export interface ExcelTableProps {
  data: ExcelTableData;
  maxRows?: number; // Max rows to show before truncation
  showTruncation?: boolean; // Show truncation indicator
  className?: string;
}

/**
 * Format cell value: no raw floating point. Thousands separators; 0 decimals for large numbers; max 2 for decimals; null → "—".
 */
function formatCellValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  let num: number;
  if (typeof value === 'number') {
    num = value;
  } else {
    const s = String(value).trim();
    if (!s) return '—';
    num = Number(s.replace(/[$,\s%]/g, ''));
    if (!Number.isFinite(num)) return s;
  }

  const abs = Math.abs(num);
  const maxDec = abs >= 1000 ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDec,
  }).format(abs >= 1000 ? Math.round(num) : num);
}

/**
 * ExcelTable - Literal Excel rendering
 */
export function ExcelTable({
  data,
  maxRows = 50,
  showTruncation = true,
  className = '',
}: ExcelTableProps) {
  const { columns, rows, headerRows = 1, frozenColumns = 0 } = data;
  
  // Determine if we need to truncate
  const shouldTruncate = rows.length > maxRows;
  const visibleRows = shouldTruncate ? rows.slice(0, maxRows) : rows;
  const hiddenRows = shouldTruncate ? rows.length - maxRows : 0;
  
  // Check if any rows are empty (all null/undefined/empty strings)
  const isEmptyRow = (row: (string | number | null | undefined)[]): boolean => {
    return row.every(cell => {
      const val = formatCellValue(cell);
      return val.trim() === '';
    });
  };
  
  // Filter out completely empty rows
  const nonEmptyRows = visibleRows.filter(row => !isEmptyRow(row));
  
  if (columns.length === 0 && rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No data available
      </div>
    );
  }
  
  return (
    <div className={`overflow-x-auto ${className}`}>
      <Table className="border-collapse">
        {/* Header Rows */}
        {headerRows > 0 && (
          <TableHeader>
            {Array.from({ length: headerRows }).map((_, headerRowIdx) => (
              <TableRow key={headerRowIdx} className="bg-muted/60">
                {columns.map((col, colIdx) => {
                  // For multi-row headers, we'd need header data structure
                  // For now, assume single header row
                  if (headerRowIdx > 0) return null;
                  
                  return (
                    <TableHead
                      key={colIdx}
                      className="font-semibold text-xs uppercase tracking-wide text-muted-foreground border border-border px-2 py-1.5 whitespace-nowrap"
                      style={{
                        position: colIdx < frozenColumns ? 'sticky' : 'relative',
                        left: colIdx < frozenColumns ? colIdx * 120 : 0,
                        zIndex: colIdx < frozenColumns ? 10 : 1,
                        backgroundColor: 'var(--muted)',
                      }}
                    >
                      {col || `Column ${colIdx + 1}`}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
        )}
        
        {/* Data Rows */}
        <TableBody>
          {nonEmptyRows.map((row, rowIdx) => {
            // Check if this is a total/subtotal row (heuristic: contains "Total" or is bold in Excel)
            const isTotalRow = row.some(cell => 
              String(cell).toLowerCase().includes('total') ||
              String(cell).toLowerCase().includes('subtotal')
            );
            
            return (
              <TableRow
                key={rowIdx}
                className={isTotalRow ? 'bg-muted/30 font-semibold' : rowIdx % 2 === 1 ? 'bg-muted/20 hover:bg-muted/30' : 'hover:bg-muted/20'}
              >
                {columns.map((_, colIdx) => {
                  const cellValue = row[colIdx];
                  const formatted = formatCellValue(cellValue);
                  
                  // Determine alignment
                  const isNumeric = typeof cellValue === 'number';
                  const align = isNumeric ? 'right' : 'left';
                  
                  return (
                    <TableCell
                      key={colIdx}
                      className={`border border-border px-2 py-1 text-sm ${
                        isNumeric ? 'font-mono tabular-nums' : 'text-muted-foreground'
                      }`}
                      style={{
                        textAlign: align,
                        position: colIdx < frozenColumns ? 'sticky' : 'relative',
                        left: colIdx < frozenColumns ? colIdx * 120 : 0,
                        zIndex: colIdx < frozenColumns ? 5 : 1,
                        backgroundColor: isTotalRow ? 'var(--muted)' : 'transparent',
                      }}
                    >
                      {formatted || '—'}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          
          {/* Truncation Indicator */}
          {shouldTruncate && showTruncation && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center text-xs text-muted-foreground py-2 italic border-t-2 border-dashed"
              >
                {hiddenRows} more row{hiddenRows !== 1 ? 's' : ''} in Excel
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
