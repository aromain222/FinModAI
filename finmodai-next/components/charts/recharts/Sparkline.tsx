'use client';

import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import type { ChartPoint } from '@/lib/charts/normalizeChartSeries';

export function Sparkline({
  data,
  color = 'rgba(255,255,255,0.75)',
}: {
  data: ChartPoint[];
  color?: string;
}) {
  const compact = useMemo(() => {
    if (!Array.isArray(data)) return [];
    // downsample to max 60 points
    const max = 60;
    if (data.length <= max) return data;
    const step = Math.ceil(data.length / max);
    return data.filter((_, i) => i % step === 0);
  }, [data]);

  if (compact.length < 2) return null;

  return (
    <div style={{ width: '100%', height: 36 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={compact}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
