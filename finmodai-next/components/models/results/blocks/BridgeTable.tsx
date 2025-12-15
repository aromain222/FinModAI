"use client";

import React from 'react';
import { formatValue, FormatType } from '@/lib/format/finance';

export type BridgeLine = {
  label: string;
  value: number | null | undefined;
  format: FormatType;
  unit?: 'raw' | 'thousands' | 'millions' | 'billions';
  decimals?: number;
  isSubtotal?: boolean; // Adds border-top
  isTotal?: boolean; // Adds border-top and bold
};

export interface BridgeTableProps {
  title: string;
  lines: BridgeLine[];
  className?: string;
}

/**
 * Bridge Table - Shows a calculation bridge (e.g., EV → Equity → Per Share)
 * 
 * Used for:
 * - DCF: PV FCF → PV TV → EV → Net Debt → Equity → Per Share
 * - LBO: Sources → Uses
 * - Merger: EPS Bridge
 */
export function BridgeTable({
  title,
  lines,
  className = '',
}: BridgeTableProps) {
  if (lines.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">
        {title}
      </h3>
      <div className="space-y-1 text-sm">
        {lines.map((line, idx) => {
          const isSubtotal = line.isSubtotal || false;
          const isTotal = line.isTotal || false;

          return (
            <div
              key={idx}
              className={`flex justify-between items-center py-1.5 ${
                isSubtotal || isTotal
                  ? 'border-t border-[var(--cb-border-subtle)] pt-2 mt-1'
                  : ''
              }`}
            >
              <span
                className={`text-[var(--cb-text-secondary)] ${
                  isTotal ? 'font-semibold text-[var(--cb-text-primary)]' : ''
                }`}
              >
                {line.label}
              </span>
              <span
                className={`font-medium text-[var(--cb-text-primary)] ${
                  isTotal ? 'font-bold' : ''
                }`}
              >
                {formatValue(line.value, line.format, {
                  unit: line.unit,
                  decimals: line.decimals,
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
