'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '@/lib/utils';
import type { OneWaySensitivityResult } from '@/lib/modeling/sensitivity';

type TornadoChartProps = {
  result: OneWaySensitivityResult;
};

export function TornadoChart({ result }: TornadoChartProps) {
  // Transform data for tornado chart (bars extending left and right from center)
  const chartData = result.impacts
    .map((impact) => {
      // Use negative for down, positive for up to create tornado effect
      return {
        input: impact.input_label,
        down: -Math.abs(impact.delta_down),
        up: Math.abs(impact.delta_up),
        downPct: impact.impact_down_pct,
        upPct: impact.impact_up_pct,
        absMaxImpact: impact.abs_max_impact,
      };
    })
    .reverse(); // Reverse to show highest impact at top

  const formatValue = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
    return `${abs.toFixed(2)}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    return (
      <div className="rounded-lg border border-white/20 bg-slate-900 p-3 shadow-lg">
        <p className="font-semibold text-white">{data.input}</p>
        {payload.find((p: any) => p.dataKey === 'down') && (
          <p className="text-rose-400">
            Down: {formatValue(data.down)} ({data.downPct.toFixed(1)}%)
          </p>
        )}
        {payload.find((p: any) => p.dataKey === 'up') && (
          <p className="text-emerald-400">
            Up: {formatValue(data.up)} ({data.upPct.toFixed(1)}%)
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={Math.max(300, result.impacts.length * 40)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis
            type="number"
            stroke="#64748b"
            tick={{ fill: '#94a3b8' }}
            tickFormatter={(value) => formatValue(value)}
          />
          <YAxis
            type="category"
            dataKey="input"
            stroke="#64748b"
            tick={{ fill: '#94a3b8' }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="down" fill="#ef4444" name="Down" />
          <Bar dataKey="up" fill="#10b981" name="Up" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-rose-500" />
          <span>Down (-10%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-emerald-500" />
          <span>Up (+10%)</span>
        </div>
      </div>
    </div>
  );
}

