"use client";

import React from 'react';
import type { LBOOutput } from '@/lib/models/outputTypes';
import { ModelPreviewShell, type KpiItem } from './ModelPreviewShell';
import { SafeTable, type TableColumn, EmptyState } from './SafeTable';
import {
  formatMoney,
  formatPercent,
  formatMultiple,
  formatYears,
  safeArray,
} from '@/lib/models/safeFormatters';
import { TrendingUp } from 'lucide-react';

interface LboPreviewProps {
  output: LBOOutput;
  ticker: string;
  downloadUrl?: string;
  onGenerateReport?: () => void;
}

/**
 * LBO Preview - Universal Layout
 */
export function LboPreview({ output, ticker, downloadUrl, onGenerateReport }: LboPreviewProps) {
  // Defensive defaults
  const dealTerms = output?.dealTerms ?? {};
  const sourcesAndUses = output?.sourcesAndUses ?? {};
  const returns = output?.returns ?? {};
  const debtPaydown = output?.debtPaydown ?? {};

  const entryMultiple = dealTerms.entryMultiple;
  const entryPrice = dealTerms.entryPrice;
  const leverageMultiple = dealTerms.leverageMultiple;
  const holdPeriod = dealTerms.holdPeriod;
  const exitMultiple = dealTerms.exitMultiple;

  const irr = returns.irr;
  const moic = returns.moic;

  const sources = safeArray(sourcesAndUses.sources);
  const uses = safeArray(sourcesAndUses.uses);
  const reconciles = sourcesAndUses.reconciles ?? false;
  const mismatch = sourcesAndUses.mismatch;

  const isDegraded = !reconciles || sources.length === 0;

  // KPI Strip
  const kpis: KpiItem[] = [
    {
      label: 'Entry EV/EBITDA',
      value: entryMultiple,
      format: 'multiple',
      description: 'Purchase price multiple',
    },
    {
      label: 'Leverage (Debt/EBITDA)',
      value: leverageMultiple,
      format: 'multiple',
      description: 'Initial leverage ratio',
    },
    {
      label: 'Exit EV/EBITDA',
      value: exitMultiple,
      format: 'multiple',
      description: 'Exit valuation multiple',
    },
    {
      label: 'MOIC',
      value: moic,
      format: 'multiple',
      description: 'Money-on-money return',
    },
    {
      label: 'IRR',
      value: irr,
      format: 'percent',
      description: 'Internal rate of return',
    },
    {
      label: 'Holding Period',
      value: holdPeriod,
      format: 'number',
      unit: ' yrs',
      description: 'Investment horizon',
    },
  ];

  // Assumptions for sidebar
  const assumptionsList = [
    { label: 'Entry Multiple', value: formatMultiple(entryMultiple) },
    { label: 'Exit Multiple', value: formatMultiple(exitMultiple) },
    { label: 'Leverage', value: formatMultiple(leverageMultiple) },
    { label: 'Hold Period', value: formatYears(holdPeriod) },
    { label: 'IRR Target', value: formatPercent(irr) },
  ];

  // Methodology text
  const methodology =
    'Leveraged Buyout (LBO) analysis models a private equity acquisition using significant debt financing. Returns are driven by operational improvements, debt paydown, and multiple expansion.';

  // Sources & Uses Table
  const sourcesColumns: TableColumn[] = [
    { key: 'item', label: 'Source', align: 'left' },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      format: (v) => formatMoney(v),
    },
  ];

  const usesColumns: TableColumn[] = [
    { key: 'item', label: 'Use', align: 'left' },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      format: (v) => formatMoney(v),
    },
  ];

  // Add totals to sources and uses
  const sourcesWithTotal = [
    ...sources,
    {
      item: 'Total Sources',
      amount: sourcesAndUses.sourcesTotal,
    },
  ];

  const usesWithTotal = [
    ...uses,
    {
      item: 'Total Uses',
      amount: sourcesAndUses.usesTotal,
    },
  ];

  // Returns Bridge
  const returnsRows = [
    { metric: 'Entry EV', value: entryPrice },
    { metric: 'Exit EV', value: entryPrice && moic ? entryPrice * moic : null },
    { metric: 'MOIC', value: moic },
    { metric: 'IRR', value: irr },
  ];

  const returnsColumns: TableColumn[] = [
    { key: 'metric', label: 'Metric', align: 'left' },
    {
      key: 'value',
      label: 'Value',
      align: 'right',
      format: (v, row) => {
        if (row.metric === 'MOIC') return formatMultiple(v);
        if (row.metric === 'IRR') return formatPercent(v);
        return formatMoney(v);
      },
    },
  ];

  return (
    <ModelPreviewShell
      title="LBO Analysis"
      subtitle="Leveraged buyout returns and structure"
      ticker={ticker}
      modelType="LBO"
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
        !reconciles
          ? `Sources and Uses mismatch: ${formatMoney(mismatch)}. See workbook for details.`
          : sources.length === 0
          ? 'Sources & Uses not available in preview — see workbook.'
          : undefined
      }
    >
      {/* Sources & Uses */}
      {sources.length > 0 && uses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SafeTable
            title="Sources of Funds"
            columns={sourcesColumns}
            rows={sourcesWithTotal}
            highlightRow={(row) => row.item === 'Total Sources'}
          />
          <SafeTable
            title="Uses of Funds"
            columns={usesColumns}
            rows={usesWithTotal}
            highlightRow={(row) => row.item === 'Total Uses'}
          />
        </div>
      ) : (
        <EmptyState
          icon={<TrendingUp className="h-8 w-8 text-[var(--cb-text-muted)]" />}
          title="Sources & Uses not available"
          description="Transaction structure details are in the Excel workbook."
        />
      )}

      {/* Returns Summary */}
      {Number.isFinite(irr) && Number.isFinite(moic) ? (
        <SafeTable
          title="Returns Summary"
          columns={returnsColumns}
          rows={returnsRows}
          highlightRow={(row) => row.metric === 'IRR'}
        />
      ) : (
        <EmptyState
          description="Returns calculation requires complete deal structure. See workbook."
        />
      )}
    </ModelPreviewShell>
  );
}
