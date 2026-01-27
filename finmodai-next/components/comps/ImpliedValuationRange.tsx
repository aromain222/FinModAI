"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MetricType } from './CompsDistributionChart';

interface ImpliedValuationRangeProps {
  selectedMetric: MetricType;
  summary: { median: number; p25: number; p75: number };
  targetBaseFinancial?: number; // Revenue (for EV/Revenue), EBITDA (for EV/EBITDA), or EPS (for P/E) in millions
}

/**
 * Format large numbers (millions/billions)
 */
function formatValuation(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}B`;
  }
  return `$${value.toFixed(0)}M`;
}

function getBaseFinancialLabel(metric: MetricType): string {
  switch (metric) {
    case 'evRevenue':
      return 'Revenue';
    case 'evEbitda':
      return 'EBITDA';
    case 'pe':
      return 'EPS';
  }
}

function getMetricLabel(metric: MetricType): string {
  switch (metric) {
    case 'evRevenue':
      return 'EV/Revenue';
    case 'evEbitda':
      return 'EV/EBITDA';
    case 'pe':
      return 'P/E';
  }
}

function getValuationLabel(metric: MetricType): string {
  switch (metric) {
    case 'evRevenue':
      return 'Enterprise Value';
    case 'evEbitda':
      return 'Enterprise Value';
    case 'pe':
      return 'Equity Value';
  }
}

export function ImpliedValuationRange({ selectedMetric, summary, targetBaseFinancial }: ImpliedValuationRangeProps) {
  const baseFinancialLabel = getBaseFinancialLabel(selectedMetric);
  const metricLabel = getMetricLabel(selectedMetric);
  const valuationLabel = getValuationLabel(selectedMetric);

  // Calculate implied valuations if base financial is provided
  const impliedValuations = React.useMemo(() => {
    if (targetBaseFinancial === undefined || !Number.isFinite(targetBaseFinancial) || targetBaseFinancial <= 0) {
      return null;
    }

    return {
      low: summary.p25 * targetBaseFinancial,
      mid: summary.median * targetBaseFinancial,
      high: summary.p75 * targetBaseFinancial,
    };
  }, [targetBaseFinancial, summary]);

  if (!impliedValuations) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-base font-medium text-[var(--cb-text-primary)]">
            Implied Valuation Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--cb-text-muted)]">
            {baseFinancialLabel} data required to calculate implied valuation range.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate range for visualization (accounting for padding)
  const minVal = impliedValuations.low;
  const maxVal = impliedValuations.high;
  const range = maxVal - minVal;
  const midPosPercent = range > 0 ? ((impliedValuations.mid - minVal) / range) * 100 : 50;
  // Convert to position accounting for left/right padding (16px = 1rem)
  const midPos = 16 + (midPosPercent / 100) * (100 - 32); // 16px left + 16px right = 32px total

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle className="text-base font-medium text-[var(--cb-text-primary)]">
          Implied Valuation Range
        </CardTitle>
        <p className="text-xs text-[var(--cb-text-muted)] mt-1">
          {valuationLabel} based on comps ({metricLabel} × {baseFinancialLabel})
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Range Bar Visualization */}
        <div className="relative h-16 bg-[var(--cb-surface-alt)] rounded-lg border border-[var(--cb-border-subtle)] overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 flex items-center px-4">
            <div className="flex-1 h-2 bg-gradient-to-r from-red-500/20 via-yellow-500/20 to-green-500/20 rounded-full" />
          </div>
          {/* Value markers */}
          <div className="absolute inset-0 flex items-center">
            {/* Low marker */}
            <div className="absolute left-4 flex flex-col items-center">
              <div className="h-4 w-0.5 bg-red-400" />
              <div className="mt-1 text-[10px] font-medium text-red-400">Low</div>
            </div>
            {/* Mid marker */}
            <div
              className="absolute flex flex-col items-center transform -translate-x-1/2"
              style={{ left: `${midPos}%` }}
            >
              <div className="h-4 w-0.5 bg-yellow-400" />
              <div className="mt-1 text-[10px] font-medium text-yellow-400">Mid</div>
            </div>
            {/* High marker */}
            <div className="absolute right-4 flex flex-col items-center">
              <div className="h-4 w-0.5 bg-green-400" />
              <div className="mt-1 text-[10px] font-medium text-green-400">High</div>
            </div>
          </div>
        </div>

        {/* Three-Value Card Grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Low */}
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <div className="text-xs text-[var(--cb-text-muted)] mb-1">Low (P25)</div>
              <div className="text-lg font-semibold text-red-400">{formatValuation(impliedValuations.low)}</div>
            <div className="text-[10px] text-[var(--cb-text-muted)] mt-1">
              {summary.p25.toFixed(1)}×
            </div>
          </div>

          {/* Mid */}
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
            <div className="text-xs text-[var(--cb-text-muted)] mb-1">Mid (Median)</div>
            <div className="text-lg font-semibold text-yellow-400">{formatValuation(impliedValuations.mid)}</div>
            <div className="text-[10px] text-[var(--cb-text-muted)] mt-1">
              {summary.median.toFixed(1)}×
            </div>
          </div>

          {/* High */}
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <div className="text-xs text-[var(--cb-text-muted)] mb-1">High (P75)</div>
            <div className="text-lg font-semibold text-green-400">{formatValuation(impliedValuations.high)}</div>
            <div className="text-[10px] text-[var(--cb-text-muted)] mt-1">
              {summary.p75.toFixed(1)}×
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-[var(--cb-text-muted)] text-center pt-2 border-t border-[var(--cb-border-subtle)]">
          Implied {valuationLabel.toLowerCase()} based on comps
        </p>
      </CardContent>
    </Card>
  );
}

