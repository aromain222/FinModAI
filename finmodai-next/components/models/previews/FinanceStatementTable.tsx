"use client";

/**
 * FinanceStatementTable — Finance-grade statement preview
 * Sticky first column + header; section/line/total rows; same order as Excel.
 * No "—" in numeric cells; use blank. Optional tooltip and $ / % of revenue.
 */

import React, { useMemo, useState } from 'react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StatementRowSchema, CellFormat } from '@/lib/modelFormat';
import { formatCellDisplay } from '@/lib/modelFormat';
import { DEMO_UNIT_LABEL, demoApproxB } from '@/lib/format/demoFinance';

export interface FinanceStatementTableProps {
  title: string;
  schema: StatementRowSchema[];
  data: Record<string, number[]>;
  years: number[];
  /** e.g. "Demo assumption" or "Reported" */
  sourceLabel?: string;
  /** Show % of revenue in a second row set */
  showPctOfRevenue?: boolean;
  revenueKey?: string;
  compact?: boolean;
  className?: string;
}

export function FinanceStatementTable({
  title,
  schema,
  data,
  years,
  sourceLabel = 'Demo assumption',
  showPctOfRevenue = false,
  revenueKey = 'revenue',
  compact = false,
  className = '',
}: FinanceStatementTableProps) {
  const [viewMode, setViewMode] = useState<'currency' | 'pct'>('currency');
  const revenues = data[revenueKey] ?? [];

  const rows = useMemo(() => {
    return schema.filter((r) => r.kind !== 'spacer');
  }, [schema]);

  const cellValue = (
    key: string,
    colIndex: number,
    asPct: boolean,
    displayNegative?: boolean,
    format: CellFormat = 'currency'
  ): string => {
    const values = data[key] ?? [];
    const val = values[colIndex];
    if (asPct && revenues[colIndex] != null && revenues[colIndex] !== 0 && typeof val === 'number') {
      const pct = val / revenues[colIndex];
      return formatCellDisplay(pct, 'percent', { displayNegative: false, decimals: 1 });
    }
    return formatCellDisplay(val, format, { displayNegative, decimals: format === 'currency' || format === 'integer' ? 0 : undefined });
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{DEMO_UNIT_LABEL}</p>
        </div>
        {showPctOfRevenue && (
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('currency')}
              className={`px-2 py-1 text-xs ${viewMode === 'currency' ? 'bg-muted font-medium' : 'bg-background text-muted-foreground'}`}
            >
              $
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pct')}
              className={`px-2 py-1 text-xs ${viewMode === 'pct' ? 'bg-muted font-medium' : 'bg-background text-muted-foreground'}`}
            >
              % rev
            </button>
          </div>
        )}
      </div>

      <div className="border border-border rounded-md overflow-hidden bg-background" role="table" aria-label={`${title}, ${DEMO_UNIT_LABEL}`}>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <TableHead className="w-[220px] min-w-[220px] font-semibold text-left">
                  Line Item
                </TableHead>
                {years.map((y) => (
                  <TableHead
                    key={y}
                    className="text-right font-semibold w-[100px] min-w-[100px]"
                  >
                    <span>{y}</span>
                    <span className="block text-[10px] font-normal text-muted-foreground">USD mm</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, rowIdx) => {
                const isSection = r.kind === 'section';
                const isTotal = r.kind === 'total';
                const indent = (r.indent ?? 0) * (compact ? 12 : 16);

                const labelCell = (
                  <TableCell
                    className={`sticky left-0 z-[5] bg-background text-left font-mono text-sm border-r border-border ${
                      isSection ? 'bg-muted font-semibold' : ''
                    } ${isTotal ? 'font-bold border-t border-border' : ''}`}
                    style={{ paddingLeft: indent + 12 }}
                  >
                    {r.tooltip ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="underline decoration-dotted cursor-help">
                              {r.label || '\u00A0'}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p>{r.tooltip}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Source: {sourceLabel}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      r.label || '\u00A0'
                    )}
                  </TableCell>
                );

                return (
                  <TableRow
                    key={r.key}
                    className={isTotal ? 'border-t border-border' : ''}
                  >
                    {labelCell}
                    {years.map((_, colIdx) => {
                      const displayVal =
                        r.kind === 'section'
                          ? ''
                          : cellValue(
                              r.key,
                              colIdx,
                              showPctOfRevenue && viewMode === 'pct',
                              r.displayNegative,
                              r.format ?? 'currency'
                            );
                      const rawVal = (data[r.key] ?? [])[colIdx];
                      const showApproxB = r.format === 'currency' && typeof rawVal === 'number' && Math.abs(rawVal) > 100_000;
                      const approxB = showApproxB ? demoApproxB(rawVal) : '';
                      return (
                        <TableCell
                          key={colIdx}
                          className={`text-right font-mono text-sm tabular-nums ${
                            isTotal ? 'font-bold' : ''
                          } ${compact ? 'py-1' : 'py-2'}`}
                        >
                          <span>{displayVal}</span>
                          {approxB ? (
                            <span className="block text-[10px] font-normal text-muted-foreground" title="Display-only; value in USD millions">{approxB}</span>
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 px-1">All figures in {DEMO_UNIT_LABEL}. Revenue, EBITDA, EBIT, FCF: integers; %: 1 decimal.</p>
      </div>
    </div>
  );
}
