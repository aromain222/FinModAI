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
import { formatValue, FormatType } from '@/lib/format/finance';

export type DataTableColumn = {
  header: string;
  format?: FormatType;
  align?: 'left' | 'right' | 'center';
  unit?: 'raw' | 'thousands' | 'millions' | 'billions';
  decimals?: number;
};

export type DataTableRow = (string | number | null | undefined)[];

export interface DataTableProps {
  title: string;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  unitNote?: string; // e.g., "Units: $M"
  className?: string;
}

/**
 * Data Table - Tight banker table styling
 * 
 * Light gridlines, strong header row.
 * Supports FY columns / monthly columns.
 * Supports footnotes.
 */
export function DataTable({
  title,
  columns,
  rows,
  unitNote,
  className = '',
}: DataTableProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <Table className="border border-[var(--cb-border-subtle)]">
          <TableHeader>
            <TableRow className="bg-[var(--cb-surface-alt)] border-b-2 border-[var(--cb-border-subtle)]">
              {columns.map((col, idx) => (
                <TableHead
                  key={idx}
                  className={`font-semibold text-[var(--cb-text-primary)] ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }`}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow
                key={rowIdx}
                className="border-b border-[var(--cb-border-subtle)]/50 hover:bg-[var(--cb-surface-alt)]/50"
              >
                {row.map((cell, cellIdx) => {
                  const col = columns[cellIdx];
                  const format = col?.format || 'text';
                  const align = col?.align || 'left';

                  return (
                    <TableCell
                      key={cellIdx}
                      className={
                        align === 'right'
                          ? 'text-right'
                          : align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }
                    >
                      {format === 'text'
                        ? formatValue(cell, format)
                        : formatValue(cell, format, {
                            unit: col?.unit,
                            decimals: col?.decimals,
                          })}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {unitNote && (
        <p className="text-xs text-[var(--cb-text-muted)] italic">
          {unitNote}
        </p>
      )}
    </div>
  );
}
