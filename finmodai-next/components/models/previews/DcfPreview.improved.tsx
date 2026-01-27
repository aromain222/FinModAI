"use client";

import React, { useState, useCallback } from 'react';
import type { DCFOutput } from '@/lib/models/outputTypes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SafeTable, type TableColumn, EmptyState } from './SafeTable';
import { ImprovedKpiStrip, type ImprovedKpiItem } from './ImprovedKpiCard';
import { NetDebtInput } from './NetDebtInput';
import { Button } from '@/components/ui/button';
import { Download, FileText, BarChart3 } from 'lucide-react';
import {
  formatMoneyReadable,
  formatPercentReadable,
  formatPriceReadable,
  tabularNumsStyle,
} from '@/lib/models/improvedFormatters';
import { safeArray } from '@/lib/models/safeFormatters';

interface DcfPreviewProps {
  output: DCFOutput;
  ticker: string;
  downloadUrl?: string;
  onGenerateReport?: () => void;
  onNetDebtUpdate?: (netDebt: number) => void;
}

/**
 * Improved DCF Preview with:
 * - Enhanced numeric readability
 * - Net debt input handling
 * - Consistent spacing
 * - Tabular numerals
 */
export function DcfPreview({
  output,
  ticker,
  downloadUrl,
  onGenerateReport,
  onNetDebtUpdate,
}: DcfPreviewProps) {
  // Defensive defaults
  const valuation = output?.valuation ?? {};
  const bridge = output?.valuationBridge ?? {};
  const assumptions = output?.assumptions ?? {};
  const projections = output?.projections ?? {};
  const missingInputs = safeArray(output?.missingInputs);

  const [netDebt, setNetDebt] = useState(bridge.netDebt);

  const impliedValue = valuation.impliedValuePerShare;
  const enterpriseValue = valuation.enterpriseValue;
  const equityValue = valuation.equityValue;
  const currentPrice = valuation.currentPrice;
  const upside = valuation.upsideDownside;

  const pvFCF = bridge.pvOfFCF;
  const pvTerminal = bridge.pvOfTerminalValue;

  const wacc = assumptions.wacc;
  const terminalGrowth = assumptions.terminalGrowth;
  const taxRate = assumptions.taxRate;
  const projectionHorizon = assumptions.projectionHorizon ?? 5;

  const years = safeArray(projections.years);
  const revenue = safeArray(projections.revenue);
  const ebitda = safeArray(projections.ebitda);
  const fcf = safeArray(projections.freeCashFlow);

  const hasNetDebt = netDebt !== null && netDebt !== undefined && Number.isFinite(netDebt);
  const isDegraded = missingInputs.length > 0 || !impliedValue;

  // Handle net debt update
  const handleNetDebtUpdate = useCallback(
    (newNetDebt: number) => {
      setNetDebt(newNetDebt);
      if (onNetDebtUpdate) {
        onNetDebtUpdate(newNetDebt);
      }
      // In a real implementation, this would trigger a recalculation
      // of equity value and price per share
    },
    [onNetDebtUpdate]
  );

  // KPI Strip
  const kpis: ImprovedKpiItem[] = [
    {
      label: 'Enterprise Value',
      value: enterpriseValue,
      format: 'currency',
      description: 'Total firm value',
    },
    {
      label: 'Equity Value',
      value: equityValue,
      format: 'currency',
      description: 'Value to equity holders',
      highlight: !hasNetDebt, // Highlight if net debt missing
    },
    {
      label: 'Implied Price / Share',
      value: impliedValue,
      format: 'price',
      description: 'DCF-implied share price',
      delta: currentPrice && impliedValue ? (impliedValue - currentPrice) / currentPrice : undefined,
      deltaFormat: 'percent',
      highlight: !hasNetDebt,
    },
    {
      label: 'WACC',
      value: wacc,
      format: 'percent',
      description: 'Weighted average cost of capital',
    },
    {
      label: 'Terminal Growth',
      value: terminalGrowth,
      format: 'percent',
      description: 'Perpetual growth rate',
    },
    {
      label: 'Net Debt',
      value: netDebt,
      format: 'currency',
      description: 'Total debt minus cash (user input)',
      highlight: !hasNetDebt,
    },
  ];

  // Assumptions for sidebar
  const assumptionsList = [
    { label: 'WACC', value: formatPercentReadable(wacc) },
    { label: 'Terminal Growth', value: formatPercentReadable(terminalGrowth) },
    { label: 'Tax Rate', value: formatPercentReadable(taxRate) },
    { label: 'Projection Years', value: String(projectionHorizon) },
  ];

  // Methodology text
  const methodology =
    'Discounted Cash Flow (DCF) values a company by projecting future free cash flows and discounting them to present value using WACC. Terminal value captures value beyond the explicit forecast period.';

  // PV Breakdown
  const hasBridgeData = Number.isFinite(pvFCF) && Number.isFinite(pvTerminal);
  const bridgeRows = hasBridgeData
    ? [
        { component: 'PV of Explicit FCF', value: pvFCF },
        { component: 'PV of Terminal Value', value: pvTerminal },
        { component: 'Enterprise Value', value: enterpriseValue },
        { component: 'Less: Net Debt', value: netDebt ? -netDebt : 0 },
        { component: 'Equity Value', value: equityValue },
      ]
    : [];

  const bridgeColumns: TableColumn[] = [
    { key: 'component', label: 'Component', align: 'left' },
    {
      key: 'value',
      label: 'Value',
      align: 'right',
      format: (v) => formatMoneyReadable(v),
      className: 'font-mono',
    },
  ];

  // Forecast Table
  const forecastRows = years.map((year, idx) => ({
    year,
    revenue: revenue[idx],
    ebitda: ebitda[idx],
    fcf: fcf[idx],
  }));

  const forecastColumns: TableColumn[] = [
    { key: 'year', label: 'Period', align: 'left' },
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      format: (v) => formatMoneyReadable(v),
      className: 'font-mono',
    },
    {
      key: 'ebitda',
      label: 'EBITDA',
      align: 'right',
      format: (v) => formatMoneyReadable(v),
      className: 'font-mono',
    },
    {
      key: 'fcf',
      label: 'Free Cash Flow',
      align: 'right',
      format: (v) => formatMoneyReadable(v),
      className: 'font-mono',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-[var(--cb-text-primary)]">DCF Valuation</h2>
            <span className="rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">
              DCF
            </span>
            {ticker && (
              <span className="rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--cb-text-primary)]">
                {ticker}
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--cb-text-muted)]">Discounted cash flow analysis</p>
        </div>
      </header>

      {/* Degraded State Banner */}
      {isDegraded && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <p className="text-sm text-[var(--cb-text-primary)]">
              {missingInputs.length > 0
                ? `Missing inputs: ${missingInputs.join(', ')}. Workbook contains full output.`
                : 'Preview data partially unavailable. Workbook contains full output.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* KPI Strip */}
          <ImprovedKpiStrip items={kpis} />

          {/* Net Debt Input */}
          <NetDebtInput
            currentValue={netDebt}
            onUpdate={handleNetDebtUpdate}
            ticker={ticker}
          />

          {/* PV Breakdown */}
          {hasBridgeData ? (
            <SafeTable
              title="Valuation Bridge"
              columns={bridgeColumns}
              rows={bridgeRows}
              highlightRow={(row) => row.component === 'Equity Value'}
            />
          ) : (
            <EmptyState
              icon={<BarChart3 className="h-8 w-8 text-[var(--cb-text-muted)]" />}
              title="Valuation bridge not available"
              description="The PV breakdown requires complete cash flow projections. See workbook for details."
            />
          )}

          {/* Forecast Table */}
          {forecastRows.length > 0 ? (
            <SafeTable title="Forecast Summary" columns={forecastColumns} rows={forecastRows} />
          ) : (
            <EmptyState description="Forecast projections not available. See workbook for full model." />
          )}

          {/* Current Price Comparison */}
          {currentPrice && impliedValue && (
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Valuation vs Market</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)] mb-2 leading-tight">Current Price</p>
                    <p
                      className="text-2xl font-semibold text-[var(--cb-text-primary)] font-mono leading-tight"
                      style={tabularNumsStyle}
                    >
                      {formatPriceReadable(currentPrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)] mb-2 leading-tight">Implied Price</p>
                    <p
                      className="text-2xl font-semibold text-[var(--cb-text-primary)] font-mono leading-tight"
                      style={tabularNumsStyle}
                    >
                      {formatPriceReadable(impliedValue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)] mb-2 leading-tight">Upside / Downside</p>
                    <p
                      className={`text-2xl font-semibold font-mono leading-tight ${
                        upside && upside > 0 ? 'text-green-500' : 'text-red-500'
                      }`}
                      style={tabularNumsStyle}
                    >
                      {upside ? `${upside > 0 ? '+' : ''}${upside.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Run Metadata */}
          <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
            <CardHeader>
              <CardTitle className="text-base">Run Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-[var(--cb-text-muted)]">Ticker</p>
                <p className="text-sm font-mono text-[var(--cb-text-primary)]">{ticker || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--cb-text-muted)]">Scenario</p>
                <p className="text-sm text-[var(--cb-text-primary)]">Base Case</p>
              </div>
              <div>
                <p className="text-xs text-[var(--cb-text-muted)]">Generated</p>
                <p className="text-sm text-[var(--cb-text-primary)]">{new Date().toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>

          {/* Assumptions Summary */}
          <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
            <CardHeader>
              <CardTitle className="text-base">Key Assumptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {assumptionsList.map((assumption, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="text-[var(--cb-text-muted)]">{assumption.label}</span>
                  <span className="font-mono text-[var(--cb-text-primary)]" style={tabularNumsStyle}>
                    {assumption.value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Methodology */}
          <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
            <CardHeader>
              <CardTitle className="text-base">Methodology</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--cb-text-muted)] leading-relaxed">{methodology}</p>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-3">
            {downloadUrl && (
              <Button variant="outline" className="w-full" onClick={() => window.open(downloadUrl, '_blank')}>
                <Download className="mr-2 h-4 w-4" />
                Download Excel
              </Button>
            )}
            {onGenerateReport && (
              <Button variant="outline" className="w-full" onClick={onGenerateReport}>
                <FileText className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
