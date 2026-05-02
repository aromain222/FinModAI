'use client';

import { ForecastSparkline } from '@/components/analyst/ForecastSparkline';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { labelForecastSource, type AnalystForecastModelPayload } from '@/lib/analyst/forecastModel';

function formatCurrencyMillions(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}T`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  return `$${Math.round(value).toLocaleString('en-US')}M`;
}

function formatSharePrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function sourceVariant(source: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (source === 'timesfm') return 'default';
  if (source === 'flat_fallback') return 'secondary';
  return 'outline';
}

function sampledIndexes(length: number): number[] {
  if (length <= 6) return Array.from({ length }, (_, index) => index);
  return Array.from(new Set([
    0,
    Math.floor(length * 0.25),
    Math.floor(length * 0.5),
    Math.floor(length * 0.75),
    length - 1,
  ]));
}

export function AnalystForecastModelCard({ payload }: { payload: AnalystForecastModelPayload }) {
  const isPriceForecast = payload.forecastKind === 'price' || payload.units === 'USD/share';
  const confidencePct = Math.round(Math.max(0, Math.min(1, payload.confidence)) * 100);
  const returnPct =
    payload.returnPct ??
    (payload.latestActual && payload.terminalForecast
      ? payload.terminalForecast / payload.latestActual - 1
      : null);
  const priceRows = sampledIndexes(payload.forecast.length).map((index) => ({
    period: payload.forecastDates?.[index] ?? `Day ${index + 1}`,
    value: payload.forecast[index] ?? null,
    lower: payload.lower?.[index] ?? null,
    upper: payload.upper?.[index] ?? null,
  }));
  const revenueRows = payload.forecast.map((value, index) => ({
    period: `Year ${index + 1}`,
    value,
    growth: payload.growthPath[index] ?? null,
  }));

  return (
    <Card className="mt-4 border-[var(--cb-border-subtle)] bg-[var(--cb-surface-elevated)]">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
              {isPriceForecast ? 'Stock Price Forecast' : 'Forecast Model'}
            </div>
            <CardTitle className="mt-1 text-lg text-[var(--cb-text-primary)]">
              {payload.title}
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={sourceVariant(payload.source)}>{labelForecastSource(payload.source)}</Badge>
            <Badge variant="outline">{confidencePct}% confidence</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
              {isPriceForecast ? 'Current Price' : 'Latest Revenue'}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--cb-text-primary)]">
              {isPriceForecast ? formatSharePrice(payload.latestActual) : formatCurrencyMillions(payload.latestActual)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
              {isPriceForecast ? `${payload.horizonLabel ?? 'Forecast'} Price` : `Year ${payload.horizonYears} Revenue`}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--cb-text-primary)]">
              {isPriceForecast ? formatSharePrice(payload.terminalForecast) : formatCurrencyMillions(payload.terminalForecast)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--cb-text-muted)]">
              {isPriceForecast ? 'Potential Move' : 'Implied CAGR'}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--cb-text-primary)]">
              {formatPct(isPriceForecast ? returnPct : payload.cagr)}
            </div>
          </div>
        </div>

        <ForecastSparkline
          forecast={payload.forecast}
          historical={payload.historical}
          lower={payload.lower}
          upper={payload.upper}
          title={isPriceForecast ? 'Potential Growth Path' : 'Forecast Path'}
          historicalLabel={isPriceForecast ? 'Recent price' : 'Historical'}
          forecastLabel={isPriceForecast ? 'Projected price' : 'Forecast'}
          forecastTone={returnPct == null ? 'neutral' : returnPct < 0 ? 'negative' : returnPct > 0 ? 'positive' : 'neutral'}
        />

        {payload.attributionExplanation ? (
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-black/10 p-3 text-sm leading-6 text-[var(--cb-text-primary)]">
            {payload.attributionExplanation}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-[var(--cb-border-subtle)]">
          <div className="grid grid-cols-3 bg-black/20 px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-[var(--cb-text-muted)]">
            <span>{isPriceForecast ? 'Date' : 'Period'}</span>
            <span className="text-right">{isPriceForecast ? 'Projected Price' : 'Revenue'}</span>
            <span className="text-right">{isPriceForecast ? 'Model Band' : 'Growth'}</span>
          </div>
          {(isPriceForecast ? priceRows : revenueRows).map((row) => (
            <div
              key={row.period}
              className="grid grid-cols-3 border-t border-[var(--cb-border-subtle)] px-3 py-2 text-sm text-[var(--cb-text-primary)]"
            >
              <span>{row.period}</span>
              <span className="text-right tabular-nums">
                {isPriceForecast ? formatSharePrice(row.value) : formatCurrencyMillions(row.value)}
              </span>
              <span className="text-right tabular-nums">
                {isPriceForecast
                  ? 'lower' in row && row.lower !== null && row.upper !== null
                    ? `${formatSharePrice(row.lower)} - ${formatSharePrice(row.upper)}`
                    : 'n/a'
                  : 'growth' in row
                    ? formatPct(row.growth)
                    : 'n/a'}
              </span>
            </div>
          ))}
        </div>

        {payload.warning ? (
          <div className="text-xs leading-5 text-amber-300/90">{payload.warning}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
