"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import {
  formatMoneyReadable,
  formatPercentReadable,
  formatMultipleReadable,
  formatPriceReadable,
  formatNumberReadable,
  formatSharesReadable,
  formatDelta,
  tabularNumsStyle,
} from '@/lib/models/improvedFormatters';

export interface ImprovedKpiItem {
  label: string;
  value: number | null | undefined;
  format?: 'currency' | 'percent' | 'multiple' | 'price' | 'number' | 'shares' | 'text';
  unit?: string;
  description?: string;
  delta?: number; // Change from baseline (for upside/downside, etc.)
  deltaFormat?: 'percent' | 'currency';
  highlight?: boolean;
}

interface ImprovedKpiCardProps extends ImprovedKpiItem {
  className?: string;
}

/**
 * Improved KPI Card with:
 * - Consistent vertical spacing
 * - Tabular numerals
 * - Thousands separators
 * - Optional delta display
 * - Better visual hierarchy
 */
export function ImprovedKpiCard({
  label,
  value,
  format = 'text',
  unit,
  description,
  delta,
  deltaFormat = 'percent',
  highlight = false,
  className,
}: ImprovedKpiCardProps) {
  const formattedValue = formatValue(value, format, unit);
  const formattedDelta = delta !== undefined ? formatDelta(delta, deltaFormat) : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--cb-surface-alt)] p-4",
        highlight
          ? "border-[var(--cb-green)]/30 bg-[var(--cb-green)]/5"
          : "border-[var(--cb-border-subtle)]",
        className
      )}
      title={description}
    >
      {/* Label */}
      <p className="text-[var(--cb-text-muted)] uppercase tracking-wide text-[0.65rem] mb-2 leading-tight">
        {label}
      </p>

      {/* Value */}
      <p
        className="text-2xl font-semibold text-[var(--cb-text-primary)] font-mono leading-tight mb-1"
        style={tabularNumsStyle}
      >
        {formattedValue}
      </p>

      {/* Delta (optional) */}
      {formattedDelta && (
        <p
          className={cn(
            "text-xs font-medium font-mono leading-tight",
            delta! >= 0 ? "text-green-500" : "text-red-500"
          )}
          style={tabularNumsStyle}
        >
          {formattedDelta}
        </p>
      )}
    </div>
  );
}

/**
 * Format value based on type with improved readability
 */
function formatValue(
  value: number | null | undefined,
  format: string,
  unit?: string
): string {
  if (value === null || value === undefined) return '—';

  if (typeof value === 'string') return value;

  if (!Number.isFinite(value)) return '—';

  switch (format) {
    case 'currency':
      return formatMoneyReadable(value);

    case 'percent':
      return formatPercentReadable(value);

    case 'multiple':
      return formatMultipleReadable(value);

    case 'price':
      return formatPriceReadable(value);

    case 'number':
      return formatNumberReadable(value);

    case 'shares':
      return formatSharesReadable(value);

    default:
      return unit ? `${value}${unit}` : String(value);
  }
}

/**
 * KPI Strip with improved cards
 */
interface ImprovedKpiStripProps {
  items: ImprovedKpiItem[];
  title?: string;
}

export function ImprovedKpiStrip({ items, title = 'Key Metrics' }: ImprovedKpiStripProps) {
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
      <h3 className="text-base font-semibold text-[var(--cb-text-primary)] mb-4">{title}</h3>
      <div
        className={cn(
          "grid gap-4",
          items.length <= 3
            ? "grid-cols-1 sm:grid-cols-3"
            : items.length <= 4
            ? "grid-cols-2 sm:grid-cols-4"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        )}
      >
        {items.map((kpi, idx) => (
          <ImprovedKpiCard key={idx} {...kpi} />
        ))}
      </div>
    </div>
  );
}
