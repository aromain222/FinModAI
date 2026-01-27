"use client";

import React from 'react';
import type { CompsOutput } from '@/lib/models/outputTypes';
import { ModelPreviewShell, type KpiItem } from './ModelPreviewShell';
import { SafeTable, type TableColumn, EmptyState } from './SafeTable';
import {
  formatMoney,
  formatMultiple,
  safeArray,
} from '@/lib/models/safeFormatters';
import { Users } from 'lucide-react';

interface CompsPreviewProps {
  output: CompsOutput;
  ticker: string;
  downloadUrl?: string;
  onGenerateReport?: () => void;
}

/**
 * Comps Preview - Universal Layout
 */
export function CompsPreview({ output, ticker, downloadUrl, onGenerateReport }: CompsPreviewProps) {
  // Defensive defaults
  const peers = safeArray(output?.peers);
  const hasPeers = peers.length > 0;
  const target = output?.target ?? {};
  const summary = output?.summary ?? {};
  const impliedValuation = output?.impliedValuation ?? {};

  const medianEvRevenue = summary.evRevenue?.median;
  const medianEvEbitda = summary.evEbitda?.median;
  const medianPe = summary.pe?.median;

  const impliedEvRevenue = impliedValuation.evToRevenue;
  const impliedEvEbitda = impliedValuation.evToEBITDA;
  const impliedPe = impliedValuation.pe;

  const isDegraded = !hasPeers;

  // KPI Strip
  const kpis: KpiItem[] = [
    {
      label: 'Peer Count',
      value: hasPeers ? peers.length : null,
      format: 'number',
      description: 'Number of comparable companies',
    },
    {
      label: 'Median EV/Revenue',
      value: medianEvRevenue,
      format: 'multiple',
      description: 'Peer median revenue multiple',
    },
    {
      label: 'Median EV/EBITDA',
      value: medianEvEbitda,
      format: 'multiple',
      description: 'Peer median EBITDA multiple',
    },
    {
      label: 'Median P/E',
      value: medianPe,
      format: 'multiple',
      description: 'Peer median P/E ratio',
    },
    {
      label: 'Implied EV/EBITDA',
      value: impliedEvEbitda,
      format: 'multiple',
      description: 'Target implied multiple',
    },
    {
      label: 'Implied P/E',
      value: impliedPe,
      format: 'multiple',
      description: 'Target implied P/E',
    },
  ];

  // Assumptions for sidebar
  const assumptionsList = [
    { label: 'Peer Count', value: String(peers.length) },
    { label: 'Median EV/Revenue', value: formatMultiple(medianEvRevenue) },
    { label: 'Median EV/EBITDA', value: formatMultiple(medianEvEbitda) },
    { label: 'Median P/E', value: formatMultiple(medianPe) },
  ];

  // Methodology text
  const methodology =
    'Trading comparables analysis uses peer company multiples to estimate relative valuation. Peers are selected based on sector, business model, and financial profile similarity.';

  // Peers Table
  const peerRows = hasPeers
    ? [
        {
          ticker: target.ticker || 'Target',
          name: target.name || '—',
          evToRevenue: target.revenue,
          evToEBITDA: target.ebitda,
          pe: target.netIncome,
          isTarget: true,
        },
        ...peers.map((peer) => ({
          ticker: peer.ticker,
          name: peer.name || '—',
          evToRevenue: peer.evToRevenue,
          evToEBITDA: peer.evToEBITDA,
          pe: peer.pe,
          isTarget: false,
        })),
      ]
    : [];

  const peerColumns: TableColumn[] = [
    { key: 'ticker', label: 'Ticker', align: 'left', className: 'font-semibold' },
    { key: 'name', label: 'Company', align: 'left' },
    {
      key: 'evToRevenue',
      label: 'EV/Revenue',
      align: 'right',
      format: (v) => formatMultiple(v),
    },
    {
      key: 'evToEBITDA',
      label: 'EV/EBITDA',
      align: 'right',
      format: (v) => formatMultiple(v),
    },
    {
      key: 'pe',
      label: 'P/E',
      align: 'right',
      format: (v) => formatMultiple(v),
    },
  ];

  return (
    <ModelPreviewShell
      title="Comps Analysis"
      subtitle="Trading multiples comparison"
      ticker={ticker}
      modelType="Comps"
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
          ? 'No comparable companies were identified for this run based on the selected filters. The workbook contains the full output.'
          : undefined
      }
    >
      {/* Peers Table */}
      {hasPeers ? (
        <SafeTable
          title="Peer Multiples"
          columns={peerColumns}
          rows={peerRows}
          highlightRow={(row) => row.isTarget}
          maxHeight="max-h-96"
        />
      ) : (
        <EmptyState
          icon={<Users className="h-8 w-8 text-[var(--cb-text-muted)]" />}
          title="No comparable companies identified"
          description="No peers were found based on the selected filters. The Excel workbook contains the full model output."
        />
      )}
    </ModelPreviewShell>
  );
}
