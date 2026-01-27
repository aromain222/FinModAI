"use client";

import React from 'react';
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
import type { OperatingOutput } from '@/lib/models/outputTypes';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { PreviewShell } from './PreviewShell';

interface OperatingPreviewProps {
  output: OperatingOutput;
  ticker: string;
}

export function OperatingPreview({ output, ticker }: OperatingPreviewProps) {
  const safeTicker = ticker ?? (output as any)?.ticker ?? '';
  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  // Show next 6-12 months (or all if fewer)
  const displayMonths = output.monthly.slice(0, 12);

  return (
    <PreviewShell
      title="Operating Model"
      subtitle="Runway, monthly burn, and key drivers"
      badgeText="Operating"
      ticker={safeTicker}
    >
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Operating Model</CardTitle>
          <Badge
            variant={output.runway.isPositive ? 'default' : 'destructive'}
            className={
              output.runway.isPositive
                ? 'bg-[var(--cb-green)]/20 text-[var(--cb-green)]'
                : ''
            }
          >
            {output.runway.isPositive
              ? 'Cash Positive'
              : `Runway: ${output.runway.monthCashTurnsNegative ? `${output.runway.monthCashTurnsNegative} months` : '12-18 months (estimated)'}`}
          </Badge>
        </div>
        </CardHeader>
        <CardContent className="space-y-6">
        {/* Monthly Table */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Monthly Forecast</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">EBITDA</TableHead>
                  <TableHead className="text-right">Net Income</TableHead>
                  <TableHead className="text-right">Ending Cash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayMonths.map((month, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{month.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(month.revenue)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(month.grossProfit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(month.ebitda)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(month.netIncome)}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        month.endingCash < 0 ? 'text-[var(--cb-danger)]' : ''
                      }`}
                    >
                      {formatCurrency(month.endingCash)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Runway Indicator */}
        {!output.runway.isPositive && output.runway.monthCashTurnsNegative && (
          <div className="rounded-lg border border-[var(--cb-danger)]/50 bg-[var(--cb-danger)]/5 p-4">
            <div className="flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4 text-[var(--cb-danger)]" />
              <span className="font-semibold text-[var(--cb-danger)]">
                Cash turns negative in {output.runway.monthCashTurnsNegative}
              </span>
            </div>
          </div>
        )}

        {/* Drivers (if available) */}
        {output.drivers && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Key Drivers</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {output.drivers.customerAdds && (
                <div>
                  <div className="mb-2 text-xs font-semibold text-[var(--cb-text-muted)] uppercase">
                    Customer Adds
                  </div>
                  <div className="space-y-1 text-sm">
                    {output.drivers.customerAdds.slice(0, 6).map((val, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-[var(--cb-text-muted)]">Month {idx + 1}</span>
                        <span className="font-medium text-[var(--cb-text-primary)]">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {output.drivers.headcount && (
                <div>
                  <div className="mb-2 text-xs font-semibold text-[var(--cb-text-muted)] uppercase">
                    Headcount
                  </div>
                  <div className="space-y-1 text-sm">
                    {output.drivers.headcount.slice(0, 6).map((val, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-[var(--cb-text-muted)]">Month {idx + 1}</span>
                        <span className="font-medium text-[var(--cb-text-primary)]">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </CardContent>
      </Card>
    </PreviewShell>
  );
}
