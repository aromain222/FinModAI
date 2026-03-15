'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { financeTooltipStyle } from '@/components/charts/FinanceChart';
import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';

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

export function AnalystDcfCard({ payload }: { payload: AnalystDcfDemoPayload }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const scenarioBars = [
    { name: 'Bear', value: payload.scenarios.bear.pricePerShare ?? 0, fill: '#dc2626' },
    { name: 'Base', value: payload.scenarios.base.pricePerShare ?? 0, fill: '#2563eb' },
    { name: 'Bull', value: payload.scenarios.bull.pricePerShare ?? 0, fill: '#16a34a' },
  ];

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
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard
            label="Base EV"
            value={fmtMillions(payload.scenarios.base.enterpriseValue)}
            helper={`Equity ${fmtMillions(payload.scenarios.base.equityValue)}`}
          />
          <StatCard
            label="Implied Price"
            value={fmtPrice(payload.scenarios.base.pricePerShare)}
            helper="Base case per share"
          />
          <StatCard
            label="Cached Price"
            value={fmtPrice(payload.baseMetrics.sharePrice)}
            helper={payload.asOfDate ? `As of ${payload.asOfDate.slice(0, 10)}` : 'Demo snapshot'}
          />
          <StatCard
            label="Upside / Downside"
            value={fmtPct(payload.scenarios.base.upsidePct)}
            helper={`Bull ${fmtPrice(payload.scenarios.bull.pricePerShare)} | Bear ${fmtPrice(payload.scenarios.bear.pricePerShare)}`}
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
                primary={fmtPrice(payload.scenarios.base.pricePerShare)}
                comparison={fmtPrice(payload.comparison.scenarios.base.pricePerShare)}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Base Upside / Downside"
                primary={fmtPct(payload.scenarios.base.upsidePct)}
                comparison={fmtPct(payload.comparison.scenarios.base.upsidePct)}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Base Enterprise Value"
                primary={fmtMillions(payload.scenarios.base.enterpriseValue)}
                comparison={fmtMillions(payload.comparison.scenarios.base.enterpriseValue)}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Year 1 Revenue Growth"
                primary={`${((payload.assumptions.revenueGrowth[0] ?? 0) * 100).toFixed(1)}%`}
                comparison={`${((payload.comparison.assumptions.revenueGrowth[0] ?? 0) * 100).toFixed(1)}%`}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="Year 1 EBIT Margin"
                primary={`${((payload.assumptions.ebitMargin[0] ?? 0) * 100).toFixed(1)}%`}
                comparison={`${((payload.comparison.assumptions.ebitMargin[0] ?? 0) * 100).toFixed(1)}%`}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
              <ComparisonRow
                label="WACC / Terminal g"
                primary={`${(payload.assumptions.wacc * 100).toFixed(1)}% / ${(payload.assumptions.terminalGrowth * 100).toFixed(1)}%`}
                comparison={`${(payload.comparison.assumptions.wacc * 100).toFixed(1)}% / ${(payload.comparison.assumptions.terminalGrowth * 100).toFixed(1)}%`}
                primaryTicker={payload.ticker}
                comparisonTicker={payload.comparison.ticker}
              />
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
              Base Forecast
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payload.forecast} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe1ea" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(value) => `${Math.round(value / 1000)}B`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => `${Math.round(value / 1000)}B`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip contentStyle={financeTooltipStyle} formatter={(value: number) => fmtMillions(value)} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Revenue" />
                  <Line yAxisId="right" type="monotone" dataKey="fcff" stroke="#16a34a" strokeWidth={2.5} dot={false} name="FCFF" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
              Scenario Value / Share
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioBars} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe1ea" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}`} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={financeTooltipStyle} formatter={(value: number) => fmtPrice(value)} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {scenarioBars.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            label="Revenue Growth"
            value={payload.assumptions.revenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}
            helper="Year 1 through terminal year"
          />
          <StatCard
            label="EBIT Margin"
            value={payload.assumptions.ebitMargin.map((value) => `${(value * 100).toFixed(1)}%`).join(' / ')}
            helper="Modeled operating leverage path"
          />
          <StatCard
            label="WACC / Terminal g"
            value={`${(payload.assumptions.wacc * 100).toFixed(1)}% / ${(payload.assumptions.terminalGrowth * 100).toFixed(1)}%`}
            helper={`Tax ${(payload.assumptions.taxRate * 100).toFixed(1)}% | Capex ${(payload.assumptions.capexPctRevenue * 100).toFixed(1)}%`}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {(['bear', 'base', 'bull'] as const).map((key) => {
            const scenario = payload.scenarios[key];
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
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{payload.memo}</p>
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
