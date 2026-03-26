'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { EditableFinanceChart } from '@/components/charts/EditableFinanceChart';
import type { AnalystGeneratedModelPayload, AnalystStructuredModelAdjustment } from '@/lib/analyst/modelChat';

type CompsTickerAdjustment = {
  revenueShiftPct: number;
  ebitdaShiftPct: number;
  priceShiftPct: number;
  sharesShiftPct: number;
};

function isCurrencyKey(key?: string): boolean {
  if (!key) return false;
  return /(revenue|income|cash|debt|price|value|equity|ebitda|ebit|ev|capex|nwc|inventory|dividend|book|ppe|burn|fundraise|purchase|goodwill|assets|liab|sales|cogs|arr|arpu|cac|marketcap|valuation|proceeds|amount|principal|interest|expense|balance|amortization|buyback|repurchase|cashflow|fcf)/i.test(
    key
  );
}

function isPercentKey(key?: string): boolean {
  if (!key) return false;
  return /(margin|growth|rate|yield|pct|percent|ownership|churn|tax|wacc|discount|terminal|payout|roe|irr|probability)/i.test(
    key
  );
}

function isMultipleKey(key?: string): boolean {
  if (!key) return false;
  return /(multiple|coverage|leverage|moic|ltv|turnover)/i.test(key);
}

function renderValue(value: unknown, key?: string): string {
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      return value
        .map((item) => {
          const row = item as Record<string, unknown>;
          return String(row.ticker ?? row.name ?? row.target ?? row.transaction ?? 'Structured row');
        })
        .join(', ');
    }
    return value.map((item) => renderValue(item, key)).join(', ');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
      .slice(0, 4)
      .map(([entryKey, item]) => `${entryKey}: ${renderValue(item, entryKey)}`);
    return entries.length > 0 ? entries.join(', ') : 'Structured object';
  }
  if (typeof value === 'number') {
    if (isPercentKey(key)) {
      const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
      return `${percentValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    }
    if (isMultipleKey(key)) return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}x`;
    if (isCurrencyKey(key)) {
      return `$${value.toLocaleString('en-US', {
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      })}`;
    }
    if (Math.abs(value) >= 1000) return value.toLocaleString('en-US');
    if (value > 0 && value < 1) return `${(value * 100).toFixed(1)}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'n/a';
  return String(value);
}

function ObjectGrid(props: { title: string; values: Record<string, unknown>; emptyMessage: string }) {
  const entries = Object.entries(props.values);
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">{props.title}</div>
      {entries.length === 0 ? (
        <p className="text-xs text-[var(--cb-text-muted)]">{props.emptyMessage}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">{key}</div>
              <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{renderValue(value, key)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ChartSpec =
  | {
      kind: 'line';
      title: string;
      data: Array<Record<string, string | number>>;
      lines: Array<{ key: string; label: string; color: string; valueType?: 'currency' | 'percent' | 'number' }>;
      yType?: 'currency' | 'percent' | 'number';
    }
  | {
      kind: 'bar';
      title: string;
      data: Array<Record<string, string | number>>;
      bars: Array<{ key: string; label: string; color: string; valueType?: 'currency' | 'percent' | 'number' }>;
      yType?: 'currency' | 'percent' | 'number';
    };

function formatAxisValue(value: number, type: 'currency' | 'percent' | 'number' = 'number'): string {
  if (!Number.isFinite(value)) return '—';
  if (type === 'currency') {
    if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}B`;
    return `$${Math.round(value)}M`;
  }
  if (type === 'percent') return `${value.toFixed(0)}%`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function defaultCompsTickerAdjustment(): CompsTickerAdjustment {
  return {
    revenueShiftPct: 0,
    ebitdaShiftPct: 0,
    priceShiftPct: 0,
    sharesShiftPct: 0,
  };
}

function buildCompsTickerAdjustmentState(
  subject: Record<string, unknown> | null,
  peers: Array<Record<string, unknown>>,
): Record<string, CompsTickerAdjustment> {
  const next: Record<string, CompsTickerAdjustment> = {};
  const rows = [subject, ...peers].filter((row): row is Record<string, unknown> => Boolean(row));

  for (const row of rows) {
    const ticker = typeof row.ticker === 'string' ? row.ticker : null;
    if (!ticker) continue;
    next[ticker] = defaultCompsTickerAdjustment();
  }

  return next;
}

function applyCompsTickerAdjustment(
  row: Record<string, unknown>,
  adjustment: CompsTickerAdjustment | undefined,
): Record<string, unknown> {
  if (!adjustment) return row;

  const revenue =
    typeof row.revenue === 'number'
      ? Number(row.revenue) * (1 + adjustment.revenueShiftPct / 100)
      : row.revenue;
  const ebitda =
    typeof row.ebitda === 'number'
      ? Number(row.ebitda) * (1 + adjustment.ebitdaShiftPct / 100)
      : row.ebitda;
  const price =
    typeof row.price === 'number'
      ? Number(row.price) * (1 + adjustment.priceShiftPct / 100)
      : row.price;
  const sharesOutstanding =
    typeof row.sharesOutstanding === 'number'
      ? Number(row.sharesOutstanding) * (1 + adjustment.sharesShiftPct / 100)
      : row.sharesOutstanding;
  const marketCap =
    typeof price === 'number' && typeof sharesOutstanding === 'number'
      ? (price * sharesOutstanding) / 1_000_000
      : row.marketCap;

  return {
    ...row,
    revenue,
    ebitda,
    price,
    sharesOutstanding,
    marketCap,
  };
}

function normalizeModelTypeForReport(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'three-statement';
    case 'CAP_TABLE':
      return 'cap-table';
    case 'SAAS_OPERATING_MODEL':
      return 'saas-operating-model';
    case 'COMPS':
      return 'comps';
    case 'PRECEDENTS':
      return 'precedents';
    case 'LBO':
      return 'lbo';
    case 'FOOTBALL_FIELD':
      return 'football-field';
    case 'MERGER':
      return 'merger';
    case 'DEBT_CAPACITY_LITE':
      return 'debt-capacity-lite';
    case 'REVERSE_DCF':
      return 'reverse-dcf';
    case 'SCORECARD':
      return 'scorecard';
    default:
      return String(modelType).toLowerCase().replace(/_/g, '-');
  }
}

