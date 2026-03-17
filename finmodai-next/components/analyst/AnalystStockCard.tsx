'use client';

import { Badge } from '@/components/ui/badge';
import { FinanceDataChart } from '@/components/charts/FinanceDataChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';

function fmtNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMillions(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
}

function fmtPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `$${value.toFixed(2)}`;
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

export function AnalystStockCard({ payload }: { payload: StockLookupResult }) {
  const chartHeight = 220;
  const stockChartData = payload.chart.points.map((point) => ({
    x: point.label,
    y: point.value,
  }));

  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {payload.companyName ?? payload.ticker} ({payload.ticker})
            </CardTitle>
            <CardDescription>
              {payload.sector ?? 'Unknown sector'}
              {payload.industry ? ` • ${payload.industry}` : ''}
              {payload.exchange ? ` • ${payload.exchange}` : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {payload.source.fundamentals ? <Badge variant="outline">Fundamentals: {payload.source.fundamentals}</Badge> : null}
            {payload.source.price ? <Badge variant="outline">Price: {payload.source.price}</Badge> : null}
            {payload.asOfDate ? <Badge variant="outline">As of {payload.asOfDate}</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Price" value={fmtPrice(payload.price)} helper={payload.priceAsOfDate ? `Price as of ${payload.priceAsOfDate}` : undefined} />
          <StatCard label="Market Cap" value={fmtMillions(payload.marketCap)} helper={`Shares ${fmtNumber(payload.sharesOutstanding)}`} />
          <StatCard label="Revenue LTM" value={fmtMillions(payload.revenueLtm)} helper={`EBITDA ${fmtMillions(payload.ebitdaLtm)}`} />
          <StatCard label="Cash / Debt" value={`${fmtMillions(payload.cash)} / ${fmtMillions(payload.totalDebt)}`} helper={payload.country ?? undefined} />
        </div>

        <div>
          <FinanceDataChart
            title={payload.chart.kind === 'price' ? 'Recent Price Trend' : 'Fundamental Snapshot'}
            subtitle={payload.chart.kind === 'price' ? 'Recent trading range.' : 'Snapshot of key reported values.'}
            xLabel={payload.chart.kind === 'price' ? 'Date' : 'Metric'}
            yLabel={payload.chart.kind === 'price' ? 'Price' : 'Value'}
            data={stockChartData}
            chartType="auto"
            valueFormat="number"
            valuePrefix="$"
            valueSuffix={payload.chart.kind === 'price' ? undefined : 'M'}
            seriesLabel={payload.ticker}
            color={payload.chart.kind === 'price' ? '#10b981' : '#2563eb'}
            className="p-3"
            height={chartHeight}
          />
        </div>
      </CardContent>
    </Card>
  );
}
