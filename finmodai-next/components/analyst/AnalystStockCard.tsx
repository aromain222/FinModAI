'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { FinanceDataChart } from '@/components/charts/FinanceDataChart';
import { ForecastChart } from '@/components/charts/ForecastChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';
import { fetchPriceForecast, fetchRevenueForecast, type PriceForecastResult, type RevenueForecastResult } from '@/lib/forecast/timesFM';

function fmtNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMillions(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}T`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
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

function ImpliedGrowthBadge({ rate }: { rate: number | null }) {
  if (rate == null) return null;
  const pct = (rate * 100).toFixed(1);
  const color = rate >= 0.05 ? 'text-emerald-400' : rate < 0 ? 'text-rose-400' : 'text-zinc-300';
  return (
    <span className={`text-[11px] font-medium ${color}`}>
      Implied NTM growth {rate >= 0 ? '+' : ''}{pct}%
    </span>
  );
}

export function AnalystStockCard({ payload }: { payload: StockLookupResult }) {
  const chartHeight = 220;
  const stockChartData = payload.chart.points.map((point) => ({
    x: point.label,
    y: point.value,
  }));

  const [priceForecast, setPriceForecast] = useState<PriceForecastResult | null>(null);
  const [revenueForecast, setRevenueForecast] = useState<RevenueForecastResult | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setForecastLoading(true);
    Promise.all([
      fetchPriceForecast(payload.ticker, 30),
      fetchRevenueForecast(payload.ticker, 4),
    ]).then(([price, revenue]) => {
      if (cancelled) return;
      setPriceForecast(price);
      setRevenueForecast(revenue);
      setForecastLoading(false);
    }).catch(() => {
      if (!cancelled) setForecastLoading(false);
    });
    return () => { cancelled = true; };
  }, [payload.ticker]);

  // Build ForecastChart data from the TimesFM response
  const historicalPoints = priceForecast?.historical.dates.map((d, i) => ({
    date: d,
    actual: priceForecast.historical.prices[i] ?? 0,
  })) ?? [];

  const forecastPoints = priceForecast?.forecast
    ? priceForecast.forecast.dates.map((d, i) => ({
        date: d,
        forecast: priceForecast.forecast!.values[i] ?? 0,
        lower: priceForecast.forecast!.lower[i] ?? 0,
        upper: priceForecast.forecast!.upper[i] ?? 0,
      }))
    : null;

  const showForecastChart = !forecastLoading && historicalPoints.length > 0;

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

        {/* Price chart — TimesFM forecast overlay when available, fallback to snapshot */}
        <div>
          {showForecastChart ? (
            <ForecastChart
              ticker={payload.ticker}
              historical={historicalPoints}
              forecast={forecastPoints}
              valuePrefix="$"
              height={chartHeight}
              modelAvailable={priceForecast?.model_available ?? false}
            />
          ) : (
            <FinanceDataChart
              title={payload.chart.kind === 'price' ? 'Recent Price Trend' : 'Fundamental Snapshot'}
              subtitle={forecastLoading ? 'Loading TimesFM forecast…' : 'Recent trading range.'}
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
          )}
        </div>

        {/* Revenue forecast section */}
        {!forecastLoading && revenueForecast && (
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--cb-text-muted)]">
                TimesFM Revenue Forecast
              </span>
              <ImpliedGrowthBadge rate={revenueForecast.implied_growth_rate} />
            </div>
            <FinanceDataChart
              title=""
              data={[
                ...revenueForecast.historical.labels.map((l, i) => ({
                  x: l,
                  y: revenueForecast.historical.revenue[i] ?? null,
                })),
                ...(revenueForecast.forecast?.labels.map((l, i) => ({
                  x: `${l} ▸`,
                  y: revenueForecast.forecast!.values[i] ?? null,
                })) ?? []),
              ]}
              chartType="bar"
              valuePrefix="$"
              valueSuffix="M"
              color="#8b5cf6"
              height={180}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
