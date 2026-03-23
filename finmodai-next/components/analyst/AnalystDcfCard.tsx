'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { EditableFinanceChart } from '@/components/charts/EditableFinanceChart';
import { FormattedTextBlock } from '@/components/ui/formatted-text-block';
import type { AnalystDcfAdjustment, AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import { buildAnalystDcfPreviewPayload } from '@/lib/analyst/dcfPreview';

function fmtMillions(value: number): string {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
}

function fmtPrice(value: number | null): string {
  return value === null ? 'n/a' : `$${value.toFixed(2)}`;
}

function fmtPct(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function StatCard(props: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">{props.value}</div>
      {props.helper ? <div className="mt-1 text-xs text-[var(--cb-text-muted)]">{props.helper}</div> : null}
    </div>
  );
}

function ComparisonRow(props: { label: string; primary: string; comparison: string; primaryTicker: string; comparisonTicker: string }) {
  return (
    <div className="grid gap-2 border-t border-[var(--cb-border-subtle)] py-3 md:grid-cols-[1.2fr_1fr_1fr] md:items-center">
      <div className="text-sm text-[var(--cb-text-muted)]">{props.label}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{props.primaryTicker}</div>
        <div className="text-sm font-medium text-[var(--cb-text-primary)]">{props.primary}</div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{props.comparisonTicker}</div>
        <div className="text-sm font-medium text-[var(--cb-text-primary)]">{props.comparison}</div>
      </div>
    </div>
  );
}

export function AnalystDcfCard({
  payload,
  onAdjust,
  onRunEventShock,
}: {
  payload: AnalystDcfDemoPayload;
  onAdjust?: (adjustment: AnalystDcfAdjustment) => Promise<void>;
  onRunEventShock?: (prompt: string) => Promise<void>;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isApplyingControls, setIsApplyingControls] = useState(false);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [isApplyingEventShock, setIsApplyingEventShock] = useState(false);
  const [revenueGrowthShiftBps, setRevenueGrowthShiftBps] = useState(0);
  const [marginShiftBps, setMarginShiftBps] = useState(0);
  const [waccPct, setWaccPct] = useState(payload.assumptions.wacc * 100);
  const [terminalGrowthPct, setTerminalGrowthPct] = useState(payload.assumptions.terminalGrowth * 100);
  const eventShockPresets = [
    { label: 'CEO Retires', prompt: 'If the CEO retires, show me the impact on this DCF' },
    { label: 'Rates Stay Higher', prompt: 'What if rates stay higher for longer on this DCF' },
    { label: 'Oil Shock', prompt: 'Show me the impact of an oil shock on this DCF' },
    { label: 'Tariff Shock', prompt: 'Stress this DCF for tariffs going up' },
  ] as const;
  const scenarioBars = [
    { name: 'Bear', value: displayPayload.scenarios.bear.pricePerShare ?? 0, fill: '#dc2626' },
    { name: 'Base', value: displayPayload.scenarios.base.pricePerShare ?? 0, fill: '#2563eb' },
    { name: 'Bull', value: displayPayload.scenarios.bull.pricePerShare ?? 0, fill: '#16a34a' },
  ];
  const forecastChartData = [
    {
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Revenue',
      x: displayPayload.forecast.map((row) => row.year),
      y: displayPayload.forecast.map((row) => row.revenue),
      line: { color: '#2563eb', width: 2.5, shape: 'spline' },
      marker: { color: '#2563eb', size: 6 },
      hovertemplate: '%{x}<br>Revenue: $%{y:,.0f}M<extra></extra>',
      yaxis: 'y',
    },
    {
      type: 'scatter',
      mode: 'lines+markers',
      name: 'FCFF',
      x: displayPayload.forecast.map((row) => row.year),
      y: displayPayload.forecast.map((row) => row.fcff),
      line: { color: '#16a34a', width: 2.5, shape: 'spline' },
      marker: { color: '#16a34a', size: 6 },
      hovertemplate: '%{x}<br>FCFF: $%{y:,.0f}M<extra></extra>',
      yaxis: 'y2',
    },
  ];
  const scenarioChartData = [
    {
      type: 'bar',
      name: 'Scenario Value / Share',
      x: scenarioBars.map((entry) => entry.name),
      y: scenarioBars.map((entry) => entry.value),
      marker: { color: scenarioBars.map((entry) => entry.fill) },
      hovertemplate: '%{x}<br>Value / Share: $%{y:.2f}<extra></extra>',
    },
  ];

  useEffect(() => {
    setRevenueGrowthShiftBps(0);
    setMarginShiftBps(0);
    setWaccPct(payload.assumptions.wacc * 100);
    setTerminalGrowthPct(payload.assumptions.terminalGrowth * 100);
    setControlsError(null);
  }, [payload]);

  const adjustedRevenueGrowth = useMemo(
    () =>
      payload.assumptions.revenueGrowth.map((value) =>
        Math.min(0.25, Math.max(-0.05, value + revenueGrowthShiftBps / 10000)),
      ),
    [payload.assumptions.revenueGrowth, revenueGrowthShiftBps],
  );

  const adjustedEbitMargin = useMemo(
    () =>
      payload.assumptions.ebitMargin.map((value) =>
        Math.min(0.5, Math.max(0.05, value + marginShiftBps / 10000)),
      ),
    [payload.assumptions.ebitMargin, marginShiftBps],
  );

  const hasControlChanges =
    revenueGrowthShiftBps !== 0 ||
    marginShiftBps !== 0 ||
    Math.abs(waccPct - payload.assumptions.wacc * 100) > 0.001 ||
    Math.abs(terminalGrowthPct - payload.assumptions.terminalGrowth * 100) > 0.001;

  const stagedAdjustment = useMemo<AnalystDcfAdjustment>(
    () => ({
      revenueGrowth: adjustedRevenueGrowth,
      ebitMargin: adjustedEbitMargin,
      wacc: waccPct / 100,
      terminalGrowth: terminalGrowthPct / 100,
    }),
    [adjustedEbitMargin, adjustedRevenueGrowth, terminalGrowthPct, waccPct],
  );

  const displayPayload = useMemo(
    () => (hasControlChanges ? buildAnalystDcfPreviewPayload(payload, stagedAdjustment) : payload),
    [hasControlChanges, payload, stagedAdjustment],
  );

  async function handleDownload() {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch('/api/analyst-chat/dcf-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: JSON.stringify({ payload }),
      });

      if (!response.ok) {
        const maybeJson = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(maybeJson?.error || 'Failed to export DCF workbook.');
      }

      const blob = await response.blob();
      const filenameMatch = response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `${payload.ticker}_DCF_Demo.xlsx`;
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
          ticker: payload.ticker,
          companyName: payload.companyName,
          asOfDate: payload.asOfDate,
          modelType: 'dcf',
          keyOutputs: {
            baseValuePerShare: payload.scenarios.base.pricePerShare,
            bullValuePerShare: payload.scenarios.bull.pricePerShare,
            bearValuePerShare: payload.scenarios.bear.pricePerShare,
            impliedUpsidePct:
              typeof payload.scenarios.base.upsidePct === 'number' ? payload.scenarios.base.upsidePct * 100 : null,
          },
          modelData: {
            dcfSummary: {
              results: {
                enterpriseValue: payload.scenarios.base.enterpriseValue,
                equityValue: payload.scenarios.base.equityValue,
                pricePerShare: payload.scenarios.base.pricePerShare,
              },
              scenarios: payload.scenarios,
              assumptions: payload.assumptions,
              marketContext: {
                sharePrice: payload.baseMetrics.sharePrice,
              },
            },
            forecast: payload.forecast,
            notes: payload.notes,
          },
          reportInput: {
            highLevelNotes: `Prompt run: ${payload.prompt}\nMemo summary: ${payload.memo}`,
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
      anchor.download = `${payload.ticker}_capitalbase_dcf_memo.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Unable to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleApplyControls() {
    if (!onAdjust || isApplyingControls || !hasControlChanges) return;

    setIsApplyingControls(true);
    setControlsError(null);
    try {
      await onAdjust(stagedAdjustment);
    } catch (error) {
      setControlsError(error instanceof Error ? error.message : 'Unable to apply DCF controls.');
    } finally {
      setIsApplyingControls(false);
    }
  }

  async function handleRunEventShock(prompt: string) {
    if (!onRunEventShock || isApplyingEventShock || isApplyingControls) return;

    setIsApplyingEventShock(true);
    setControlsError(null);
    try {
      await onRunEventShock(prompt);
    } catch (error) {
      setControlsError(error instanceof Error ? error.message : 'Unable to apply event shock.');
    } finally {
      setIsApplyingEventShock(false);
    }
  }

  function handleResetControls() {
    setRevenueGrowthShiftBps(0);
    setMarginShiftBps(0);
    setWaccPct(payload.assumptions.wacc * 100);
    setTerminalGrowthPct(payload.assumptions.terminalGrowth * 100);
    setControlsError(null);
  }

  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Prompt-to-DCF Demo</CardTitle>
            <CardDescription>
              {payload.companyName} ({payload.ticker}) using cached demo fundamentals and local DCF math.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{payload.years}Y</Badge>
            <Badge variant="outline">{payload.currency}</Badge>
            <Badge variant="outline">{payload.source}</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleGenerateReport()} disabled={isGeneratingReport}>
              {isGeneratingReport ? 'Generating Memo PDF…' : 'Generate Memo PDF'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()} disabled={isDownloading}>
              {isDownloading ? 'Preparing Excel…' : 'Download Excel'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4">
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
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Scenario Controls</div>
              <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
                Edit the main valuation drivers here. Charts and valuation preview live while you drag, and Apply Changes commits the model.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowControls((value) => !value)}>
                {showControls ? 'Hide Controls' : 'Show Controls'}
              </Button>
              {showControls ? (
                <Button type="button" variant="outline" size="sm" onClick={handleResetControls} disabled={isApplyingControls}>
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
                  <span className="text-xs text-[var(--cb-text-muted)]">Apply a deterministic macro or event shock</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {eventShockPresets.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRunEventShock(preset.prompt)}
                      disabled={!onRunEventShock || isApplyingEventShock || isApplyingControls}
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
                <Slider
                  value={[revenueGrowthShiftBps]}
                  onValueChange={([value]) => setRevenueGrowthShiftBps(value)}
                  min={-500}
                  max={500}
                  step={25}
                  className="mb-1"
                />
                <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                  <span>-5.0%</span>
                  <span>{adjustedRevenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}</span>
                  <span>+5.0%</span>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>EBIT Margin Shift</Label>
                  <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                    {marginShiftBps > 0 ? '+' : ''}{(marginShiftBps / 100).toFixed(1)}%
                  </span>
                </div>
                <Slider
                  value={[marginShiftBps]}
                  onValueChange={([value]) => setMarginShiftBps(value)}
                  min={-500}
                  max={500}
                  step={25}
                  className="mb-1"
                />
                <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                  <span>-5.0%</span>
                  <span>{adjustedEbitMargin.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}</span>
                  <span>+5.0%</span>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label>WACC</Label>
                    <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{waccPct.toFixed(1)}%</span>
                  </div>
                  <Slider
                    value={[waccPct]}
                    onValueChange={([value]) => setWaccPct(value)}
                    min={6}
                    max={16}
                    step={0.25}
                    className="mb-1"
                  />
                  <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                    <span>6.0%</span>
                    <span>16.0%</span>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label>Terminal Growth</Label>
                    <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{terminalGrowthPct.toFixed(1)}%</span>
                  </div>
                  <Slider
                    value={[terminalGrowthPct]}
                    onValueChange={([value]) => setTerminalGrowthPct(value)}
                    min={1}
                    max={4}
                    step={0.25}
                    className="mb-1"
                  />
                  <div className="flex justify-between text-xs text-[var(--cb-text-muted)]">
                    <span>1.0%</span>
                    <span>4.0%</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cb-border-subtle)] pt-4">
                <div className="text-xs text-[var(--cb-text-muted)]">
                  {hasControlChanges
                    ? 'Preview mode is live. Apply Changes commits the current assumptions, valuation summary, and memo.'
                    : 'Drag any slider to preview the valuation impact live. Apply Changes commits the updated model.'}
                </div>
                <Button type="button" size="sm" onClick={() => void handleApplyControls()} disabled={!hasControlChanges || isApplyingControls}>
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
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard
            label="Base EV"
            value={fmtMillions(displayPayload.scenarios.base.enterpriseValue)}
            helper={
              hasControlChanges
                ? `Preview equity ${fmtMillions(displayPayload.scenarios.base.equityValue)}`
                : `Equity ${fmtMillions(displayPayload.scenarios.base.equityValue)}`
            }
          />
          <StatCard
            label="Implied Price"
            value={fmtPrice(displayPayload.scenarios.base.pricePerShare)}
            helper={hasControlChanges ? 'Preview base case per share' : 'Base case per share'}
          />
          <StatCard
            label="Cached Price"
            value={fmtPrice(displayPayload.baseMetrics.sharePrice)}
            helper={payload.asOfDate ? `As of ${payload.asOfDate.slice(0, 10)}` : 'Demo snapshot'}
          />
          <StatCard
            label="Upside / Downside"
            value={fmtPct(displayPayload.scenarios.base.upsidePct)}
            helper={`Bull ${fmtPrice(displayPayload.scenarios.bull.pricePerShare)} | Bear ${fmtPrice(displayPayload.scenarios.bear.pricePerShare)}`}
          />
        </div>

        {payload.comparison && (
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
              Comparison Summary
            </div>
            <div className="mb-4 text-sm text-[var(--cb-text-primary)]">
              {payload.companyName} ({payload.ticker}) vs {payload.comparison.companyName} ({payload.comparison.ticker})
            </div>
            <div className="grid gap-2">
              <ComparisonRow
                label="Cached Price"
                primary={fmtPrice(payload.baseMetrics.sharePrice)}
                comparison={fmtPrice(payload.comparison.baseMetrics.sharePrice)}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Base Implied Value"
                primary={fmtPrice(displayPayload.scenarios.base.pricePerShare)}
                comparison={fmtPrice(payload.comparison.scenarios.base.pricePerShare)}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Base Upside / Downside"
                primary={fmtPct(displayPayload.scenarios.base.upsidePct)}
                comparison={fmtPct(payload.comparison.scenarios.base.upsidePct)}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Base Enterprise Value"
                primary={fmtMillions(displayPayload.scenarios.base.enterpriseValue)}
                comparison={fmtMillions(payload.comparison.scenarios.base.enterpriseValue)}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Year 1 Revenue Growth"
                primary={`${((displayPayload.assumptions.revenueGrowth[0] ?? 0) * 100).toFixed(1)}%`}
                comparison={`${((payload.comparison.assumptions.revenueGrowth[0] ?? 0) * 100).toFixed(1)}%`}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Year 1 EBIT Margin"
                primary={`${((displayPayload.assumptions.ebitMargin[0] ?? 0) * 100).toFixed(1)}%`}
                comparison={`${((payload.comparison.assumptions.ebitMargin[0] ?? 0) * 100).toFixed(1)}%`}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="WACC / Terminal g"
                primary={`${(displayPayload.assumptions.wacc * 100).toFixed(1)}% / ${(displayPayload.assumptions.terminalGrowth * 100).toFixed(1)}%`}
                comparison={`${(payload.comparison.assumptions.wacc * 100).toFixed(1)}% / ${(payload.comparison.assumptions.terminalGrowth * 100).toFixed(1)}%`}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
          <EditableFinanceChart
            title="Base Forecast"
            subtitle={hasControlChanges ? 'Live preview of revenue and FCFF under staged assumptions.' : 'Editable forecast view across revenue and FCFF.'}
            className="p-3"
            height={256}
            data={forecastChartData}
            layout={{
              xaxis: { type: 'category' },
              yaxis: { tickprefix: '$', ticksuffix: 'M', title: 'Revenue' },
              yaxis2: {
                overlaying: 'y',
                side: 'right',
                tickprefix: '$',
                ticksuffix: 'M',
                title: 'FCFF',
              },
            }}
          />

          <EditableFinanceChart
            title="Scenario Value / Share"
            subtitle={hasControlChanges ? 'Live preview of bear, base, and bull value per share.' : 'Editable scenario framing for bear, base, and bull.'}
            className="p-3"
            height={256}
            data={scenarioChartData}
            layout={{
              xaxis: { type: 'category' },
              yaxis: { tickprefix: '$' },
            }}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            label="Revenue Growth"
            value={displayPayload.assumptions.revenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}
            helper="Year 1 through terminal year"
          />
          <StatCard
            label="EBIT Margin"
            value={displayPayload.assumptions.ebitMargin.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}
            helper="Modeled operating leverage path"
          />
          <StatCard
            label="WACC / Terminal g"
            value={`${(displayPayload.assumptions.wacc * 100).toFixed(1)}% / ${(displayPayload.assumptions.terminalGrowth * 100).toFixed(1)}%`}
            helper={`Tax ${(displayPayload.assumptions.taxRate * 100).toFixed(1)}% | Capex ${(displayPayload.assumptions.capexPctRevenue * 100).toFixed(1)}%`}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {(['bear', 'base', 'bull'] as const).map((key) => {
            const scenario = displayPayload.scenarios[key];
            return (
              <div key={key} className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{scenario.name} Case</div>
                <div className="mt-2 text-xl font-semibold text-[var(--cb-text-primary)]">{fmtPrice(scenario.pricePerShare)}</div>
                <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
                  EV {fmtMillions(scenario.enterpriseValue)} | Terminal mix {fmtPct(scenario.terminalValueWeight)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Investment Memo</div>
          <FormattedTextBlock content={payload.memo} />
        </div>

        {payload.notes.length > 0 && (
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Model Notes</div>
            <ul className="space-y-2 text-sm text-[var(--cb-text-primary)]">
              {payload.notes.map((note) => (
                <li key={note}>- {note}</li>
              ))}
            </ul>
          </div>
        )}

        {payload.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 p-3 text-sm text-amber-900">
            {payload.warnings.join(' ')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
