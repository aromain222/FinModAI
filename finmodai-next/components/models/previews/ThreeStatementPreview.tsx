"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import type { ThreeStatementOutput } from '@/lib/models/outputTypes';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { formatMoney } from '@/lib/format/finance';
import { buildPreviewModel } from '@/lib/preview/buildPreviewModel';
import type { PreviewModel } from '@/types/previewModel';
import { PreviewShell } from './PreviewShell';

interface ThreeStatementPreviewProps {
  output: ThreeStatementOutput | null;
  ticker: string;
  isLoading?: boolean;
  financials?: {
    revenueM?: number;
    ebitdaM?: number;
    cashM?: number;
    debtM?: number;
    netIncomeM?: number;
    [key: string]: any;
  } | null;
  assumptions?: {
    revenue?: number[];
    revenueGrowth?: number[];
    cogsPct?: number[];
    opexPct?: number[];
    daPct?: number[];
    taxRate?: number;
    forecastYears?: number;
    [key: string]: any;
  } | null;
}

export function ThreeStatementPreview({ 
  output, 
  ticker, 
  isLoading = false,
  financials,
  assumptions,
}: ThreeStatementPreviewProps) {
  const safeTicker = ticker ?? (output as any)?.ticker ?? '';
  const [activeTab, setActiveTab] = useState<'income' | 'cashflow' | 'balancesheet'>('income');

  // Build preview model - ALWAYS returns complete data
  const preview: PreviewModel = useMemo(() => {
    return buildPreviewModel({
      generatedModel: output,
      financials: financials || null,
      assumptions: assumptions || null,
    });
  }, [output, financials, assumptions]);

  // Calculate balance sheet tie status from preview
  const balanceSheetStatus = useMemo(() => {
    const totalAssetsRow = preview.balanceSheet.find(r => r.key === "totalAssets");
    const totalLERow = preview.balanceSheet.find(r => r.key === "totalLE");
    
    if (!totalAssetsRow || !totalLERow) {
      return { ties: false, mismatch: null };
    }
    
    const diffs = preview.years.map(year => {
      const assets = totalAssetsRow.values[year] || 0;
      const le = totalLERow.values[year] || 0;
      return assets - le;
    });
    
    const tolerance = 1_000_000; // $1M tolerance
    const allTie = diffs.every(diff => Math.abs(diff) < tolerance);
    const maxMismatch = Math.max(...diffs.map(Math.abs));
    
    return {
      ties: allTie,
      mismatch: allTie ? null : maxMismatch,
    };
  }, [preview]);

  // Format value helper - handles null/undefined and shows "—" for missing
  const formatValue = (value: number | null | undefined, format?: "money" | "percent" | "number"): string => {
    if (value === null || value === undefined) {
      return '—';
    }
    
    if (format === "percent") {
      return `${(value * 100).toFixed(1)}%`;
    }
    
    if (format === "number") {
      return value.toLocaleString();
    }
    
    // Default: money format
    // Use formatMoney from finance utilities (handles B/M/K scaling)
    // Values are in raw dollars, so use 'raw' unit
    return formatMoney(value, 'raw', { decimals: 1 });
  };

  const tabs = [
    { id: 'income' as const, label: 'Income Statement' },
    { id: 'cashflow' as const, label: 'Cash Flow' },
    { id: 'balancesheet' as const, label: 'Balance Sheet' },
  ];

  // Loading state
  if (isLoading) {
    return (
      <PreviewShell title="Three-Statement Model" badgeText="3-Statement" ticker={safeTicker}>
        <Card className="h-full flex flex-col border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader className="shrink-0">
            <CardTitle className="text-lg">Three-Statement Model</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--cb-green)] mx-auto"></div>
              <p className="text-sm text-[var(--cb-text-muted)]">Loading financial statements...</p>
            </div>
          </CardContent>
        </Card>
      </PreviewShell>
    );
  }

  // Preview always has data (never empty), so we always render

  return (
    <PreviewShell
      title="Three-Statement Model"
      subtitle="Income statement, cash flow, and balance sheet preview"
      badgeText="3-Statement"
      ticker={safeTicker}
    >
      <Card className="h-full flex flex-col border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Three-Statement Model</CardTitle>
          <div className="flex items-center gap-2">
            {preview.diagnostics.dataSource === "fallback" && (
              <Badge variant="outline" className="gap-1 text-[var(--cb-text-muted)]">
                <Info className="h-3 w-3" />
                Using defaults
              </Badge>
            )}
            {preview.diagnostics.dataSource === "financials" && (
              <Badge variant="outline" className="gap-1 text-[var(--cb-green)]">
                <Info className="h-3 w-3" />
                Using actuals
              </Badge>
            )}
            {balanceSheetStatus.ties ? (
              <Badge variant="default" className="gap-1 bg-[var(--cb-green)]/20 text-[var(--cb-green)]">
                <CheckCircle2 className="h-3 w-3" />
                Balance Sheet Ties
              </Badge>
            ) : balanceSheetStatus.mismatch !== null ? (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Balance Sheet Mismatch: {formatValue(balanceSheetStatus.mismatch)}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col">
        {/* Model Checks Panel */}
        {output?.modelChecks && (
          <div className="mb-4 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Model Checks</h3>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="flex items-center gap-2">
                {output.modelChecks.incomeStatementTies ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[var(--cb-green)]" />
                    <span className="text-xs text-[var(--cb-text-primary)]">Income Statement Ties</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-[var(--cb-danger)]" />
                    <span className="text-xs text-[var(--cb-text-muted)]">Income Statement Issues</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {output.modelChecks.cashRollForwardTies ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[var(--cb-green)]" />
                    <span className="text-xs text-[var(--cb-text-primary)]">Cash Roll-Forward Ties</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-[var(--cb-danger)]" />
                    <span className="text-xs text-[var(--cb-text-muted)]">Cash Roll-Forward Issues</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {output.modelChecks.balanceSheetBalances ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[var(--cb-green)]" />
                    <span className="text-xs text-[var(--cb-text-primary)]">Balance Sheet Balances</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-[var(--cb-danger)]" />
                    <span className="text-xs text-[var(--cb-text-muted)]">Balance Sheet Issues</span>
                  </>
                )}
              </div>
            </div>
            {output.modelChecks.issues && output.modelChecks.issues.length > 0 && (
              <div className="mt-3 border-t border-[var(--cb-border-subtle)] pt-3">
                <p className="mb-2 text-xs font-medium text-[var(--cb-text-muted)]">Issues Found:</p>
                <ul className="space-y-1">
                  {output.modelChecks.issues.slice(0, 3).map((issue, idx) => (
                    <li key={idx} className="text-xs text-[var(--cb-text-muted)]">
                      • {issue}
                    </li>
                  ))}
                  {output.modelChecks.issues.length > 3 && (
                    <li className="text-xs text-[var(--cb-text-muted)]">
                      ... and {output.modelChecks.issues.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
        {/* Tabs */}
        <div className="shrink-0 mb-4 flex gap-2 border-b border-[var(--cb-border-subtle)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-4 py-2 text-sm font-medium transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-b-2 border-[var(--cb-green)] text-[var(--cb-text-primary)]'
                    : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content area - scrollable */}
        <div className="flex-1 min-h-0 overflow-auto">

          {/* Income Statement */}
          {activeTab === 'income' && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Line Item</TableHead>
                    {preview.years.map((year, idx) => (
                      <TableHead key={idx} className="text-right">
                        {year}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.incomeStatement.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className={row.key === "revenue" || row.key === "grossProfit" || row.key === "ebitda" || row.key === "ebit" || row.key === "netIncome" ? "font-medium" : "pl-4 text-[var(--cb-text-muted)]"}>
                        {row.label}
                      </TableCell>
                      {preview.years.map((year, idx) => (
                        <TableCell 
                          key={idx} 
                          className={`text-right ${row.key === "netIncome" ? "font-semibold" : ""}`}
                        >
                          {formatValue(row.values[year], row.format)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Cash Flow */}
          {activeTab === 'cashflow' && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Line Item</TableHead>
                    {preview.years.map((year, idx) => (
                      <TableHead key={idx} className="text-right">
                        {year}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.cashFlow.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className={row.key === "netIncome" || row.key === "cfo" || row.key === "netChangeInCash" ? "font-medium" : "pl-4 text-[var(--cb-text-muted)]"}>
                        {row.label}
                      </TableCell>
                      {preview.years.map((year, idx) => (
                        <TableCell 
                          key={idx} 
                          className={`text-right ${row.key === "netChangeInCash" ? "font-semibold" : ""}`}
                        >
                          {formatValue(row.values[year], row.format)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Balance Sheet */}
          {activeTab === 'balancesheet' && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Line Item</TableHead>
                    {preview.years.map((year, idx) => (
                      <TableHead key={idx} className="text-right">
                        {year}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.balanceSheet.map((row) => (
                    <TableRow key={row.key} className={row.key === "totalLE" ? "bg-[var(--cb-surface-alt)]" : ""}>
                      <TableCell className={row.key === "cash" || row.key === "totalAssets" || row.key === "totalLiabilities" || row.key === "equity" || row.key === "totalLE" ? "font-medium" : "pl-4 text-[var(--cb-text-muted)]"}>
                        {row.label}
                      </TableCell>
                      {preview.years.map((year, idx) => {
                        const value = row.values[year];
                        const ties = preview.diagnostics.tiesByYear[year];
                        const isCheckRow = row.key === "totalLE";
                        
                        return (
                          <TableCell 
                            key={idx} 
                            className={`text-right ${
                              row.key === "equity" || row.key === "totalLE" ? "font-semibold" : ""
                            } ${
                              isCheckRow 
                                ? (ties ? "text-[var(--cb-green)]" : "text-[var(--cb-danger)]")
                                : ""
                            }`}
                          >
                            {formatValue(value, row.format)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
      </Card>
    </PreviewShell>
  );
}
