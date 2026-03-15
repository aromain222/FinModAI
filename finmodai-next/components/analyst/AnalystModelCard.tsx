'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EditableFinanceChart } from '@/components/charts/EditableFinanceChart';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';

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
  }
}

function inferChartSpec(payload: AnalystGeneratedModelPayload): ChartSpec | null {
  const inputs = payload.extractedInputs as Record<string, unknown>;

  if (payload.modelType === 'THREE_STATEMENT') {
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    const ebitMargin = Array.isArray(inputs.ebitMargin) ? inputs.ebitMargin : [];
    const years = Array.from({ length: Math.max(revenueGrowth.length, ebitMargin.length) }, (_, idx) => `Y${idx + 1}`);
    if (years.length > 0) {
      return {
        kind: 'line',
        title: 'Forecast Assumption Paths',
        data: years.map((year, index) => ({
          year,
          revenueGrowth: typeof revenueGrowth[index] === 'number' ? Number(revenueGrowth[index]) * 100 : 0,
          ebitMargin: typeof ebitMargin[index] === 'number' ? Number(ebitMargin[index]) * 100 : 0,
        })),
        lines: [
          { key: 'revenueGrowth', label: 'Revenue Growth', color: '#2563eb', valueType: 'percent' },
          { key: 'ebitMargin', label: 'EBIT Margin', color: '#16a34a', valueType: 'percent' },
        ],
        yType: 'percent',
      };
    }
  }

  if (payload.modelType === 'COMPS') {
    const peers = Array.isArray(inputs.peers) ? (inputs.peers as Array<Record<string, unknown>>) : [];
    if (peers.length > 0) {
      const data = peers
        .slice(0, 8)
        .map((peer) => ({
          label: String(peer.ticker ?? peer.name ?? 'Peer'),
          revenue: typeof peer.revenue === 'number' ? Number(peer.revenue) : 0,
          ebitda: typeof peer.ebitda === 'number' ? Number(peer.ebitda) : 0,
        }));
      return {
        kind: 'bar',
        title: 'Peer Operating Scale',
        data,
        bars: [
          { key: 'revenue', label: 'Revenue', color: '#2563eb', valueType: 'currency' },
          { key: 'ebitda', label: 'EBITDA', color: '#16a34a', valueType: 'currency' },
        ],
        yType: 'currency',
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

export function AnalystModelCard({ payload }: { payload: AnalystGeneratedModelPayload }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const chartSpec = inferChartSpec(payload);

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
      const filename = filenameMatch?.[1] || `${payload.modelType}_Analyst_Chat.xlsx`;
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
          },
          reportInput: {
            highLevelNotes: payload.narrativeBlocks.map((block) => `${block.title}: ${block.body}`).join(' '),
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
      anchor.download = `${payload.modelType.toLowerCase()}_capitalbase_report.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Unable to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  }

  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Prompt-to-Model Demo</CardTitle>
            <CardDescription>{payload.title}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{payload.modelType}</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleGenerateReport()} disabled={isGeneratingReport}>
              {isGeneratingReport ? 'Generating Report…' : 'Generate Report'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()} disabled={isDownloading}>
              {isDownloading ? 'Preparing Excel…' : 'Download Excel'}
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
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Workbook Tabs</div>
          <div className="flex flex-wrap gap-2">
            {payload.tabs.map((tab) => (
              <Badge key={tab} variant="outline" className="border-[var(--cb-border-subtle)] text-[var(--cb-text-secondary)]">
                {tab}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Key Outputs</div>
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{payload.keyOutputs.join(', ')}</p>
        </div>

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
