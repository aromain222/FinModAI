"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ScorecardSummary, ScorecardMetricRow } from '@/lib/models/scorecard/buildScorecardSummary';

type ScorecardPreviewProps = {
  output: unknown;
  ticker: string;
};

type ScorecardOutputShape = {
  scorecardSummary?: ScorecardSummary | null;
};

const toScorecardSummary = (output: unknown): ScorecardSummary | null => {
  if (!output || typeof output !== 'object') return null;
  const maybe = (output as ScorecardOutputShape).scorecardSummary;
  if (!maybe || typeof maybe !== 'object') return null;
  if (!Array.isArray(maybe.metrics)) return null;
  return maybe;
};

const formatMetricValue = (metric: ScorecardMetricRow, value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '—';

  if (metric.unit === 'money') {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(Math.round(value));
  }

  if (metric.unit === 'percent') {
    const pct = value * 100;
    return `${pct.toFixed(1)}%`;
  }

  return `${value.toFixed(1)}x`;
};

const formatPercentile = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(0)}th`;
};

export function ScorecardPreview({ output, ticker }: ScorecardPreviewProps) {
  const scorecard = toScorecardSummary(output);

  if (!scorecard) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle>Fundamentals Scorecard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-muted)]">
            Preview data not available. Download Excel to view the full scorecard.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">Fundamentals Scorecard</CardTitle>
          <p className="text-sm text-[var(--cb-text-muted)]">
            {scorecard.company.companyName} ({scorecard.company.ticker || ticker}) • {scorecard.company.sector || '—'} •{' '}
            As of {scorecard.company.asOfDate || '—'}
          </p>
          <p className="text-xs text-[var(--cb-text-muted)]">
            All figures in USD millions unless otherwise noted.
          </p>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {scorecard.metrics.map((metric) => (
          <Card key={metric.label} className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--cb-text-secondary)]">{metric.label}</p>
                  <p className="text-2xl font-semibold text-[var(--cb-text-primary)]">
                    {formatMetricValue(metric, metric.value)}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-1 text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                  {metric.unit}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Sector Median</p>
                  <p className="font-medium text-[var(--cb-text-secondary)]">
                    {formatMetricValue(metric, metric.sectorMedian)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Percentile</p>
                  <p className="font-medium text-[var(--cb-text-secondary)]">{formatPercentile(metric.percentile)}</p>
                </div>
              </div>

              <p className="text-xs text-[var(--cb-text-muted)]">{metric.notes || '—'}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
