"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatValue, FormatType } from '@/lib/format/finance';

export type KpiItem = {
  label: string;
  value: number | null | undefined;
  format: FormatType;
  note?: string;
  unit?: 'raw' | 'thousands' | 'millions' | 'billions';
  decimals?: number;
};

export interface KpiStripProps {
  items: KpiItem[];
  columns?: 3 | 4 | 5;
}

/**
 * KPI Strip - Displays 3-5 key metrics in a horizontal strip
 * 
 * Supports "—" for missing values, never shows $0 placeholders.
 * Consistent formatting across all models.
 */
export function KpiStrip({ items, columns = 4 }: KpiStripProps) {
  const gridCols = {
    3: 'grid-cols-1 md:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 md:grid-cols-3 lg:grid-cols-5',
  }[columns];

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`grid ${gridCols} gap-4`}>
      {items.map((item, idx) => (
        <Card
          key={idx}
          className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]"
        >
          <CardContent className="p-4">
            <div className="text-xs text-[var(--cb-text-muted)] mb-1">
              {item.label}
            </div>
            <div className="text-2xl font-bold text-[var(--cb-text-primary)]">
              {formatValue(item.value, item.format, {
                unit: item.unit,
                decimals: item.decimals,
              })}
            </div>
            {item.note && (
              <div className="text-xs text-[var(--cb-text-muted)] mt-1">
                {item.note}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
