"use client";

import React from 'react';
import type { DCFOutput } from '@/lib/models/outputTypes';
import { ModelPreviewShell, type KpiItem } from './ModelPreviewShell';
import { SafeTable, type TableColumn, EmptyState } from './SafeTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatMoney,
  formatPercent,
  formatPrice,
  safeGet,
  safeArray,
} from '@/lib/models/safeFormatters';
import { BarChart3 } from 'lucide-react';

interface DcfPreviewProps {
  output: DCFOutput;
  ticker: string;
  downloadUrl?: string;
  onGenerateReport?: () => void;
}

/**
 * DCF Preview - Universal Layout
 */
export function DcfPreview({ output, ticker, downloadUrl, onGenerateReport }: DcfPreviewProps) {
  // Defensive defaults
  const valuation = output?.valuation ?? {};
  const bridge = output?.valuationBridge ?? {};
  const assumptions = output?.assumptions ?? {};
  const projections = output?.projections ?? {};
  const missingInputs = safeArray(output?.missingInputs);

  const impliedValue = valuation.impliedValuePerShare;
  const enterpriseValue = valuation.enterpriseValue;
  const equityValue = valuation.equityValue;
  const currentPrice = valuation.currentPrice;
  const upside = valuation.upsideDownside;

  const pvFCF = bridge.pvOfFCF;
  const pvTerminal = bridge.pvOfTerminalValue;
  const netDebt = bridge.netDebt;

  const wacc = assumptions.wacc;
  const terminalGrowth = assumptions.terminalGrowth;
  const taxRate = assumptions.taxRate;
  const projectionHorizon = assumptions.projectionHorizon ?? 5;

  const years = safeArray(projections.years);
  const revenue = safeArray(projections.revenue);
  const ebitda = safeArray(projections.ebitda);
  const fcf = safeArray(projections.freeCashFlow);

  const isDegraded = missingInputs.length > 0 || !impliedValue;

  // KPI Strip
  const kpis: KpiItem[] = [
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
    },
    {
      label: 'Implied Price / Share',
      value: impliedValue,
      format: 'currency',
      description: 'DCF-implied share price',
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
      description: 'Total debt minus cash',
    },
  ];

  // Assumptions for sidebar
  const assumptionsList = [
    { label: 'WACC', value: formatPercent(wacc) },
    { label: 'Terminal Growth', value: formatPercent(terminalGrowth) },
    { label: 'Tax Rate', value: formatPercent(taxRate) },
    { label: 'Projection Years', value: String(projectionHorizon) },
  ];

  // Methodology text
  const methodology =
    'Discounted Cash Flow (DCF) values a company by projecting future free cash flows and discounting them to present value using WACC. Terminal value captures value beyond the explicit forecast period.';

  // PV Breakdown Chart Data
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
      format: (v) => formatMoney(v),
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
      format: (v) => formatMoney(v),
    },
    {
      key: 'ebitda',
      label: 'EBITDA',
      align: 'right',
      format: (v) => formatMoney(v),
    },
    {
      key: 'fcf',
      label: 'Free Cash Flow',
      align: 'right',
      format: (v) => formatMoney(v),
    },
  ];

  return (
    <ModelPreviewShell
      title="DCF Valuation"
      subtitle="Discounted cash flow analysis"
      ticker={ticker}
      modelType="DCF"
      kpis={kpis}
      metadata={{
        scenario: 'Base Case',
      }}
      assumptions={assumptionsList}
      methodology={methodology}
      downloadUrl={downloadUrl}
      onGenerateReport={onGenerateReport}
      isDegraded={isDegraded}
      degradedMessage={
        missingInputs.length > 0
          ? `Missing inputs: ${missingInputs.join(', ')}. Workbook contains full output.`
          : undefined
      }
    >
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
        <SafeTable
          title="Forecast Summary"
          columns={forecastColumns}
          rows={forecastRows}
        />
      ) : (
        <EmptyState
          description="Forecast projections not available. See workbook for full model."
        />
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
                <p className="text-xs text-[var(--cb-text-muted)] mb-1">Current Price</p>
                <p className="text-lg font-semibold text-[var(--cb-text-primary)]">
                  {formatPrice(currentPrice)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--cb-text-muted)] mb-1">Implied Price</p>
                <p className="text-lg font-semibold text-[var(--cb-text-primary)]">
                  {formatPrice(impliedValue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--cb-text-muted)] mb-1">Upside / Downside</p>
                <p
                  className={`text-lg font-semibold ${
                    upside && upside > 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {upside ? `${upside > 0 ? '+' : ''}${upside.toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </ModelPreviewShell>
  );
}
