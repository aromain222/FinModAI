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
import type { MergerOutput } from '@/lib/models/outputTypes';

interface MergerPreviewProps {
  output: MergerOutput;
  ticker: string;
}

export function MergerPreview({ output, ticker }: MergerPreviewProps) {
  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toFixed(0)}`;
  };

  const formatPercent = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle className="text-lg">Merger Model</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Accretion/Dilution Headline */}
        <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
          <div className="text-xs text-[var(--cb-text-muted)] mb-1">EPS Impact</div>
          <div className="flex items-center gap-3">
            <div className={`text-2xl font-bold ${
              output.accretionDilution.isAccretive
                ? 'text-[var(--cb-green)]'
                : 'text-[var(--cb-danger)]'
            }`}>
              {formatPercent(output.accretionDilution.epsImpact)}
            </div>
            <Badge
              variant={output.accretionDilution.isAccretive ? 'default' : 'destructive'}
              className={
                output.accretionDilution.isAccretive
                  ? 'bg-[var(--cb-green)]/20 text-[var(--cb-green)]'
                  : ''
              }
            >
              {output.accretionDilution.isAccretive ? 'Accretive' : 'Dilutive'}
            </Badge>
          </div>
        </div>

        {/* EPS Bridge */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">EPS Bridge</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--cb-text-muted)]">Standalone Acquirer EPS</span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                ${output.epsBridge.standaloneAcquirerEPS.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between pl-4 text-[var(--cb-text-muted)]">
              <span>Purchase Accounting</span>
              <span>{formatCurrency(output.epsBridge.purchaseAccounting)}</span>
            </div>
            <div className="flex justify-between pl-4 text-[var(--cb-text-muted)]">
              <span>Intangible Amortization</span>
              <span>{formatCurrency(output.epsBridge.intangAmort)}</span>
            </div>
            <div className="flex justify-between pl-4 text-[var(--cb-text-muted)]">
              <span>Synergies</span>
              <span className="text-[var(--cb-green)]">
                {formatCurrency(output.epsBridge.synergies)}
              </span>
            </div>
            <div className="flex justify-between pl-4 text-[var(--cb-text-muted)]">
              <span>Financing Effects</span>
              <span>{formatCurrency(output.epsBridge.financingEffects)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--cb-border-subtle)] pt-2 font-semibold">
              <span className="text-[var(--cb-text-primary)]">Pro Forma EPS</span>
              <span className="text-[var(--cb-text-primary)]">
                ${output.epsBridge.proFormaEPS.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Sources & Uses Summary */}
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
              </div>
            </div>
          </div>
        </div>

        {/* Key Assumptions */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">Key Assumptions</h3>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <span className="text-[var(--cb-text-muted)]">Premium: </span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {output.assumptions.premium.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Synergies Timeline: </span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {output.assumptions.synergiesTimeline}
              </span>
            </div>
            <div>
              <span className="text-[var(--cb-text-muted)]">Mix: </span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {output.assumptions.mix.cash.toFixed(0)}% Cash, {output.assumptions.mix.debt.toFixed(0)}% Debt,{' '}
                {output.assumptions.mix.stock.toFixed(0)}% Stock
              </span>
            </div>
            {output.assumptions.revenueSynergies !== undefined && (
              <div>
                <span className="text-[var(--cb-text-muted)]">Revenue Synergies: </span>
                <span className="font-medium text-[var(--cb-text-primary)]">
                  {formatCurrency(output.assumptions.revenueSynergies)}
                </span>
              </div>
            )}
            {output.assumptions.costSynergies !== undefined && (
              <div>
                <span className="text-[var(--cb-text-muted)]">Cost Synergies: </span>
                <span className="font-medium text-[var(--cb-text-primary)]">
                  {formatCurrency(output.assumptions.costSynergies)}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