function displayWorkspaceTitle(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'Forecast Model Workspace';
    case 'COMPS':
      return 'Trading Comparables Workspace';
    case 'FOOTBALL_FIELD':
      return 'Football Field Workspace';
    case 'LBO':
      return 'LBO Underwriting Workspace';
    default:
      return 'Model Template Workspace';
  }
}

function displayModelBadge(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'FORECAST MODEL';
    case 'COMPS':
      return 'TRADING COMPARABLES';
    case 'FOOTBALL_FIELD':
      return 'FOOTBALL FIELD';
    case 'LBO':
      return 'LBO UNDERWRITING';
    default:
      return modelType;
  }
}

function displayModelTitle(payload: AnalystGeneratedModelPayload): string {
  switch (payload.modelType) {
    case 'THREE_STATEMENT':
      return payload.title.replace(/Three-Statement Model/gi, 'Forecast Model');
    case 'COMPS':
      return payload.title.replace(/Comparable Company Analysis/gi, 'Trading Comparables');
    case 'FOOTBALL_FIELD':
      return payload.title.replace(/Football Field/gi, 'Valuation Football Field');
    case 'LBO':
      return payload.title.replace(/\bLBO\b/gi, 'LBO Underwriting');
    default:
      return payload.title;
  }
}

function defaultWorkbookFilename(payload: AnalystGeneratedModelPayload): string {
  switch (payload.modelType) {
    case 'THREE_STATEMENT':
      return 'forecast_model_analyst_chat.xlsx';
    case 'COMPS':
      return 'trading_comparables_analyst_chat.xlsx';
    case 'FOOTBALL_FIELD':
      return 'valuation_football_field_analyst_chat.xlsx';
    case 'LBO':
      return 'lbo_underwriting_analyst_chat.xlsx';
    default:
      return `${payload.modelType}_Analyst_Chat.xlsx`;
  }
}

function defaultReportFilename(payload: AnalystGeneratedModelPayload): string {
  switch (payload.modelType) {
    case 'THREE_STATEMENT':
      return 'forecast_model_capitalbase_report.pdf';
    case 'COMPS':
      return 'trading_comparables_capitalbase_report.pdf';
    case 'FOOTBALL_FIELD':
      return 'valuation_football_field_capitalbase_report.pdf';
    case 'LBO':
      return 'lbo_underwriting_capitalbase_report.pdf';
    default:
      return `${payload.modelType.toLowerCase()}_capitalbase_report.pdf`;
  }
}

function artifactTypeNote(modelType: AnalystGeneratedModelPayload['modelType']): string | null {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'Artifact type: Forecast model.';
    case 'COMPS':
      return 'Artifact type: Trading comparables.';
    case 'FOOTBALL_FIELD':
      return 'Artifact type: Valuation football field.';
    case 'LBO':
      return 'Artifact type: LBO underwriting.';
    default:
      return null;
  }
}

function pdfActionLabel(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'Download Forecast PDF';
    case 'COMPS':
      return 'Download Comps PDF';
    case 'FOOTBALL_FIELD':
      return 'Download Football Field PDF';
    case 'LBO':
      return 'Download LBO PDF';
    default:
      return 'Download PDF Report';
  }
}

function excelActionLabel(modelType: AnalystGeneratedModelPayload['modelType']): string {
  switch (modelType) {
    case 'THREE_STATEMENT':
      return 'Download Forecast Excel';
    case 'COMPS':
      return 'Download Comps Excel';
    case 'FOOTBALL_FIELD':
      return 'Download Football Field Excel';
    case 'LBO':
      return 'Download LBO Excel';
    default:
      return 'Download Excel';
  }
}

