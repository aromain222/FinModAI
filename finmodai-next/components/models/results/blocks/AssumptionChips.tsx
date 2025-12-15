"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { formatValue, FormatType } from '@/lib/format/finance';

export type AssumptionChip = {
  label: string;
  value: number | string | null | undefined;
  format: FormatType;
  unit?: 'raw' | 'thousands' | 'millions' | 'billions';
  decimals?: number;
};

export interface AssumptionChipsProps {
  assumptions: AssumptionChip[];
  className?: string;
}

/**
 * Assumption Chips - Renders chips like WACC, tax, horizon, leverage, premium
 * 
 * Hides empty chips (no "Capex: —").
 * Consistent styling across models.
 */
export function AssumptionChips({
  assumptions,
  className = '',
}: AssumptionChipsProps) {
  // Filter out null/undefined values
  const validAssumptions = assumptions.filter(
    (a) => a.value !== null && a.value !== undefined && a.value !== ''
  );

  if (validAssumptions.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {validAssumptions.map((assumption, idx) => {
        const formattedValue = formatValue(assumption.value, assumption.format, {
          unit: assumption.unit,
          decimals: assumption.decimals,
        });

        return (
          <Badge
            key={idx}
            variant="outline"
            className="border-[var(--cb-border-subtle)] text-[var(--cb-text-secondary)] text-xs"
          >
            {assumption.label}: {formattedValue}
          </Badge>
        );
      })}
    </div>
  );
}
