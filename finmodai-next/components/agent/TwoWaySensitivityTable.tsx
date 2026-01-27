'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { TwoWaySensitivityGrid } from '@/lib/modeling/sensitivity';

type TwoWaySensitivityTableProps = {
  result: TwoWaySensitivityGrid;
};

export function TwoWaySensitivityTable({ result }: TwoWaySensitivityTableProps) {
  const formatValue = (value: number | null): string => {
    if (value === null || !Number.isFinite(value)) return '—';
    if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };

  const formatInputValue = (value: number): string => {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // Find min/max for color coding
  const allValues = result.grid.flat().filter((v): v is number => v !== null && Number.isFinite(v));
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;
  const range = maxValue - minValue || 1;

  const getHeatColor = (value: number | null): string => {
    if (value === null || !Number.isFinite(value)) return 'bg-slate-900/50';
    const ratio = (value - minValue) / range;
    // Interpolate from red (low) to green (high)
    if (ratio < 0.5) {
      const r = Math.round(239 + (239 - 239) * (1 - ratio * 2));
      const g = Math.round(68 + (68 - 68) * (1 - ratio * 2));
      const b = Math.round(68 + (68 - 68) * (1 - ratio * 2));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const r = Math.round(239 - (239 - 16) * ((ratio - 0.5) * 2));
      const g = Math.round(68 + (185 - 68) * ((ratio - 0.5) * 2));
      const b = Math.round(68 + (129 - 68) * ((ratio - 0.5) * 2));
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 text-sm text-slate-400">
        <div>
          <strong>X-Axis:</strong> {result.x_input_label} ({result.x_input_key})
        </div>
        <div>
          <strong>Y-Axis:</strong> {result.y_input_label} ({result.y_input_key})
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700">
            <TableHead className="text-slate-300 sticky left-0 z-10 bg-slate-900">
              {result.y_input_label} \ {result.x_input_label}
            </TableHead>
            {result.x_steps.map((xVal, idx) => (
              <TableHead key={idx} className="text-slate-300 text-xs min-w-[80px]">
                {formatInputValue(xVal)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.grid.map((row, yIdx) => (
            <TableRow key={yIdx} className="border-slate-700/50">
              <TableCell className="font-medium text-white sticky left-0 z-10 bg-slate-900 border-r border-slate-700">
                {formatInputValue(result.y_steps[yIdx])}
              </TableCell>
              {row.map((cell, xIdx) => (
                <TableCell
                  key={xIdx}
                  className={cn(
                    'text-center font-mono text-xs',
                    cell !== null && Number.isFinite(cell) ? 'text-white' : 'text-slate-500'
                  )}
                  style={{
                    backgroundColor: cell !== null && Number.isFinite(cell) ? `${getHeatColor(cell)}20` : undefined,
                    color: cell !== null && Number.isFinite(cell) ? getHeatColor(cell) : undefined,
                  }}
                >
                  {formatValue(cell)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <div>Range: {formatValue(minValue)} to {formatValue(maxValue)}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: getHeatColor(minValue) }} />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: getHeatColor(maxValue) }} />
            <span>High</span>
          </div>
        </div>
      </div>
    </div>
  );
}