function inferChartSpec(payload: AnalystGeneratedModelPayload): ChartSpec | null {
  const inputs = payload.extractedInputs as Record<string, unknown>;

  if (payload.modelType === 'THREE_STATEMENT') {
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    const grossMargin = typeof inputs.grossMargin === 'number' ? Number(inputs.grossMargin) * 100 : null;
    const opexPctRevenue = typeof inputs.opexPctRevenue === 'number' ? Number(inputs.opexPctRevenue) * 100 : null;
    const years = Array.from({ length: revenueGrowth.length }, (_, idx) => `Y${idx + 1}`);
    if (years.length > 0) {
      return {
        kind: 'line',
        title: 'Forecast Assumption Paths',
        data: years.map((year, index) => ({
          year,
          revenueGrowth: typeof revenueGrowth[index] === 'number' ? Number(revenueGrowth[index]) * 100 : 0,
          grossMargin: grossMargin ?? 0,
          opexPctRevenue: opexPctRevenue ?? 0,
        })),
        lines: [
          { key: 'revenueGrowth', label: 'Revenue Growth', color: '#2563eb', valueType: 'percent' },
          { key: 'grossMargin', label: 'Gross Margin', color: '#16a34a', valueType: 'percent' },
          { key: 'opexPctRevenue', label: 'Opex % Revenue', color: '#f59e0b', valueType: 'percent' },
        ],
        yType: 'percent',
      };
    }
  }

  if (payload.modelType === 'COMPS') {
    const subject = inputs.subject && typeof inputs.subject === 'object' ? (inputs.subject as Record<string, unknown>) : null;
    const peers = Array.isArray(inputs.peers) ? (inputs.peers as Array<Record<string, unknown>>) : [];
    const median = (values: number[]) => {
      if (values.length === 0) return null;
      const sorted = [...values].sort((left, right) => left - right);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    const peerMedianEvRevenue = median(
      peers
        .map((peer) =>
          Number(
            peer.evToRevenue ??
              (peer.enterpriseValue && peer.revenue ? Number(peer.enterpriseValue) / Number(peer.revenue) : NaN),
          ),
        )
        .filter(Number.isFinite),
    );
    const peerMedianEvEbitda = median(
      peers
        .map((peer) =>
          Number(
            peer.evToEbitda ??
              (peer.enterpriseValue && peer.ebitda ? Number(peer.enterpriseValue) / Number(peer.ebitda) : NaN),
          ),
        )
        .filter(Number.isFinite),
    );
    const peerMedianPe = median(
      peers
        .map((peer) =>
          Number(
            peer.peRatio ?? (peer.marketCap && peer.netIncome ? Number(peer.marketCap) / Number(peer.netIncome) : NaN),
          ),
        )
        .filter(Number.isFinite),
    );
    const selectedMultiples =
      inputs.selectedMultiples && typeof inputs.selectedMultiples === 'object'
        ? (inputs.selectedMultiples as Record<string, unknown>)
        : null;
    const selectedEvRevenue =
      typeof selectedMultiples?.evToRevenue === 'number' ? Number(selectedMultiples.evToRevenue) : peerMedianEvRevenue;
    const selectedEvEbitda =
      typeof selectedMultiples?.evToEbitda === 'number' ? Number(selectedMultiples.evToEbitda) : peerMedianEvEbitda;
    const selectedPe = typeof selectedMultiples?.peRatio === 'number' ? Number(selectedMultiples.peRatio) : peerMedianPe;
    if (subject && (selectedEvRevenue !== null || selectedEvEbitda !== null || selectedPe !== null)) {
      const data = [
        {
          label: 'EV / Revenue',
          selected: selectedEvRevenue ?? 0,
          peerMedian: peerMedianEvRevenue ?? 0,
        },
        {
          label: 'EV / EBITDA',
          selected: selectedEvEbitda ?? 0,
          peerMedian: peerMedianEvEbitda ?? 0,
        },
        {
          label: 'P / E',
          selected: selectedPe ?? 0,
          peerMedian: peerMedianPe ?? 0,
        },
      ];
      return {
        kind: 'bar',
        title: 'Selected vs Peer Median Multiples',
        data,
        bars: [
          { key: 'selected', label: 'Selected', color: '#2563eb', valueType: 'number' },
          { key: 'peerMedian', label: 'Peer Median', color: '#16a34a', valueType: 'number' },
        ],
        yType: 'number',
      };
    }
  }

  if (payload.modelType === 'PRECEDENTS') {
    const transactions = Array.isArray(inputs.transactions) ? (inputs.transactions as Array<Record<string, unknown>>) : [];
    if (transactions.length > 0) {
      const data = transactions.slice(0, 8).map((transaction) => ({
        label: String(transaction.target ?? transaction.transaction ?? 'Deal'),
        revenueMultiple: typeof transaction.revenueMultiple === 'number' ? Number(transaction.revenueMultiple) : 0,
        ebitdaMultiple: typeof transaction.ebitdaMultiple === 'number' ? Number(transaction.ebitdaMultiple) : 0,
      }));
      return {
        kind: 'bar',
        title: 'Transaction Multiples',
        data,
        bars: [
          { key: 'revenueMultiple', label: 'EV / Revenue', color: '#2563eb', valueType: 'number' },
          { key: 'ebitdaMultiple', label: 'EV / EBITDA', color: '#f59e0b', valueType: 'number' },
        ],
        yType: 'number',
      };
    }
  }

  if (payload.modelType === 'LBO') {
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    if (revenueGrowth.length > 0) {
      return {
        kind: 'line',
        title: 'Underwriting Growth Path',
        data: revenueGrowth.map((value, index) => ({
          year: `Y${index + 1}`,
          revenueGrowth: typeof value === 'number' ? Number(value) * 100 : 0,
        })),
        lines: [{ key: 'revenueGrowth', label: 'Revenue Growth', color: '#2563eb', valueType: 'percent' }],
        yType: 'percent',
      };
    }
  }

  if (payload.modelType === 'CAP_TABLE') {
    const founderShares = typeof inputs.founderShares === 'number' ? Number(inputs.founderShares) : null;
    const raiseAmount = typeof inputs.raiseAmount === 'number' ? Number(inputs.raiseAmount) : null;
    const preMoney = typeof inputs.preMoney === 'number' ? Number(inputs.preMoney) : null;
    if (founderShares !== null || raiseAmount !== null || preMoney !== null) {
      return {
        kind: 'bar',
        title: 'Financing Structure Snapshot',
        data: [
          {
            label: 'Round',
            founderShares: founderShares ?? 0,
            raiseAmount: raiseAmount ?? 0,
            preMoney: preMoney ?? 0,
          },
        ],
        bars: [
          { key: 'founderShares', label: 'Founder Shares', color: '#2563eb', valueType: 'number' },
          { key: 'raiseAmount', label: 'Raise Amount', color: '#16a34a', valueType: 'currency' },
          { key: 'preMoney', label: 'Pre-Money', color: '#f59e0b', valueType: 'currency' },
        ],
        yType: 'number',
      };
    }
  }

  if (payload.modelType === 'SAAS_OPERATING_MODEL') {
    const growthRate = typeof inputs.growthRate === 'number' ? Number(inputs.growthRate) * 100 : null;
    const grossMargin = typeof inputs.grossMargin === 'number' ? Number(inputs.grossMargin) * 100 : null;
    const churn = typeof inputs.churn === 'number' ? Number(inputs.churn) * 100 : null;
    const cac = typeof inputs.cac === 'number' ? Number(inputs.cac) : null;
    const arpu = typeof inputs.arpu === 'number' ? Number(inputs.arpu) : null;
    const data = [
      { label: 'Growth', value: growthRate ?? 0 },
      { label: 'Gross Margin', value: grossMargin ?? 0 },
      { label: 'Churn', value: churn ?? 0 },
      { label: 'CAC', value: cac ?? 0 },
      { label: 'ARPU', value: arpu ?? 0 },
    ];
    if (data.some((row) => row.value > 0)) {
      return {
        kind: 'bar',
        title: 'Operating Driver Snapshot',
        data,
        bars: [{ key: 'value', label: 'Value', color: '#2563eb', valueType: 'number' }],
        yType: 'number',
      };
    }
  }

  return null;
}

function ModelVisualization({ spec }: { spec: ChartSpec }) {
  const plotData =
    spec.kind === 'line'
      ? spec.lines.map((line) => ({
          type: 'scatter',
          mode: 'lines+markers',
          name: line.label,
          x: spec.data.map((row) => String(row.year ?? row.label ?? '')),
          y: spec.data.map((row) => Number(row[line.key] ?? 0)),
          line: { color: line.color, width: 2.5, shape: 'spline' },
          marker: { color: line.color, size: 6 },
          hovertemplate: `%{x}<br>${line.label}: %{y}${line.valueType === 'percent' ? '%' : line.valueType === 'currency' ? 'M' : ''}<extra></extra>`,
        }))
      : spec.bars.map((bar) => ({
          type: 'bar',
          name: bar.label,
          x: spec.data.map((row) => String(row.label ?? row.year ?? '')),
          y: spec.data.map((row) => Number(row[bar.key] ?? 0)),
          marker: { color: bar.color, opacity: 0.9 },
          hovertemplate: `%{x}<br>${bar.label}: %{y}${bar.valueType === 'percent' ? '%' : bar.valueType === 'currency' ? 'M' : bar.valueType === 'number' ? 'x' : ''}<extra></extra>`,
        }));

  const yAxisLayout =
    spec.yType === 'currency'
      ? { tickprefix: '$', ticksuffix: 'M' }
      : spec.yType === 'percent'
        ? { ticksuffix: '%' }
        : {};

  return (
    <EditableFinanceChart
      title={spec.title}
      subtitle="Editable chart: zoom, relabel, and annotate directly."
      height={256}
      data={plotData}
      layout={{
        barmode: spec.kind === 'bar' ? 'group' : undefined,
        xaxis: {
          title: '',
          type: 'category',
        },
        yaxis: {
          title: '',
          ...yAxisLayout,
        },
      }}
    />
  );
}

export function AnalystModelCard({
  payload,
  onAdjust,
}: {
  payload: AnalystGeneratedModelPayload;
  onAdjust?: (adjustment: AnalystStructuredModelAdjustment) => Promise<void>;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(payload.modelType !== 'COMPS');
  const [isApplyingControls, setIsApplyingControls] = useState(false);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [isApplyingEventShock, setIsApplyingEventShock] = useState(false);
  const chartSpec = inferChartSpec(payload);
  const threeStatementInputs =
    payload.modelType === 'THREE_STATEMENT' ? (payload.extractedInputs as Record<string, unknown>) : null;
  const compsInputs =
    payload.modelType === 'COMPS' ? (payload.extractedInputs as Record<string, unknown>) : null;
  const compsSubject =
    payload.modelType === 'COMPS' && compsInputs?.subject && typeof compsInputs.subject === 'object'
      ? (compsInputs.subject as Record<string, unknown>)
      : null;
  const compsPeers = useMemo(
    () =>
      payload.modelType === 'COMPS' && Array.isArray(compsInputs?.peers)
        ? (compsInputs.peers as Array<Record<string, unknown>>)
        : [],
    [payload.modelType, compsInputs],
  );
  const [revenueGrowthShiftBps, setRevenueGrowthShiftBps] = useState(0);
  const [grossMarginPct, setGrossMarginPct] = useState(
    payload.modelType === 'THREE_STATEMENT' && typeof threeStatementInputs?.grossMargin === 'number'
      ? Number(threeStatementInputs.grossMargin) * 100
      : 0,
  );
  const [opexPct, setOpexPct] = useState(
    payload.modelType === 'THREE_STATEMENT' && typeof threeStatementInputs?.opexPctRevenue === 'number'
      ? Number(threeStatementInputs.opexPctRevenue) * 100
      : 0,
  );
  const [taxRatePct, setTaxRatePct] = useState(
    payload.modelType === 'THREE_STATEMENT' && typeof threeStatementInputs?.taxRate === 'number'
      ? Number(threeStatementInputs.taxRate) * 100
      : 0,
  );
  const [compsTickerAdjustments, setCompsTickerAdjustments] = useState<Record<string, CompsTickerAdjustment>>({});
  const [compsAddPeers, setCompsAddPeers] = useState('');
  const [compsRemovePeers, setCompsRemovePeers] = useState('');
  const [compsEvRevenueMultiple, setCompsEvRevenueMultiple] = useState(0);
  const [compsEvEbitdaMultiple, setCompsEvEbitdaMultiple] = useState(0);
  const [compsPeMultiple, setCompsPeMultiple] = useState(0);
  const threeStatementEventPresets = [
    { label: 'CEO Retires', prompt: 'If the CEO retires, stress this model' },
    { label: 'Rates Stay Higher', prompt: 'What if rates stay higher for longer on this model' },
    { label: 'Oil Shock', prompt: 'Show me the impact of an oil shock on this model' },
    { label: 'Tariff Shock', prompt: 'Stress this model for tariffs going up' },
  ] as const;

  useEffect(() => {
    if (payload.modelType !== 'THREE_STATEMENT') return;
    const inputs = payload.extractedInputs as Record<string, unknown>;
    setRevenueGrowthShiftBps(0);
    setGrossMarginPct(typeof inputs.grossMargin === 'number' ? Number(inputs.grossMargin) * 100 : 0);
    setOpexPct(typeof inputs.opexPctRevenue === 'number' ? Number(inputs.opexPctRevenue) * 100 : 0);
    setTaxRatePct(typeof inputs.taxRate === 'number' ? Number(inputs.taxRate) * 100 : 0);
    setControlsError(null);
  }, [payload]);

  const adjustedThreeStatementRevenueGrowth = useMemo(() => {
    if (payload.modelType !== 'THREE_STATEMENT') return [];
    const inputs = payload.extractedInputs as Record<string, unknown>;
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    return revenueGrowth.map((value) =>
      Math.min(0.3, Math.max(-0.05, Number(value) + revenueGrowthShiftBps / 10000)),
    );
  }, [payload, revenueGrowthShiftBps]);

  const hasThreeStatementControlChanges =
    payload.modelType === 'THREE_STATEMENT' &&
    (revenueGrowthShiftBps !== 0 ||
      Math.abs(grossMarginPct - ((Number(threeStatementInputs?.grossMargin ?? 0)) * 100)) > 0.001 ||
      Math.abs(opexPct - ((Number(threeStatementInputs?.opexPctRevenue ?? 0)) * 100)) > 0.001 ||
      Math.abs(taxRatePct - ((Number(threeStatementInputs?.taxRate ?? 0)) * 100)) > 0.001);

  const adjustedCompsSubject = useMemo(() => {
    if (payload.modelType !== 'COMPS' || !compsSubject) return null;
    const ticker = typeof compsSubject.ticker === 'string' ? compsSubject.ticker : '';
    return applyCompsTickerAdjustment(compsSubject, compsTickerAdjustments[ticker]);
  }, [payload, compsSubject, compsTickerAdjustments]);

  const adjustedCompsPeers = useMemo(() => {
    if (payload.modelType !== 'COMPS') return [];
    return compsPeers.map((peer) => {
      const ticker = typeof peer.ticker === 'string' ? peer.ticker : '';
      return applyCompsTickerAdjustment(peer, compsTickerAdjustments[ticker]);
    });
  }, [payload, compsPeers, compsTickerAdjustments]);

  const compsMultipleBaselines = useMemo(() => {
    if (payload.modelType !== 'COMPS') {
      return { evToRevenue: 0, evToEbitda: 0, peRatio: 0 };
    }
    const peers = Array.isArray(compsInputs?.peers) ? (compsInputs.peers as Array<Record<string, unknown>>) : [];
    const median = (values: number[]) => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((left, right) => left - right);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    const multipleValues = {
      evToRevenue: peers
        .map((peer) =>
          Number(
            peer.evToRevenue ??
              (peer.enterpriseValue && peer.revenue ? Number(peer.enterpriseValue) / Number(peer.revenue) : NaN),
          ),
        )
        .filter(Number.isFinite),
      evToEbitda: peers
        .map((peer) =>
          Number(
            peer.evToEbitda ??
              (peer.enterpriseValue && peer.ebitda ? Number(peer.enterpriseValue) / Number(peer.ebitda) : NaN),
          ),
        )
        .filter(Number.isFinite),
      peRatio: peers
        .map((peer) =>
          Number(
            peer.peRatio ?? (peer.marketCap && peer.netIncome ? Number(peer.marketCap) / Number(peer.netIncome) : NaN),
          ),
        )
        .filter(Number.isFinite),
    };
    const selectedMultiples =
      compsInputs?.selectedMultiples && typeof compsInputs.selectedMultiples === 'object'
        ? (compsInputs.selectedMultiples as Record<string, unknown>)
        : null;
    return {
      evToRevenue:
        typeof selectedMultiples?.evToRevenue === 'number'
          ? Number(selectedMultiples.evToRevenue)
          : median(multipleValues.evToRevenue),
      evToEbitda:
        typeof selectedMultiples?.evToEbitda === 'number'
          ? Number(selectedMultiples.evToEbitda)
          : median(multipleValues.evToEbitda),
      peRatio:
        typeof selectedMultiples?.peRatio === 'number'
          ? Number(selectedMultiples.peRatio)
          : median(multipleValues.peRatio),
    };
  }, [payload, compsInputs]);

  useEffect(() => {
    if (payload.modelType !== 'COMPS') return;
    setShowControls(false);
    setCompsTickerAdjustments(buildCompsTickerAdjustmentState(compsSubject, compsPeers));
    setCompsAddPeers('');
    setCompsRemovePeers('');
    setCompsEvRevenueMultiple(compsMultipleBaselines.evToRevenue);
    setCompsEvEbitdaMultiple(compsMultipleBaselines.evToEbitda);
    setCompsPeMultiple(compsMultipleBaselines.peRatio);
    setControlsError(null);
  }, [payload, compsMultipleBaselines, compsSubject, compsPeers]);

  const hasCompsControlChanges =
    payload.modelType === 'COMPS' &&
    (Object.values(compsTickerAdjustments).some((adjustment) =>
      adjustment.revenueShiftPct !== 0 ||
      adjustment.ebitdaShiftPct !== 0 ||
      adjustment.priceShiftPct !== 0 ||
      adjustment.sharesShiftPct !== 0
    ) ||
      compsAddPeers.trim().length > 0 ||
      compsRemovePeers.trim().length > 0 ||
      Math.abs(compsEvRevenueMultiple - compsMultipleBaselines.evToRevenue) > 0.0001 ||
      Math.abs(compsEvEbitdaMultiple - compsMultipleBaselines.evToEbitda) > 0.0001 ||
      Math.abs(compsPeMultiple - compsMultipleBaselines.peRatio) > 0.0001);

  function updateCompsTickerAdjustment(
    ticker: string,
    patch: Partial<CompsTickerAdjustment>,
  ) {
    setCompsTickerAdjustments((current) => ({
      ...current,
      [ticker]: {
        ...(current[ticker] ?? defaultCompsTickerAdjustment()),
        ...patch,
      },
    }));
  }

  async function handleDownload() {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch('/api/analyst-chat/model-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: JSON.stringify({
          payload,
        }),
      });

      if (!response.ok) {
        const maybeJson = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(maybeJson?.error || 'Failed to export model workbook.');
      }

      const blob = await response.blob();
      const filenameMatch = response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || defaultWorkbookFilename(payload);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download workbook.');
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleGenerateReport() {
    if (isGeneratingReport) return;
    setIsGeneratingReport(true);
    setReportError(null);

    try {
      const response = await fetch('/api/generateReport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker:
            typeof (payload.extractedInputs as Record<string, unknown>).ticker === 'string'
              ? (payload.extractedInputs as Record<string, unknown>).ticker
              : undefined,
          companyName:
            typeof (payload.extractedInputs as Record<string, unknown>).companyName === 'string'
              ? (payload.extractedInputs as Record<string, unknown>).companyName
              : payload.title,
          asOfDate: payload.provenanceSummary.asOfDate,
          modelType: normalizeModelTypeForReport(payload.modelType),
          modelData: {
            extractedInputs: payload.extractedInputs,
            defaultsUsed: payload.defaultsUsed,
            narrativeBlocks: payload.narrativeBlocks,
            provenanceSummary: payload.provenanceSummary,
            comparisonSummary: payload.comparisonSummary,
            scenarioContext: payload.scenarioContext,
          },
          reportInput: {
            scenarioContext: payload.scenarioContext ?? undefined,
            highLevelNotes: [
              artifactTypeNote(payload.modelType),
              payload.scenarioContext ? `Scenario context: ${payload.scenarioContext}` : null,
              `Prompt run: ${payload.prompt}`,
              payload.narrativeBlocks.map((block) => `${block.title}: ${block.body}`).join(' '),
            ]
              .filter((item): item is string => Boolean(item))
              .join(' '),
          },
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Failed to generate PDF report.');
      }

      const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : null;
      if (!pdfBase64) {
        throw new Error('Report generated but PDF output was missing.');
      }

      const binary = atob(pdfBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = defaultReportFilename(payload);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Unable to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleApplyThreeStatementControls() {
    if (!onAdjust || payload.modelType !== 'THREE_STATEMENT' || isApplyingControls || !hasThreeStatementControlChanges) return;
    setIsApplyingControls(true);
    setControlsError(null);
    try {
      await onAdjust({
        changes: {
          revenueGrowth: adjustedThreeStatementRevenueGrowth,
          grossMargin: grossMarginPct / 100,
          opexPctRevenue: opexPct / 100,
          taxRate: taxRatePct / 100,
        },
      });
    } catch (error) {
      setControlsError(error instanceof Error ? error.message : 'Unable to apply model controls.');
    } finally {
      setIsApplyingControls(false);
    }
  }

  async function handleApplyThreeStatementEventShock(prompt: string) {
    if (!onAdjust || payload.modelType !== 'THREE_STATEMENT' || isApplyingControls || isApplyingEventShock) return;
    setIsApplyingEventShock(true);
    setControlsError(null);
    try {
      await onAdjust({
        changes: {},
        prompt,
      });
    } catch (error) {
      setControlsError(error instanceof Error ? error.message : 'Unable to apply event shock.');
    } finally {
      setIsApplyingEventShock(false);
    }
  }

  async function handleApplyCompsControls() {
    if (!onAdjust || payload.modelType !== 'COMPS' || isApplyingControls || !hasCompsControlChanges || !adjustedCompsSubject) return;
    setIsApplyingControls(true);
    setControlsError(null);
    try {
      const peerPrompt = [
        compsAddPeers.trim().length > 0 ? `add ${compsAddPeers.trim()} to peers` : null,
        compsRemovePeers.trim().length > 0 ? `remove ${compsRemovePeers.trim()} from peers` : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join('. ');
      await onAdjust({
        changes: {
          subject: adjustedCompsSubject,
          peers: adjustedCompsPeers,
          selectedMultiples: {
            evToRevenue: compsEvRevenueMultiple,
            evToEbitda: compsEvEbitdaMultiple,
            peRatio: compsPeMultiple,
          },
        },
        prompt: peerPrompt || undefined,
      });
    } catch (error) {
      setControlsError(error instanceof Error ? error.message : 'Unable to apply comps controls.');
    } finally {
      setIsApplyingControls(false);
    }
  }

  function handleResetThreeStatementControls() {
    if (payload.modelType !== 'THREE_STATEMENT') return;
    const inputs = payload.extractedInputs as Record<string, unknown>;
    setRevenueGrowthShiftBps(0);
    setGrossMarginPct(typeof inputs.grossMargin === 'number' ? Number(inputs.grossMargin) * 100 : 0);
    setOpexPct(typeof inputs.opexPctRevenue === 'number' ? Number(inputs.opexPctRevenue) * 100 : 0);
    setTaxRatePct(typeof inputs.taxRate === 'number' ? Number(inputs.taxRate) * 100 : 0);
    setControlsError(null);
  }

  function handleResetCompsControls() {
    if (payload.modelType !== 'COMPS') return;
    setCompsTickerAdjustments(buildCompsTickerAdjustmentState(compsSubject, compsPeers));
    setCompsAddPeers('');
    setCompsRemovePeers('');
    setCompsEvRevenueMultiple(compsMultipleBaselines.evToRevenue);
    setCompsEvEbitdaMultiple(compsMultipleBaselines.evToEbitda);
    setCompsPeMultiple(compsMultipleBaselines.peRatio);
    setControlsError(null);
  }

  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{displayWorkspaceTitle(payload.modelType)}</CardTitle>
            <CardDescription>{displayModelTitle(payload)}</CardDescription>
            {payload.modelType === 'COMPS' && payload.scenarioContext ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="outline">Scenario</Badge>
                <span className="text-xs text-[var(--cb-text-muted)]">{payload.scenarioContext}</span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{displayModelBadge(payload.modelType)}</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleGenerateReport()} disabled={isGeneratingReport}>
              {isGeneratingReport ? 'Generating PDF…' : pdfActionLabel(payload.modelType)}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()} disabled={isDownloading}>
              {isDownloading ? 'Preparing Excel…' : excelActionLabel(payload.modelType)}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {downloadError ? (
          <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
            {downloadError}
          </div>
        ) : null}
        {reportError ? (
          <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
            {reportError}
          </div>
        ) : null}

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Template Layout</div>
          <div className="flex flex-wrap gap-2">
            {payload.tabs.map((tab) => (
              <Badge key={tab} variant="outline" className="border-[var(--cb-border-subtle)] text-[var(--cb-text-secondary)]">
                {tab}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Decision Outputs</div>
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{payload.keyOutputs.join(', ')}</p>
        </div>

        {payload.modelType === 'THREE_STATEMENT' ? (
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Live Model Controls</div>
                <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
                  Edit the operating assumptions here, then apply the changes to rerender the active three-statement model.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowControls((value) => !value)}>
                  {showControls ? 'Hide Controls' : 'Show Controls'}
                </Button>
                {showControls ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleResetThreeStatementControls} disabled={isApplyingControls}>
                    Reset
                  </Button>
                ) : null}
              </div>
            </div>
            {showControls ? (
              <div className="mt-4 space-y-6">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label>Event Presets</Label>
                    <span className="text-xs text-[var(--cb-text-muted)]">Apply a deterministic operating shock</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {threeStatementEventPresets.map((preset) => (
                      <Button
                        key={preset.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleApplyThreeStatementEventShock(preset.prompt)}
                        disabled={!onAdjust || isApplyingControls || isApplyingEventShock}
                      >
                        {isApplyingEventShock ? 'Applying…' : preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label>Revenue Growth Shift</Label>
                    <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                      {revenueGrowthShiftBps > 0 ? '+' : ''}{(revenueGrowthShiftBps / 100).toFixed(1)}%
                    </span>
                  </div>
                  <Slider value={[revenueGrowthShiftBps]} onValueChange={([value]) => setRevenueGrowthShiftBps(value)} min={-500} max={500} step={25} className="mb-1" />
                  <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                    <span>-5.0%</span>
                    <span>{adjustedThreeStatementRevenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}</span>
                    <span>+5.0%</span>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>Gross Margin</Label>
                      <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{grossMarginPct.toFixed(1)}%</span>
                    </div>
                    <Slider value={[grossMarginPct]} onValueChange={([value]) => setGrossMarginPct(value)} min={20} max={90} step={0.5} className="mb-1" />
                    <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                      <span>20.0%</span>
                      <span>90.0%</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>Opex % Revenue</Label>
                      <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{opexPct.toFixed(1)}%</span>
                    </div>
                    <Slider value={[opexPct]} onValueChange={([value]) => setOpexPct(value)} min={5} max={70} step={0.5} className="mb-1" />
                    <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                      <span>5.0%</span>
                      <span>70.0%</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>Tax Rate</Label>
                      <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{taxRatePct.toFixed(1)}%</span>
                    </div>
                    <Slider value={[taxRatePct]} onValueChange={([value]) => setTaxRatePct(value)} min={5} max={35} step={0.5} className="mb-1" />
                    <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                      <span>5.0%</span>
                      <span>35.0%</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cb-border-subtle)] pt-4">
                  <div className="text-xs text-[var(--cb-text-muted)]">
                    Changes are staged locally while you edit. Apply them to update the current operating assumptions and
                    rerender the active model card.
                  </div>
                  <Button type="button" size="sm" onClick={() => void handleApplyThreeStatementControls()} disabled={!hasThreeStatementControlChanges || isApplyingControls}>
                    {isApplyingControls ? 'Applying…' : 'Apply Changes'}
                  </Button>
                </div>
                {controlsError ? (
                  <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
                    {controlsError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {payload.modelType === 'COMPS' ? (
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Live Comps Controls</div>
                <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
                  Controls start collapsed. Open them to adjust the subject and each peer directly, then apply the changes to rerender the active comps view.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowControls((value) => !value)}>
                  {showControls ? 'Hide Controls' : 'Show Controls'}
                </Button>
                {showControls ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleResetCompsControls} disabled={isApplyingControls}>
                    Reset
                  </Button>
                ) : null}
              </div>
            </div>
            {showControls ? (
              <div className="mt-4 space-y-6">
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Per-Ticker Controls</div>
                  <div className="grid gap-4">
                    {[adjustedCompsSubject, ...adjustedCompsPeers]
                      .filter((row): row is Record<string, unknown> => Boolean(row))
                      .map((row) => {
                        const ticker = typeof row.ticker === 'string' ? row.ticker : 'TICKER';
                        const name = typeof row.name === 'string' ? row.name : ticker;
                        const adjustment = compsTickerAdjustments[ticker] ?? defaultCompsTickerAdjustment();
                        const isSubject = ticker === (typeof adjustedCompsSubject?.ticker === 'string' ? adjustedCompsSubject.ticker : null);

                        return (
                          <div key={ticker} className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-4">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-[var(--cb-text-primary)]">{name}</div>
                                <div className="text-xs text-[var(--cb-text-muted)]">
                                  {ticker}{isSubject ? ' • Subject' : ' • Peer'}
                                </div>
                              </div>
                            </div>
                            <div className="grid gap-6 md:grid-cols-2">
                              <div>
                                <div className="mb-2 flex items-center justify-between">
                                  <Label>Revenue Shift</Label>
                                  <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                                    {adjustment.revenueShiftPct > 0 ? '+' : ''}{adjustment.revenueShiftPct.toFixed(0)}%
                                  </span>
                                </div>
                                <Slider value={[adjustment.revenueShiftPct]} onValueChange={([value]) => updateCompsTickerAdjustment(ticker, { revenueShiftPct: value })} min={-50} max={50} step={1} className="mb-1" />
                                <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                                  <span>-50%</span>
                                  <span>+50%</span>
                                </div>
                              </div>
                              <div>
                                <div className="mb-2 flex items-center justify-between">
                                  <Label>EBITDA Shift</Label>
                                  <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                                    {adjustment.ebitdaShiftPct > 0 ? '+' : ''}{adjustment.ebitdaShiftPct.toFixed(0)}%
                                  </span>
                                </div>
                                <Slider value={[adjustment.ebitdaShiftPct]} onValueChange={([value]) => updateCompsTickerAdjustment(ticker, { ebitdaShiftPct: value })} min={-50} max={50} step={1} className="mb-1" />
                                <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                                  <span>-50%</span>
                                  <span>+50%</span>
                                </div>
                              </div>
                              <div>
                                <div className="mb-2 flex items-center justify-between">
                                  <Label>Share Price Shift</Label>
                                  <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                                    {adjustment.priceShiftPct > 0 ? '+' : ''}{adjustment.priceShiftPct.toFixed(0)}%
                                  </span>
                                </div>
                                <Slider value={[adjustment.priceShiftPct]} onValueChange={([value]) => updateCompsTickerAdjustment(ticker, { priceShiftPct: value })} min={-40} max={40} step={1} className="mb-1" />
                                <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                                  <span>-40%</span>
                                  <span>+40%</span>
                                </div>
                              </div>
                              <div>
                                <div className="mb-2 flex items-center justify-between">
                                  <Label>Shares Outstanding Shift</Label>
                                  <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                                    {adjustment.sharesShiftPct > 0 ? '+' : ''}{adjustment.sharesShiftPct.toFixed(0)}%
                                  </span>
                                </div>
                                <Slider value={[adjustment.sharesShiftPct]} onValueChange={([value]) => updateCompsTickerAdjustment(ticker, { sharesShiftPct: value })} min={-20} max={20} step={1} className="mb-1" />
                                <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                                  <span>-20%</span>
                                  <span>+20%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-3">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>EV / Revenue</Label>
                      <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{compsEvRevenueMultiple.toFixed(1)}x</span>
                    </div>
                    <Slider value={[compsEvRevenueMultiple]} onValueChange={([value]) => setCompsEvRevenueMultiple(value)} min={1} max={25} step={0.1} className="mb-1" />
                    <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                      <span>1.0x</span>
                      <span>25.0x</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>EV / EBITDA</Label>
                      <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{compsEvEbitdaMultiple.toFixed(1)}x</span>
                    </div>
                    <Slider value={[compsEvEbitdaMultiple]} onValueChange={([value]) => setCompsEvEbitdaMultiple(value)} min={1} max={50} step={0.1} className="mb-1" />
                    <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                      <span>1.0x</span>
                      <span>50.0x</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>P / E</Label>
                      <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{compsPeMultiple.toFixed(1)}x</span>
                    </div>
                    <Slider value={[compsPeMultiple]} onValueChange={([value]) => setCompsPeMultiple(value)} min={1} max={80} step={0.1} className="mb-1" />
                    <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                      <span>1.0x</span>
                      <span>80.0x</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>Add Peers</Label>
                      <span className="text-xs text-[var(--cb-text-muted)]">Tickers or company names</span>
                    </div>
                    <Input
                      value={compsAddPeers}
                      onChange={(event) => setCompsAddPeers(event.target.value)}
                      placeholder="NOW, WDAY"
                      className="h-10"
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label>Remove Peers</Label>
                      <span className="text-xs text-[var(--cb-text-muted)]">Tickers or company names</span>
                    </div>
                    <Input
                      value={compsRemovePeers}
                      onChange={(event) => setCompsRemovePeers(event.target.value)}
                      placeholder="SNOW"
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cb-border-subtle)] pt-4">
                  <div className="text-xs text-[var(--cb-text-muted)]">
                    Changes are staged locally while you edit. Apply them to update the subject snapshot, adjust the peer
                    set, and rerender implied valuation on the active comps model.
                  </div>
                  <Button type="button" size="sm" onClick={() => void handleApplyCompsControls()} disabled={!hasCompsControlChanges || isApplyingControls}>
                    {isApplyingControls ? 'Applying…' : 'Apply Changes'}
                  </Button>
                </div>
                {controlsError ? (
                  <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
                    {controlsError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {chartSpec ? <ModelVisualization spec={chartSpec} /> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Source Provenance</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Source Type</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{payload.provenanceSummary.sourceType}</div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">As Of</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{payload.provenanceSummary.asOfDate ?? 'n/a'}</div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3 md:col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Sources</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                  {payload.provenanceSummary.sources.join(', ') || 'n/a'}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3 md:col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Fallback Used</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                  {payload.provenanceSummary.fallbackUsed.join(', ') || 'None'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Version Context</div>
            <div className="grid gap-3">
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Previous Run</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                  {payload.recentRun ? `Version ${payload.recentRun.versionNumber ?? 'n/a'} • ${payload.recentRun.status}` : 'No prior analyst chat run'}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Assumption Changes</div>
                <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">
                  {payload.comparisonSummary?.changedKeys.length
                    ? payload.comparisonSummary.changedKeys.join(', ')
                    : 'No tracked changes versus prior saved version'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ObjectGrid title="Extracted Inputs" values={payload.extractedInputs as Record<string, unknown>} emptyMessage="No structured inputs were extracted." />
          <ObjectGrid title="Defaults Used" values={payload.defaultsUsed} emptyMessage="No defaults were required." />
        </div>

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Analyst Framing</div>
          <div className="space-y-3">
            {payload.narrativeBlocks.map((block) => (
              <div key={block.title} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">{block.title}</div>
                <div className="mt-2 text-sm leading-6 text-[var(--cb-text-primary)]">{block.body}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
