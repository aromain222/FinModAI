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

interface LboPreviewProps {
  output: any;
  ticker: string;
}

export function LboPreview({ output, ticker }: LboPreviewProps) {
  // Extract preview data from raw output
  const preview = output?.preview || null;
  
  if (!preview || !preview.columns || !preview.rows) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle>{ticker} — LBO Model Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-muted)]">Preview data not available. Download Excel to view the full model.</p>
        </CardContent>
      </Card>
    );
  }

  const { columns, rows } = preview;

  const formatCell = (cellValue: string | number | null | undefined, colLabel: string) => {
    if (cellValue === null || cellValue === undefined) return '—';
    if (typeof cellValue === 'number') {
      const label = (colLabel || '').toLowerCase();
      const isPct = label.includes('%') || label.includes('margin') || label.includes('rate') || label.includes('growth');
      const isPrice = label.includes('price');
      if (isPct) {
        const norm = Math.abs(cellValue) > 1.5 ? cellValue / 100 : cellValue;
        return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(norm);
      }
      if (isPrice) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(Number(cellValue.toFixed(2)));
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true }).format(Math.round(cellValue));
    }
    return String(cellValue);
  };

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle>{ticker} — LBO Model Preview</CardTitle>
        <p className="text-sm font-medium text-[var(--cb-text-muted)] mt-1">
          All figures in USD millions. Financial line items: 0 decimals; percentages: 1 decimal.
        </p>
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
                    const colLabel = typeof columns[colIdx] === 'string' ? columns[colIdx] : '';
                    const formattedValue = formatCell(cellValue, colLabel);
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
