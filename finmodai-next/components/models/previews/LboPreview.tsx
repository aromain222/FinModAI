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
import type { LBOOutput } from '@/lib/models/outputTypes';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface LboPreviewProps {
  output: LBOOutput;
  ticker: string;
}

export function LboPreview({ output, ticker }: LboPreviewProps) {
  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toFixed(0)}`;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  // Block preview if sources != uses
  if (!output.sourcesAndUses.reconciles) {
    return (
      <Card className="border-[var(--cb-danger)]/50 bg-[var(--cb-danger)]/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-[var(--cb-danger)]">
            <AlertTriangle className="h-5 w-5" />
            LBO Model Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-primary)] mb-2">
            Sources and Uses do not reconcile. This model cannot be displayed.
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--cb-text-muted)]">Sources Total:</span>
              <span className="font-medium">{formatCurrency(output.sourcesAndUses.sourcesTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cb-text-muted)]">Uses Total:</span>
              <span className="font-medium">{formatCurrency(output.sourcesAndUses.usesTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--cb-border-subtle)] pt-1">
              <span className="text-[var(--cb-danger)]">Mismatch:</span>
              <span className="font-semibold text-[var(--cb-danger)]">
                {formatCurrency(output.sourcesAndUses.mismatch || 0)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">LBO Model</CardTitle>
          <Badge variant="default" className="gap-1 bg-[var(--cb-green)]/20 text-[var(--cb-green)]">
            <CheckCircle2 className="h-3 w-3" />
            Sources = Uses
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Deal Terms */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Deal Terms</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--cb-text-muted)]">Entry Multiple: </span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {output.dealTerms.entryMultiple.toFixed(1)}x
              </span>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Entry Price: </span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {formatCurrency(output.dealTerms.entryPrice)}
              </span>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Leverage Multiple: </span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {output.dealTerms.leverageMultiple.toFixed(1)}x
              </span>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Hold Period: </span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {output.dealTerms.holdPeriod} years
              </span>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Exit Multiple: </span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {output.dealTerms.exitMultiple.toFixed(1)}x
              </span>
            </div>
          </div>
        </div>

        {/* Returns Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="text-xs text-[var(--cb-text-muted)]">IRR</div>
            <div className="mt-1 text-xl font-bold text-[var(--cb-text-primary)]">
              {formatPercent(output.returns.irr)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="text-xs text-[var(--cb-text-muted)]">MOIC</div>
            <div className="mt-1 text-xl font-bold text-[var(--cb-text-primary)]">
              {output.returns.moic.toFixed(2)}x
            </div>
          </div>
        </div>

        {/* Sources & Uses */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Sources & Uses</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold text-[var(--cb-text-muted)] uppercase">Sources</h4>
              <div className="space-y-1 text-sm">
                {output.sourcesAndUses.sources.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-[var(--cb-text-muted)]">{item.item}</span>
                    <span className="font-medium text-[var(--cb-text-primary)]">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-[var(--cb-border-subtle)] pt-1 font-semibold">
                  <span className="text-[var(--cb-text-primary)]">Total</span>
                  <span className="text-[var(--cb-text-primary)]">
                    {formatCurrency(output.sourcesAndUses.sourcesTotal)}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold text-[var(--cb-text-muted)] uppercase">Uses</h4>
              <div className="space-y-1 text-sm">
                {output.sourcesAndUses.uses.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-[var(--cb-text-muted)]">{item.item}</span>
                    <span className="font-medium text-[var(--cb-text-primary)]">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-[var(--cb-border-subtle)] pt-1 font-semibold">
                  <span className="text-[var(--cb-text-primary)]">Total</span>
                  <span className="text-[var(--cb-text-primary)]">
                    {formatCurrency(output.sourcesAndUses.usesTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Debt Paydown */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Debt Paydown</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Debt Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {output.debtPaydown.periods.map((period, idx) => {
                  const value = idx === 0
                    ? output.debtPaydown.year0
                    : idx === 1
                    ? output.debtPaydown.year1
                    : idx === 2
                    ? output.debtPaydown.year2
                    : output.debtPaydown.exit;
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{period}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(value)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
