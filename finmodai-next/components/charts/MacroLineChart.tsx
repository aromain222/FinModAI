'use client';

import { memo, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { format } from 'date-fns';

export type MacroPoint = {
  date: string; // ISO string
  value: number;
};

type MacroLineChartProps = {
  data: MacroPoint[];
  range: '1Y' | '5Y';
  height?: number;
};

/**
 * Reusable macro line chart component
 * 
 * Features:
 * - Adaptive X-axis labels (MMM for 1Y, yyyy for 5Y)
 * - Tooltip with proper date formatting
 * - Uses currentColor for stroke to match card styling
 * - No dots, clean line only
 * - Memoized to prevent unnecessary re-renders
 */
function MacroLineChartComponent({ data, range, height = 140 }: MacroLineChartProps) {
  // Memoize formatters to prevent recreation on every render
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const tickFormatter = useMemo(() => (d: string) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) {
        return d; // Fallback if date is invalid
      }
      return range === '1Y' ? format(dt, 'MMM') : format(dt, 'yyyy');
    } catch {
      return d;
    }
  }, [range]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const tooltipLabelFormatter = useMemo(() => (d: string) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) {
        return d;
      }
      return range === '1Y' ? format(dt, 'MMM yyyy') : format(dt, 'yyyy');
    } catch {
      return d;
    }
  }, [range]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[140px] text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart 
        data={data} 
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
      >
        <XAxis
          dataKey="date"
          tickFormatter={tickFormatter}
          tickLine={false}
          axisLine={false}
          minTickGap={18}
          style={{ fontSize: 11 }}
        />
        <YAxis 
          hide 
          domain={['auto', 'auto']} 
        />
        <Tooltip
          labelFormatter={tooltipLabelFormatter}
          formatter={(v: any) => [Number(v).toFixed(2), '']}
          contentStyle={{
            backgroundColor: 'var(--cb-surface)',
            border: '1px solid var(--cb-border-subtle)',
            borderRadius: '6px',
            padding: '8px',
          }}
          labelStyle={{
            color: 'var(--cb-text-primary)',
            fontSize: '12px',
            fontWeight: 500,
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="currentColor"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Memoize the component to prevent re-renders when parent re-renders but props haven't changed
export const MacroLineChart = memo(MacroLineChartComponent, (prevProps, nextProps) => {
  // Custom comparison: only re-render if data, range, or height actually changed
  return (
    prevProps.range === nextProps.range &&
    prevProps.height === nextProps.height &&
    prevProps.data.length === nextProps.data.length &&
    prevProps.data.every((point, i) => {
      const nextPoint = nextProps.data[i];
      return nextPoint && point.date === nextPoint.date && point.value === nextPoint.value;
    })
  );
});

