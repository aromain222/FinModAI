"use client";

import React from 'react';
import type { MergerOutput } from '@/lib/models/outputTypes';
import { ModelPreviewShell, type KpiItem } from './ModelPreviewShell';
import { SafeTable, type TableColumn, EmptyState } from './SafeTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatMoney,
  formatPercent,
  formatMultiple,
  safeGet,
  safeArray,
} from '@/lib/models/safeFormatters';
import { Handshake } from 'lucide-react';

interface MergerPreviewProps {
  output: MergerOutput;
  ticker: string;
  downloadUrl?: string;
  onGenerateReport?: () => void;
}

/**
 * M&A Preview - Universal Layout
 */
export function MergerPreview({ output, ticker, downloadUrl, onGenerateReport }: MergerPreviewProps) {
  // Defensive defaults
  const maInputs = output?.maInputs;
  const maV1 = output?.maV1;
  const accretionDilution = output?.accretionDilution ?? {};
  const epsBridge = output?.epsBridge ?? {};
  const sourcesUses = output?.sourcesAndUses ?? {};
  const assumptions = output?.assumptions ?? {};

  // Extract values safely
  const targetEquityValue = safeGet(maV1, 'targetEquityValue.value', null);
  const newSharesIssued = safeGet(maV1, 'newSharesIssued.value', null);
  const proFormaNetIncome = safeGet(maV1, 'proFormaNetIncome.value', null);
  const standaloneEps = safeGet(maV1, 'standaloneEps.value', null);
  const proFormaEps = safeGet(maV1, 'proFormaEps.value', null);
  const accretionPct = safeGet(maV1, 'accretionPct.value', null);

  const premium = assumptions.premium;
  const cashPct = assumptions.mix?.cash;
  const stockPct = assumptions.mix?.stock;
  const revenueSynergies = assumptions.revenueSynergies;
  const costSynergies = assumptions.costSynergies;

  const isDegraded = !maInputs || !maV1;

  // KPI Strip
  const kpis: KpiItem[] = [
    {
      label: 'Offer Value',
      value: targetEquityValue,
      format: 'currency',
      description: 'Total consideration',
    },
    {
      label: 'Premium',
      value: premium,
      format: 'percent',
      description: 'Offer premium to market',
    },
    {
      label: 'Accretion / Dilution',
      value: accretionPct,
      format: 'percent',
      description: 'EPS impact',
    },
    {
      label: 'Synergies',
      value: (revenueSynergies ?? 0) + (costSynergies ?? 0),
      format: 'currency',
      description: 'Total synergies',
    },
    {
      label: 'Pro Forma EPS',
      value: proFormaEps,
      format: 'currency',
      description: 'Combined EPS',
    },
    {
      label: 'New Shares Issued',
      value: newSharesIssued,
      format: 'number',
      description: 'Stock consideration',
    },
  ];

  // Assumptions for sidebar
  const assumptionsList = [
    { label: 'Premium', value: formatPercent(premium) },
    { label: 'Cash %', value: formatPercent(cashPct) },
    { label: 'Stock %', value: formatPercent(stockPct) },
    { label: 'Revenue Synergies', value: formatMoney(revenueSynergies) },
    { label: 'Cost Synergies', value: formatMoney(costSynergies) },
  ];

  // Methodology text
  const methodology =
    'Merger & Acquisition (M&A) analysis evaluates deal value, financing mix, and accretion/dilution to acquirer EPS. Pro forma metrics reflect the combined entity including synergies.';

  // Deal Summary Table
  const dealSummaryRows = maInputs
    ? [
        {
          metric: 'Acquirer',
          value: maInputs.acquirer?.name || ticker,
        },
        {
          metric: 'Target',
          value: maInputs.target?.name || '—',
        },
        {
          metric: 'Offer Value',
          value: formatMoney(targetEquityValue),
        },
        {
          metric: 'Premium',
          value: formatPercent(premium),
        },
        {
          metric: 'Cash Consideration',
          value: formatPercent(cashPct),
        },
        {
          metric: 'Stock Consideration',
          value: formatPercent(stockPct),
        },
      ]
    : [];

  const dealSummaryColumns: TableColumn[] = [
    { key: 'metric', label: 'Item', align: 'left' },
    { key: 'value', label: 'Value', align: 'right' },
  ];

  // Pro Forma Metrics Table
  const proFormaRows = maV1
    ? [
        {
          metric: 'Standalone EPS',
          value: standaloneEps,
        },
        {
          metric: 'Pro Forma EPS',
          value: proFormaEps,
        },
        {
          metric: 'Accretion / Dilution',
          value: accretionPct,
        },
        {
          metric: 'Pro Forma Net Income',
          value: proFormaNetIncome,
        },
      ]
    : [];

  const proFormaColumns: TableColumn[] = [
    { key: 'metric', label: 'Metric', align: 'left' },
    {
      key: 'value',
      label: 'Value',
      align: 'right',
      format: (v, row) => {
        if (row.metric.includes('EPS')) return formatMoney(v, 2);
        if (row.metric.includes('Accretion')) return formatPercent(v);
        return formatMoney(v);
      },
    },
  ];

  // Sources & Uses (if available)
  const sources = safeArray(sourcesUses.sources);
  const uses = safeArray(sourcesUses.uses);

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

  return (
    <ModelPreviewShell
      title="M&A Analysis"
      subtitle="Merger accretion/dilution and deal structure"
      ticker={ticker}
      modelType="M&A"
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
        isDegraded
          ? 'M&A preview data partially unavailable. Workbook contains full output.'
          : undefined
      }
    >
      {/* Deal Summary */}
      {dealSummaryRows.length > 0 ? (
        <SafeTable
          title="Deal Summary"
          columns={dealSummaryColumns}
          rows={dealSummaryRows}
        />
      ) : (
        <EmptyState
          icon={<Handshake className="h-8 w-8 text-[var(--cb-text-muted)]" />}
          title="Deal summary not available"
          description="Transaction details are in the Excel workbook."
        />
      )}

      {/* Pro Forma Metrics */}
      {proFormaRows.length > 0 ? (
        <SafeTable
          title="Pro Forma Metrics"
          columns={proFormaColumns}
          rows={proFormaRows}
          highlightRow={(row) => row.metric === 'Accretion / Dilution'}
        />
      ) : (
        <EmptyState
          description="Pro forma analysis requires complete deal inputs. See workbook."
        />
      )}

      {/* Accretion/Dilution Visual */}
      {Number.isFinite(accretionPct) && (
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <CardTitle className="text-base">EPS Impact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <p className="text-xs text-[var(--cb-text-muted)] mb-2">
                {accretionPct && accretionPct > 0 ? 'Accretive' : 'Dilutive'} Transaction
              </p>
              <p
                className={`text-4xl font-bold ${
                  accretionPct && accretionPct > 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {accretionPct ? `${accretionPct > 0 ? '+' : ''}${(accretionPct * 100).toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-[var(--cb-text-muted)] mt-2">
                Impact to acquirer EPS
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sources & Uses (if available) */}
      {sources.length > 0 && uses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SafeTable
            title="Sources of Funds"
            columns={sourcesColumns}
            rows={sources}
          />
          <SafeTable
            title="Uses of Funds"
            columns={usesColumns}
            rows={uses}
          />
        </div>
      )}
    </ModelPreviewShell>
  );
}
