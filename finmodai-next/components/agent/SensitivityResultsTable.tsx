'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OneWaySensitivityResult } from '@/lib/modeling/sensitivity';
import { formatCurrencyCompact, formatPercent } from '@/lib/format/number';

type SensitivityResultsTableProps = {
  result: OneWaySensitivityResult;
};

export function SensitivityResultsTable({ result }: SensitivityResultsTableProps) {
  const formatValue = (value: number): string => {
    return formatCurrencyCompact(value, 1);
  };

  const formatPercentChange = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${formatPercent(value, 1)}`;
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700">
            <TableHead className="text-slate-300">Input</TableHead>
            <TableHead className="text-slate-300">Base Value</TableHead>
            <TableHead className="text-slate-300">Down (-10%)</TableHead>
            <TableHead className="text-slate-300">Metric (Down)</TableHead>
            <TableHead className="text-slate-300">Up (+10%)</TableHead>
            <TableHead className="text-slate-300">Metric (Up)</TableHead>
            <TableHead className="text-slate-300">Impact Down</TableHead>
            <TableHead className="text-slate-300">Impact Up</TableHead>
            <TableHead className="text-slate-300">Max Impact</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.impacts.map((impact) => (
            <TableRow key={impact.input_key} className="border-slate-700/50">
              <TableCell className="font-medium text-white">{impact.input_label}</TableCell>
              <TableCell className="text-slate-300">{formatValue(impact.base_value)}</TableCell>
              <TableCell className="text-slate-300">{formatValue(impact.down_value)}</TableCell>
              <TableCell className="text-slate-300">
                {impact.metric_down !== null ? formatValue(impact.metric_down) : '—'}
              </TableCell>
              <TableCell className="text-slate-300">{formatValue(impact.up_value)}</TableCell>
              <TableCell className="text-slate-300">
                {impact.metric_up !== null ? formatValue(impact.metric_up) : '—'}
              </TableCell>
              <TableCell className={cn('text-sm', impact.delta_down < 0 ? 'text-rose-400' : 'text-emerald-400')}>
                <div className="flex items-center gap-1">
                  {impact.delta_down < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                  {formatValue(impact.delta_down)} ({formatPercentChange(impact.impact_down_pct)})
                </div>
              </TableCell>
              <TableCell className={cn('text-sm', impact.delta_up < 0 ? 'text-rose-400' : 'text-emerald-400')}>
                <div className="flex items-center gap-1">
                  {impact.delta_up < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                  {formatValue(impact.delta_up)} ({formatPercentChange(impact.impact_up_pct)})
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-mono text-xs',
                    impact.abs_max_impact >= 100_000_000
                      ? 'border-rose-500/50 text-rose-300'
                      : impact.abs_max_impact >= 10_000_000
                      ? 'border-amber-500/50 text-amber-300'
                      : 'border-slate-600/50 text-slate-400'
                  )}
                >
                  {formatValue(impact.abs_max_impact)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

