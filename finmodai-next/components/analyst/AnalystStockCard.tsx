'use client';

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
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { financeTooltipStyle } from '@/components/charts/FinanceChart';
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

        <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
              {payload.chart.kind === 'price' ? 'Recent Price Trend' : 'Fundamental Snapshot'}
            </div>
            <div style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                {payload.chart.kind === 'price' ? (
                  <LineChart data={payload.chart.points} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbe1ea" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}`} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={financeTooltipStyle} formatter={(value: number) => fmtPrice(value)} />
                    <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={payload.chart.points} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbe1ea" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}B`} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={financeTooltipStyle} formatter={(value: number) => fmtMillions(value)} />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#2563eb" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Lookup Provenance</div>
            <div className="space-y-3 text-sm text-[var(--cb-text-primary)]">
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Company</div>
                <div className="mt-1">{payload.source.company ?? 'n/a'}</div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Fundamentals</div>
                <div className="mt-1">{payload.source.fundamentals ?? 'n/a'}</div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Price</div>
                <div className="mt-1">{payload.source.price ?? 'n/a'}</div>
              </div>
              <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">Fallbacks Used</div>
                <div className="mt-1 text-[var(--cb-text-muted)]">
                  {payload.fallbackUsed.yfinance ? 'yfinance ' : ''}
                  {payload.fallbackUsed.financedatabase ? 'financedatabase' : ''}
                  {!payload.fallbackUsed.yfinance && !payload.fallbackUsed.financedatabase ? 'None' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
