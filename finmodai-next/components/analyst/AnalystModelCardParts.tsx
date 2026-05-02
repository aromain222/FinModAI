'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { EditableFinanceChart } from '@/components/charts/EditableFinanceChart';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/types';
import type { CustomAssumptionResult } from '@/lib/analyst/customAssumptions';

export type CompsTickerAdjustment = {
  revenueShiftPct: number;
  ebitdaShiftPct: number;
  priceShiftPct: number;
  sharesShiftPct: number;
};

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

export function defaultCompsTickerAdjustment(): CompsTickerAdjustment {
  return {
    revenueShiftPct: 0,
    ebitdaShiftPct: 0,
    priceShiftPct: 0,
    sharesShiftPct: 0,
  };
}

export function buildCompsTickerAdjustmentState(
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

export function applyCompsTickerAdjustment(
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

  if (payload.modelType === 'DCF') {
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    const ebitMargin = Array.isArray(inputs.ebitMargin) ? inputs.ebitMargin : [];
    const years = Array.from({ length: Math.max(revenueGrowth.length, ebitMargin.length) }, (_, idx) => `Y${idx + 1}`);
    if (years.length > 0) {
      return {
        kind: 'line',
        title: 'DCF Assumption Path',
        data: years.map((year, index) => ({
          year,
          revenueGrowth: typeof revenueGrowth[index] === 'number' ? Number(revenueGrowth[index]) * 100 : 0,
          ebitMargin: typeof ebitMargin[index] === 'number' ? Number(ebitMargin[index]) * 100 : 0,
        })),
        lines: [
          { key: 'revenueGrowth', label: 'Revenue Growth', color: '#38bdf8', valueType: 'percent' },
          { key: 'ebitMargin', label: 'EBIT Margin', color: '#a78bfa', valueType: 'percent' },
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
        { label: 'EV / Revenue', selected: selectedEvRevenue ?? 0, peerMedian: peerMedianEvRevenue ?? 0 },
        { label: 'EV / EBITDA', selected: selectedEvEbitda ?? 0, peerMedian: peerMedianEvEbitda ?? 0 },
        { label: 'P / E', selected: selectedPe ?? 0, peerMedian: peerMedianPe ?? 0 },
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
        data: [{ label: 'Round', founderShares: founderShares ?? 0, raiseAmount: raiseAmount ?? 0, preMoney: preMoney ?? 0 }],
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

export function AnalystModelVisualization({ payload }: { payload: AnalystGeneratedModelPayload }) {
  const spec = inferChartSpec(payload);
  if (!spec) return null;

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
        xaxis: { title: '', type: 'category' },
        yaxis: { title: '', ...yAxisLayout },
      }}
    />
  );
}

export function AnalystEventSummaryCard({
  payload,
  onAdjustFromEvent,
}: {
  payload: AnalystGeneratedModelPayload;
  onAdjustFromEvent?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Event-Linked Assumptions</div>
          <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
            Use the quick event strip below the chat composer to revise the active model from a headline, catalyst, or market event.
          </div>
          <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
            Best for catalyst-driven changes to growth, margin, WACC, or terminal growth.
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdjustFromEvent} disabled={!onAdjustFromEvent}>
          Adjust from event
        </Button>
      </div>
      {payload.eventAdjustmentSummary ? (
        <div className="mt-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{payload.eventAdjustmentSummary.eventCategory.replace(/_/g, ' ')}</Badge>
            <Badge variant="outline">{payload.eventAdjustmentSummary.confidence}</Badge>
            <Badge variant="outline">{payload.eventAdjustmentSummary.scenarioBias}</Badge>
          </div>
          <p className="mt-2 text-[var(--cb-text-primary)]">{payload.eventAdjustmentSummary.normalizedEventSummary}</p>
          {payload.eventAdjustmentSummary.transcription?.suggestedAssumptions?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {payload.eventAdjustmentSummary.transcription.suggestedAssumptions.slice(0, 3).map((suggestion) => (
                <Badge key={suggestion.driver} variant="outline">
                  {suggestion.label} {suggestion.direction === 'up' ? '↑' : suggestion.direction === 'down' ? '↓' : '→'}
                </Badge>
              ))}
            </div>
          ) : null}
          {payload.appliedEventDeltas?.length ? (
            <p className="mt-2 text-[var(--cb-text-muted)]">
              Applied changes: {payload.appliedEventDeltas.map((delta) => delta.label).join(', ')}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AnalystSmartAssumptionSummaryCard({
  payload,
}: {
  payload: AnalystGeneratedModelPayload;
}) {
  if (!payload.smartAssumptionSummary) return null;
  const summary = payload.smartAssumptionSummary;

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Smart Assumptions</div>
      <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
        {summary.companyName ?? summary.ticker ?? 'Current company'} screened as {summary.regime.replace(/_/g, ' ')}.
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {summary.changedDrivers.map((driver) => (
          <Badge key={driver.driver} variant="outline">
            {driver.label} {driver.confidence}
          </Badge>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--cb-text-muted)]">
        {summary.provenanceSummary.companyProfile} {summary.provenanceSummary.peerContext}
      </p>
      {summary.warnings.length > 0 ? (
        <div className="mt-2 text-xs text-[#fde68a]">{summary.warnings[0]}</div>
      ) : null}
    </div>
  );
}

export function AnalystCustomAssumptionSummaryCard({
  summary,
}: {
  summary: AnalystGeneratedModelPayload['customAssumptionSummary'] | CustomAssumptionResult | null | undefined;
}) {
  if (!summary) return null;

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Custom Assumptions</div>
      <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
        Applied explicit user inputs for {summary.companyName ?? summary.ticker ?? 'the active model'}.
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {summary.changedDrivers.map((driver) => (
          <Badge key={driver.driver} variant="outline">
            {driver.label}
          </Badge>
        ))}
      </div>
      {summary.warnings.length > 0 ? (
        <div className="mt-2 text-xs text-[#fde68a]">{summary.warnings[0]}</div>
      ) : null}
    </div>
  );
}

export function AnalystCustomAssumptionControls(props: {
  visible: boolean;
  onToggle: () => void;
  onApply: () => Promise<void>;
  revenueGrowth: string;
  setRevenueGrowth: (value: string) => void;
  operatingMargin: string;
  setOperatingMargin: (value: string) => void;
  wacc: string;
  setWacc: (value: string) => void;
  terminalGrowth: string;
  setTerminalGrowth: (value: string) => void;
  error: string | null;
  isApplying: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Custom Assumptions</div>
          <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
            Set explicit values for the four core drivers.
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={props.onToggle}>
          {props.visible ? 'Hide' : 'Edit'}
        </Button>
      </div>
      {props.visible ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="custom-revenue-growth">Revenue growth (%)</Label>
              <Input id="custom-revenue-growth" value={props.revenueGrowth} onChange={(event) => props.setRevenueGrowth(event.target.value)} placeholder="8.0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-operating-margin">Operating margin (%)</Label>
              <Input id="custom-operating-margin" value={props.operatingMargin} onChange={(event) => props.setOperatingMargin(event.target.value)} placeholder="22.0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-wacc">WACC (%)</Label>
              <Input id="custom-wacc" value={props.wacc} onChange={(event) => props.setWacc(event.target.value)} placeholder="10.0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-terminal-growth">Terminal growth (%)</Label>
              <Input id="custom-terminal-growth" value={props.terminalGrowth} onChange={(event) => props.setTerminalGrowth(event.target.value)} placeholder="2.5" />
            </div>
          </div>
          {props.error ? <div className="text-xs text-[#fecaca]">{props.error}</div> : null}
          <Button type="button" size="sm" onClick={() => void props.onApply()} disabled={props.isApplying}>
            {props.isApplying ? 'Applying…' : 'Apply assumptions'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AnalystThreeStatementControls(props: {
  visible: boolean;
  onToggle: () => void;
  onReset: () => void;
  onApply: () => Promise<void>;
  onShock: (prompt: string) => Promise<void>;
  grossMarginPct: number;
  setGrossMarginPct: (value: number) => void;
  opexPct: number;
  setOpexPct: (value: number) => void;
  taxRatePct: number;
  setTaxRatePct: (value: number) => void;
  revenueGrowthShiftBps: number;
  setRevenueGrowthShiftBps: (value: number) => void;
  adjustedRevenueGrowth: number[];
  hasChanges: boolean;
  isApplyingControls: boolean;
  isApplyingEventShock: boolean;
  controlsError: string | null;
  canAdjust: boolean;
}) {
  const eventPresets = [
    { label: 'CEO Retires', prompt: 'If the CEO retires, stress this model' },
    { label: 'Rates Stay Higher', prompt: 'What if rates stay higher for longer on this model' },
    { label: 'Oil Shock', prompt: 'Show me the impact of an oil shock on this model' },
    { label: 'Tariff Shock', prompt: 'Stress this model for tariffs going up' },
  ] as const;

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Live Model Controls</div>
          <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
            Edit the operating assumptions here, then apply the changes to rerender the active forecast model.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={props.onToggle}>
            {props.visible ? 'Hide Controls' : 'Show Controls'}
          </Button>
          {props.visible ? (
            <Button type="button" variant="outline" size="sm" onClick={props.onReset} disabled={props.isApplyingControls}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>
      {props.visible ? (
        <div className="mt-4 space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Event Presets</Label>
              <span className="text-xs text-[var(--cb-text-muted)]">Apply a deterministic operating shock</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {eventPresets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void props.onShock(preset.prompt)}
                  disabled={!props.canAdjust || props.isApplyingControls || props.isApplyingEventShock}
                >
                  {props.isApplyingEventShock ? 'Applying…' : preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Revenue Growth Shift</Label>
              <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                {props.revenueGrowthShiftBps > 0 ? '+' : ''}{(props.revenueGrowthShiftBps / 100).toFixed(1)}%
              </span>
            </div>
            <Slider value={[props.revenueGrowthShiftBps]} onValueChange={([value]) => props.setRevenueGrowthShiftBps(value)} min={-500} max={500} step={25} className="mb-1" />
            <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
              <span>-5.0%</span>
              <span>{props.adjustedRevenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}</span>
              <span>+5.0%</span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Gross Margin</Label>
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{props.grossMarginPct.toFixed(1)}%</span>
              </div>
              <Slider value={[props.grossMarginPct]} onValueChange={([value]) => props.setGrossMarginPct(value)} min={20} max={90} step={0.5} className="mb-1" />
              <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                <span>20.0%</span>
                <span>90.0%</span>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Opex % Revenue</Label>
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{props.opexPct.toFixed(1)}%</span>
              </div>
              <Slider value={[props.opexPct]} onValueChange={([value]) => props.setOpexPct(value)} min={5} max={70} step={0.5} className="mb-1" />
              <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                <span>5.0%</span>
                <span>70.0%</span>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Tax Rate</Label>
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{props.taxRatePct.toFixed(1)}%</span>
              </div>
              <Slider value={[props.taxRatePct]} onValueChange={([value]) => props.setTaxRatePct(value)} min={5} max={35} step={0.5} className="mb-1" />
              <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                <span>5.0%</span>
                <span>35.0%</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cb-border-subtle)] pt-4">
            <div className="text-xs text-[var(--cb-text-muted)]">
              Changes are staged locally while you edit. Apply them to update the current operating assumptions and rerender the active model card.
            </div>
            <Button type="button" size="sm" onClick={() => void props.onApply()} disabled={!props.hasChanges || props.isApplyingControls}>
              {props.isApplyingControls ? 'Applying…' : 'Apply Changes'}
            </Button>
          </div>
          {props.controlsError ? (
            <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
              {props.controlsError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AnalystCompsControls(props: {
  visible: boolean;
  onToggle: () => void;
  onReset: () => void;
  onApply: () => Promise<void>;
  rows: Array<Record<string, unknown>>;
  adjustments: Record<string, CompsTickerAdjustment>;
  updateAdjustment: (ticker: string, patch: Partial<CompsTickerAdjustment>) => void;
  addPeers: string;
  setAddPeers: (value: string) => void;
  removePeers: string;
  setRemovePeers: (value: string) => void;
  evRevenueMultiple: number;
  setEvRevenueMultiple: (value: number) => void;
  evEbitdaMultiple: number;
  setEvEbitdaMultiple: (value: number) => void;
  peMultiple: number;
  setPeMultiple: (value: number) => void;
  subjectTicker: string | null;
  hasChanges: boolean;
  isApplyingControls: boolean;
  controlsError: string | null;
}) {
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Live Comps Controls</div>
          <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
            Controls start collapsed. Open them to adjust the subject and each peer directly, then apply the changes to rerender the active comps view.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={props.onToggle}>
            {props.visible ? 'Hide Controls' : 'Show Controls'}
          </Button>
          {props.visible ? (
            <Button type="button" variant="outline" size="sm" onClick={props.onReset} disabled={props.isApplyingControls}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>
      {props.visible ? (
        <div className="mt-4 space-y-6">
          <div className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Per-Ticker Controls</div>
            <div className="grid gap-4">
              {props.rows.map((row) => {
                const ticker = typeof row.ticker === 'string' ? row.ticker : 'TICKER';
                const name = typeof row.name === 'string' ? row.name : ticker;
                const adjustment = props.adjustments[ticker] ?? defaultCompsTickerAdjustment();
                const isSubject = ticker === props.subjectTicker;

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
                        <Slider value={[adjustment.revenueShiftPct]} onValueChange={([value]) => props.updateAdjustment(ticker, { revenueShiftPct: value })} min={-50} max={50} step={1} className="mb-1" />
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
                        <Slider value={[adjustment.ebitdaShiftPct]} onValueChange={([value]) => props.updateAdjustment(ticker, { ebitdaShiftPct: value })} min={-50} max={50} step={1} className="mb-1" />
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
                        <Slider value={[adjustment.priceShiftPct]} onValueChange={([value]) => props.updateAdjustment(ticker, { priceShiftPct: value })} min={-40} max={40} step={1} className="mb-1" />
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
                        <Slider value={[adjustment.sharesShiftPct]} onValueChange={([value]) => props.updateAdjustment(ticker, { sharesShiftPct: value })} min={-20} max={20} step={1} className="mb-1" />
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
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{props.evRevenueMultiple.toFixed(1)}x</span>
              </div>
              <Slider value={[props.evRevenueMultiple]} onValueChange={([value]) => props.setEvRevenueMultiple(value)} min={1} max={25} step={0.1} className="mb-1" />
              <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                <span>1.0x</span>
                <span>25.0x</span>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>EV / EBITDA</Label>
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{props.evEbitdaMultiple.toFixed(1)}x</span>
              </div>
              <Slider value={[props.evEbitdaMultiple]} onValueChange={([value]) => props.setEvEbitdaMultiple(value)} min={1} max={50} step={0.1} className="mb-1" />
              <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                <span>1.0x</span>
                <span>50.0x</span>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>P / E</Label>
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{props.peMultiple.toFixed(1)}x</span>
              </div>
              <Slider value={[props.peMultiple]} onValueChange={([value]) => props.setPeMultiple(value)} min={1} max={80} step={0.1} className="mb-1" />
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
              <Input value={props.addPeers} onChange={(event) => props.setAddPeers(event.target.value)} placeholder="NOW, WDAY" className="h-10" />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Remove Peers</Label>
                <span className="text-xs text-[var(--cb-text-muted)]">Tickers or company names</span>
              </div>
              <Input value={props.removePeers} onChange={(event) => props.setRemovePeers(event.target.value)} placeholder="SNOW" className="h-10" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cb-border-subtle)] pt-4">
            <div className="text-xs text-[var(--cb-text-muted)]">
              Changes are staged locally while you edit. Apply them to update the subject snapshot, adjust the peer set, and rerender implied valuation on the active comps model.
            </div>
            <Button type="button" size="sm" onClick={() => void props.onApply()} disabled={!props.hasChanges || props.isApplyingControls}>
              {props.isApplyingControls ? 'Applying…' : 'Apply Changes'}
            </Button>
          </div>
          {props.controlsError ? (
            <div className="rounded-xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-sm text-[#fecaca]">
              {props.controlsError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
