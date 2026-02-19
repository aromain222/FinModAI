"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';

interface OperatingPreviewProps {
  output: any;
  ticker: string;
}

export function OperatingPreview({ output, ticker }: OperatingPreviewProps) {
  // Extract preview data from raw output
  const preview = output?.preview || null;
  
  if (!preview || !preview.columns || !preview.rows) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle>{ticker} — Operating Model Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-muted)]">Preview data not available. Download Excel to view the full model.</p>
        </CardContent>
      </Card>
    );
  }

  const { columns, rows } = preview;

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle>{ticker} — Operating Model Preview</CardTitle>
        <p className="text-sm font-medium text-[var(--cb-text-muted)] mt-1">All figures in USD millions. Financial line items: 0 decimals.</p>
        <p className="text-xs text-[var(--cb-text-muted)] mt-0.5">This is a preview of what the Excel model will look like.</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col: string, idx: number) => (
                  <TableHead key={idx} className="font-semibold bg-[var(--cb-surface-alt)]">
                    {col || `Column ${idx + 1}`}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 50).map((row: (string | number | null)[], rowIdx: number) => (
                <TableRow key={rowIdx}>
                  {columns.map((_: string, colIdx: number) => {
                    const cellValue = row[colIdx];
                    const formattedValue = cellValue === null || cellValue === undefined 
                      ? '—' 
                      : typeof cellValue === 'number' 
                        ? Math.round(cellValue).toLocaleString('en-US', { 
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                            useGrouping: true,
                          })
                        : String(cellValue);
                    
                    return (
                      <TableCell key={colIdx} className="text-right font-mono text-sm">
                        {formattedValue}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length > 50 && (
          <p className="text-xs text-[var(--cb-text-muted)] mt-4">
            Showing first 50 rows. Download Excel to view all {rows.length} rows.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
