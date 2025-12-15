"use client";

import React, { useState } from 'react';
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
import { CheckCircle2, XCircle } from 'lucide-react';

interface ThreeStatementPreviewProps {
  output: ThreeStatementOutput;
  ticker: string;
}

export function ThreeStatementPreview({ output, ticker }: ThreeStatementPreviewProps) {
  const [activeTab, setActiveTab] = useState<'income' | 'cashflow' | 'balancesheet'>('income');

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const tabs = [
    { id: 'income' as const, label: 'Income Statement' },
    { id: 'cashflow' as const, label: 'Cash Flow' },
    { id: 'balancesheet' as const, label: 'Balance Sheet' },
  ];

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Three-Statement Model</CardTitle>
          <div className="flex items-center gap-2">
            {output.balanceSheetTies ? (
              <Badge variant="default" className="gap-1 bg-[var(--cb-green)]/20 text-[var(--cb-green)]">
                <CheckCircle2 className="h-3 w-3" />
                Balance Sheet Ties
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Balance Sheet Mismatch: {formatCurrency(output.balanceSheetMismatch || 0)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Tabs */}
        <div className="mb-4 flex gap-2 border-b border-[var(--cb-border-subtle)]">
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

        {/* Income Statement */}
        {activeTab === 'income' && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Line Item</TableHead>
                  {output.incomeStatement.periods.map((period, idx) => (
                    <TableHead key={idx} className="text-right">
                      {period}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Revenue</TableCell>
                  {output.incomeStatement.revenue.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="pl-4 text-[var(--cb-text-muted)]">COGS</TableCell>
                  {output.incomeStatement.cogs.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Gross Profit</TableCell>
                  {output.incomeStatement.grossProfit.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="pl-4 text-[var(--cb-text-muted)]">Operating Expenses</TableCell>
                  {output.incomeStatement.operatingExpenses.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">EBITDA</TableCell>
                  {output.incomeStatement.ebitda.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">EBIT</TableCell>
                  {output.incomeStatement.ebit.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Net Income</TableCell>
                  {output.incomeStatement.netIncome.map((val, idx) => (
                    <TableCell key={idx} className="text-right font-semibold">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
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
                  {output.cashFlow.periods.map((period, idx) => (
                    <TableHead key={idx} className="text-right">
                      {period}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Operating Cash Flow</TableCell>
                  {output.cashFlow.operatingCashFlow.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="pl-4 text-[var(--cb-text-muted)]">Investing Cash Flow</TableCell>
                  {output.cashFlow.investingCashFlow.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="pl-4 text-[var(--cb-text-muted)]">Financing Cash Flow</TableCell>
                  {output.cashFlow.financingCashFlow.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Net Change in Cash</TableCell>
                  {output.cashFlow.netChangeInCash.map((val, idx) => (
                    <TableCell key={idx} className="text-right font-semibold">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
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
                  {output.balanceSheet.periods.map((period, idx) => (
                    <TableHead key={idx} className="text-right">
                      {period}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Cash</TableCell>
                  {output.balanceSheet.cash.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Total Assets</TableCell>
                  {output.balanceSheet.totalAssets.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Total Liabilities</TableCell>
                  {output.balanceSheet.totalLiabilities.map((val, idx) => (
                    <TableCell key={idx} className="text-right">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Total Equity</TableCell>
                  {output.balanceSheet.totalEquity.map((val, idx) => (
                    <TableCell key={idx} className="text-right font-semibold">
                      {formatCurrency(val)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
