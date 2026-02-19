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

interface DcfPreviewProps {
  output: any;
  ticker: string;
  onEditAssumptions?: () => void;
  rawDcfOutput?: any;
}

export function DcfPreview({ output, ticker, rawDcfOutput }: DcfPreviewProps) {
  // Extract preview data from raw output
  const preview = rawDcfOutput?.preview || output?.preview || null;
  
  if (!preview || !preview.columns || !preview.rows) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle>{ticker} — DCF Model Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-muted)]">Preview data not available. Download Excel to view the full model.</p>
        </CardContent>
      </Card>
    );
  }

  const { columns, rows } = preview;
  const formatNumber = (value: number, opts?: { decimals?: number; currency?: boolean }) => {
    const decimals = opts?.decimals ?? (opts?.currency ? 0 : 0);
    const rounded = decimals === 0 ? Math.round(value) : Number(value.toFixed(decimals));
    if (opts?.currency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        useGrouping: true,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(rounded);
    }
    return new Intl.NumberFormat('en-US', {
      useGrouping: true,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(rounded);
  };

  const formatPercent = (value: number) => {
    const normalized = Math.abs(value) > 1.5 ? value / 100 : value;
    const rounded = Number((normalized * 100).toFixed(1)) / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      useGrouping: false,
    }).format(rounded);
  };

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold tracking-tight">{ticker} — DCF Model Preview</CardTitle>
        <p className="text-sm font-medium text-[var(--cb-text-muted)] mt-1">
          All figures in USD millions. Revenue, EBITDA, FCF: integers; percentages: 1 decimal.
        </p>
        <p className="text-xs text-[var(--cb-text-muted)] mt-0.5">This is a preview of what the Excel model will look like.</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60">
                {columns.map((col: string, idx: number) => (
                  <TableHead key={idx} className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                    {col || `Column ${idx + 1}`}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 50).map((row: (string | number | null)[], rowIdx: number) => (
                <TableRow key={rowIdx} className={rowIdx % 2 === 1 ? 'bg-muted/20' : 'bg-transparent'}>
                  {columns.map((_: string, colIdx: number) => {
                    const cellValue = row[colIdx];
                    const label = typeof row[0] === 'string' ? row[0].toLowerCase() : '';
                    const isPercent =
                      label.includes('wacc') || label.includes('growth') || label.includes('margin') || label.includes('tax') ||
                      label.includes('terminal') || label.includes('capex') || label.includes('nwc') || label.includes('rate') ||
                      label.includes('multiple') || label.includes('exit') || label.includes('revenue gr') || label.includes('ebitda ma') ||
                      label.includes('capex %') || label.includes('Δnwc') || label.includes('effective ta') || label.includes('terminal g') ||
                      label.includes('discount ra') || label.includes('exit multipl');
                    const isPrice = label.includes('price') || label.includes('implied pri');
                    const isCurrency = label.includes('value') || isPrice || label.includes('revenue') || label.includes('fcf') || label.includes('cash') || label.includes('enterprise') || label.includes('equity');
                    const isEmpty = cellValue === null || cellValue === undefined || (typeof cellValue === 'string' && !cellValue.trim());
                    const numFromString =
                      typeof cellValue === 'string' && cellValue.trim()
                        ? Number(String(cellValue).replace(/[$,\s%]/g, ''))
                        : NaN;
                    const formattedValue = isEmpty
                      ? '—'
                      : typeof cellValue === 'number'
                        ? isPercent
                          ? formatPercent(cellValue)
                          : formatNumber(cellValue, { currency: isCurrency, decimals: isPrice ? 2 : 0 })
                        : Number.isFinite(numFromString)
                          ? isPercent
                            ? formatPercent(numFromString)
                            : formatNumber(numFromString, { currency: isCurrency, decimals: isPrice ? 2 : 0 })
                          : String(cellValue).trim() || '—';
                    
                    const isNumeric = typeof cellValue === 'number' || Number.isFinite(numFromString);
                    return (
                      <TableCell
                        key={colIdx}
                        className={`text-sm ${isNumeric ? 'text-right font-mono tabular-nums' : 'text-left'}`}
                      >
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
