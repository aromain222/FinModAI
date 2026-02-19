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
import { FinanceStatementTable } from './FinanceStatementTable';
import {
  INCOME_STATEMENT_ROW_SCHEMA,
  BALANCE_SHEET_ROW_SCHEMA,
  CASH_FLOW_ROW_SCHEMA,
} from '@/lib/modelFormat';

interface ThreeStatementPreviewProps {
  output: any;
  ticker: string;
  /** e.g. "Demo-mode financials derived from public-company snapshots" or "Reported" */
  sourceLabel?: string;
}

const DEFAULT_SOURCE_LABEL = 'Demo-mode financials derived from public-company snapshots';

export function ThreeStatementPreview({ output, ticker, sourceLabel = DEFAULT_SOURCE_LABEL }: ThreeStatementPreviewProps) {
  const years = output?.years ?? [];
  const hasStatementData =
    Array.isArray(years) &&
    years.length > 0 &&
    output?.incomeStatement &&
    output?.balanceSheet &&
    output?.cashFlow;

  if (hasStatementData) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle>{ticker} — Three-Statement Model Preview</CardTitle>
          <p className="text-sm font-medium text-[var(--cb-text-muted)] mt-1">
            All figures in USD millions. Same structure as Excel. Source: {sourceLabel}.
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
          <FinanceStatementTable
            title="Income Statement"
            schema={INCOME_STATEMENT_ROW_SCHEMA}
            data={output.incomeStatement}
            years={years}
            sourceLabel={sourceLabel}
            showPctOfRevenue
            revenueKey="revenue"
          />
          <FinanceStatementTable
            title="Balance Sheet"
            schema={BALANCE_SHEET_ROW_SCHEMA}
            data={output.balanceSheet}
            years={years}
            sourceLabel={sourceLabel}
          />
          <FinanceStatementTable
            title="Cash Flow Statement"
            schema={CASH_FLOW_ROW_SCHEMA}
            data={output.cashFlow}
            years={years}
            sourceLabel={sourceLabel}
          />
        </CardContent>
      </Card>
    );
  }

  const preview = output?.preview || null;
  if (!preview || !preview.columns || !preview.rows) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle>{ticker} — Three-Statement Model Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-muted)]">
            Preview data not available. Download Excel to view the full model.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { columns, rows } = preview;
  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle>{ticker} — Three-Statement Model Preview</CardTitle>
        <p className="text-sm text-[var(--cb-text-muted)]">This is a preview of what the Excel model will look like</p>
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
                    const formattedValue =
                      cellValue === null || cellValue === undefined
                        ? ''
                        : typeof cellValue === 'number'
                          ? cellValue.toLocaleString('en-US', {
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
