'use client';

/**
 * FinanceChart — Reusable wrapper for finance-grade charts.
 * Enforces consistent margins, typography, tooltip style, axis formatting, empty/loading states.
 */

import React from 'react';
import { ResponsiveContainer } from 'recharts';
import {
  formatAxisCurrency,
  formatAxisPercent,
  formatTooltipValue,
  yDomainWithPadding,
  SUGGESTED_TICK_COUNT,
} from '@/lib/chartFormat';

export interface FinanceChartProps {
  children: React.ReactNode;
  title?: string;
  /** Footnote (e.g. "Demo display may use interpolation for readability.") */
  footnote?: string;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  height?: number | string;
  className?: string;
}

const CHART_MARGIN = { left: 8, right: 12, top: 8, bottom: 8 };
const TICK_FONT = { fontSize: 11 };
const AXIS_STROKE = '#9ca3af';

export function FinanceChart({
  children,
  title,
  footnote,
  loading,
  empty,
  emptyMessage = 'No data available',
  height = 320,
  className = '',
}: FinanceChartProps) {
  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/30 rounded-md ${className}`}
        style={{ height: typeof height === 'number' ? height : height }}
      >
        <div className="text-sm text-muted-foreground">Loading chart…</div>
      </div>
    );
  }

  if (empty) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-border rounded-md ${className}`}
        style={{ height: typeof height === 'number' ? height : height }}
      >
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {title && (
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      )}
      <div style={{ height: typeof height === 'number' ? height : height }}>
        <ResponsiveContainer width="100%" height="100%">
          <>{children}</>
        </ResponsiveContainer>
      </div>
      {footnote && (
        <p className="text-[11px] text-muted-foreground">{footnote}</p>
      )}
    </div>
  );
}

/** Shared chart margin for use inside Recharts (e.g. LineChart margin) */
export const financeChartMargin = CHART_MARGIN;

/** Props for a consistent Recharts XAxis (category) */
export function financeXAxisProps(ticks?: number) {
  return {
    stroke: AXIS_STROKE,
    tick: TICK_FONT,
    minTickGap: 24,
    interval: 'preserveStartEnd' as const,
  };
}

/** Props for a consistent Recharts YAxis with currency formatting */
export function financeYAxisCurrencyProps(domain?: [number, number]) {
  return {
    stroke: AXIS_STROKE,
    tick: TICK_FONT,
    tickCount: SUGGESTED_TICK_COUNT,
    domain: domain ?? ['auto', 'auto'],
    tickFormatter: formatAxisCurrency,
    allowDataOverflow: false,
  };
}

/** Props for Y-axis with percent formatting */
export function financeYAxisPercentProps(domain?: [number, number]) {
  return {
    stroke: AXIS_STROKE,
    tick: TICK_FONT,
    tickCount: SUGGESTED_TICK_COUNT,
    domain: domain ?? ['auto', 'auto'],
    tickFormatter: formatAxisPercent,
    allowDataOverflow: false,
  };
}

/** Default tooltip content style (dark theme friendly) */
export const financeTooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '8px',
  color: '#f3f4f6',
  fontSize: 12,
  padding: '8px 12px',
};

/** Format tooltip value (currency) */
export { formatTooltipValue };

/** Compute domain with padding for line charts */
export function useYDomain(values: (number | null)[], paddingPct?: number): [number, number] {
  return yDomainWithPadding(values, paddingPct ?? 0.05);
}
