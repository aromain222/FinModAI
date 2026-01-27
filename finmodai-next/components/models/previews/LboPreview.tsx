"use client";

import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ModelChecksSummary } from '@/components/models/ModelChecksSummary';
import { PreviewChartsPanel } from '@/components/models/PreviewChartsPanel';
import type { ChartSpec } from '@/types/chartSpecs';
import type { LboOutputField, LBOOutput } from '@/lib/models/outputTypes';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PreviewShell } from './PreviewShell';
import { KpiGrid } from './KpiGrid';
import { PreviewSection } from './PreviewSection';

interface LboPreviewProps {
  output: LBOOutput;
  ticker: string;
}

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return '$0';
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(1)}%`;
};

export function LboPreview({ output, ticker }: LboPreviewProps) {
  if (!output.sourcesAndUses.reconciles) {
    return (
      <Card className="border-[var(--cb-danger)]/50 bg-[var(--cb-danger)]/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-[var(--cb-danger)]">
            ⚠️ Sources/Uses mismatch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-primary)] mb-3">
            This LBO preview is disabled because Sources and Uses are not balanced.
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--cb-text-muted)]">Sources Total:</span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {formatCurrency(output.sourcesAndUses.sourcesTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cb-text-muted)]">Uses Total:</span>
              <span className="font-medium text-[var(--cb-text-primary)]">
                {formatCurrency(output.sourcesAndUses.usesTotal)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[var(--cb-border-subtle)] pt-1 font-semibold text-[var(--cb-danger)]">
              <span>Mismatch:</span>
              <span>{formatCurrency(output.sourcesAndUses.mismatch ?? 0)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const debtPeriods = [
    { label: output.debtPaydown.periods[0] ?? 'Year 0', value: output.debtPaydown.year0 },
    { label: output.debtPaydown.periods[1] ?? 'Year 1', value: output.debtPaydown.year1 },
    { label: output.debtPaydown.periods[2] ?? 'Year 2', value: output.debtPaydown.year2 },
    { label: output.debtPaydown.periods[3] ?? 'Exit', value: output.debtPaydown.exit },
  ];

  const charts: ChartSpec[] = [
    {
      type: 'line',
      title: 'Debt Paydown',
      xKey: 'label',
      series: [{ key: 'value', label: 'Debt Balance', color: '#22c55e' }],
      data: debtPeriods.map((row, index) => ({
        label: row.label,
        value: Number.isFinite(row.value) ? row.value : 0,
        index,
      })),
    },
    {
      type: 'bar',
      title: 'Sources vs Uses',
      xKey: 'label',
      series: [{ key: 'amount', label: 'Amount', color: '#3b82f6' }],
      data: [
        { label: 'Sources', amount: output.sourcesAndUses.sourcesTotal },
        { label: 'Uses', amount: output.sourcesAndUses.usesTotal },
      ],
    },
  ];

  const kpis = [
    { label: 'IRR', value: formatPercent(output.returns.irr) },
    { label: 'MOIC', value: `${output.returns.moic.toFixed(2)}x` },
    { label: 'Entry Multiple', value: `${output.dealTerms.entryMultiple.toFixed(1)}x` },
    { label: 'Leverage', value: `${output.dealTerms.leverageMultiple.toFixed(1)}x` },
    { label: 'Hold Period', value: `${output.dealTerms.holdPeriod} yrs` },
    { label: 'Exit Multiple', value: `${output.dealTerms.exitMultiple.toFixed(1)}x` },
  ];

  const assumptionRows = [
    { label: 'Entry Multiple', value: `${output.dealTerms.entryMultiple.toFixed(1)}x` },
    { label: 'Exit Multiple', value: `${output.dealTerms.exitMultiple.toFixed(1)}x` },
    { label: 'Leverage', value: `${output.dealTerms.leverageMultiple.toFixed(1)}x` },
    { label: 'Hold Period', value: `${output.dealTerms.holdPeriod} yrs` },
    { label: 'Sources = Uses', value: 'Balanced' },
  ];

  const rawRows = [
    ...output.sourcesAndUses.sources.map((item) => ({ type: 'Source', ...item })),
    ...output.sourcesAndUses.uses.map((item) => ({ type: 'Use', ...item })),
  ];

  const assertSourcedValue = (label: string, field: LboOutputField<unknown>) => {
    if (process.env.NODE_ENV !== 'production' && field.value !== undefined && !field.source) {
      throw new Error(`LBO output "${label}" is missing a source.`);
    }
  };

  const renderOutputValue = (label: string, value: string, field: LboOutputField<unknown>) => {
    assertSourcedValue(label, field);
    if (field.value !== undefined) {
      return <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{value}</span>;
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-sm font-semibold text-[var(--cb-text-muted)]">—</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs bg-slate-900 border-slate-700 text-slate-100">
          {field.reason ?? 'Missing value'}
        </TooltipContent>
      </Tooltip>
    );
  };

  const safeTicker = ticker ?? (output as any)?.ticker ?? '';

  return (
    <PreviewShell
      title="LBO Model Preview"
      subtitle="Enterprise value, leverage, and returns at a glance"
      badgeText="LBO"
      ticker={safeTicker}
      rightSlot={
        <Badge
          variant="outline"
          className="border-[var(--cb-green)] text-[var(--cb-green)] bg-[var(--cb-green)]/10 text-xs"
        >
          Sources = Uses
        </Badge>
      }
    >
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">Deal Health</CardTitle>
          <p className="text-xs text-[var(--cb-text-muted)]">Sources and Uses balanced.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <ModelChecksSummary
            checks={output.modelChecks}
            entries={[
            { key: 'incomeTies', label: 'Income ties' },
            { key: 'debtScheduleTies', label: 'Debt schedule ties' },
          ]}
        />
        <KpiGrid
          items={[
            { label: 'Enterprise Value', value: output.valuation.enterpriseValue.value !== undefined ? formatCurrency(output.valuation.enterpriseValue.value * 1_000_000) : '—' },
            { label: 'Equity Value', value: output.valuation.equityValue.value !== undefined ? formatCurrency(output.valuation.equityValue.value * 1_000_000) : '—' },
            { label: 'Net Debt', value: output.valuation.netDebt.value !== undefined ? formatCurrency(output.valuation.netDebt.value * 1_000_000) : '—' },
            { label: 'Shares Out', value: output.valuation.sharesOutstanding.value !== undefined ? `${output.valuation.sharesOutstanding.value.toFixed(1)}MM` : '—' },
            { label: 'IRR', value: output.valuation.irr.value !== undefined ? `${output.valuation.irr.value.toFixed(1)}%` : '—' },
            { label: 'MOIC', value: output.valuation.moic.value !== undefined ? `${output.valuation.moic.value.toFixed(2)}x` : '—' },
          ]}
        />
        <TooltipProvider>
          <PreviewSection
            title="Valuation Outputs"
            subtitle={`Units: ${output.valuation.units.value ?? '—'}`}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Enterprise Value</p>
                {renderOutputValue(
                  'Enterprise Value',
                  output.valuation.enterpriseValue.value !== undefined
                    ? formatCurrency(output.valuation.enterpriseValue.value * 1_000_000)
                    : '—',
                  output.valuation.enterpriseValue
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Equity Value</p>
                {renderOutputValue(
                  'Equity Value',
                  output.valuation.equityValue.value !== undefined
                    ? formatCurrency(output.valuation.equityValue.value * 1_000_000)
                    : '—',
                  output.valuation.equityValue
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Net Debt</p>
                {renderOutputValue(
                  'Net Debt',
                  output.valuation.netDebt.value !== undefined
                    ? formatCurrency(output.valuation.netDebt.value * 1_000_000)
                    : '—',
                  output.valuation.netDebt
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Shares Outstanding</p>
                {renderOutputValue(
                  'Shares Outstanding',
                  output.valuation.sharesOutstanding.value !== undefined
                    ? `${output.valuation.sharesOutstanding.value.toFixed(1)}MM`
                    : '—',
                  output.valuation.sharesOutstanding
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Price / Share</p>
                {renderOutputValue(
                  'Price / Share',
                  output.valuation.pricePerShare.value !== undefined
                    ? `$${output.valuation.pricePerShare.value.toFixed(2)}`
                    : '—',
                  output.valuation.pricePerShare
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">IRR</p>
                {renderOutputValue(
                  'IRR',
                  output.valuation.irr.value !== undefined
                    ? `${output.valuation.irr.value.toFixed(1)}%`
                    : '—',
                  output.valuation.irr
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">MOIC</p>
                {renderOutputValue(
                  'MOIC',
                  output.valuation.moic.value !== undefined
                    ? `${output.valuation.moic.value.toFixed(2)}x`
                    : '—',
                  output.valuation.moic
                )}
              </div>
            </div>
          </PreviewSection>
        </TooltipProvider>
        <div className="space-y-4">
          <PreviewChartsPanel charts={charts} title="Deal Timeline" chartHeightClass="h-48" />
        </div>
        <Accordion type="single" collapsible defaultValue={undefined}>
          <AccordionItem value="lbo-assumptions" className="border-0">
        <AccordionTrigger className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 text-sm font-semibold text-[var(--cb-text-primary)]">
          Key Assumptions
        </AccordionTrigger>
        <AccordionContent className="px-0">
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 text-sm text-[var(--cb-text-primary)] space-y-2">
                {assumptionRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-[var(--cb-text-muted)]">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">Raw Sources & Uses</h3>
            <span className="text-xs text-[var(--cb-text-muted)]">Secondary table</span>
          </div>
          <div className="overflow-x-auto">
            <Table className="text-xs mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="border-b border-[var(--cb-border-subtle)]">Type</TableHead>
                  <TableHead className="border-b border-[var(--cb-border-subtle)]">Item</TableHead>
                  <TableHead className="text-right border-b border-[var(--cb-border-subtle)]">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rawRows.map((row, idx) => (
                  <TableRow key={`${row.type}-${idx}`}>
                    <TableCell className="text-[var(--cb-text-muted)]">{row.type}</TableCell>
                    <TableCell>{row.item}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(row.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
    </PreviewShell>
  );
}
