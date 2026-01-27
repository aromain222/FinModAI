'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export function PriceLineChart({ data }: { data: Array<{ t: number; v: number }> }) {
  const rows = data.map((p) => ({
    t: p.t,
    v: p.v,
    d: new Date(p.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 10, right: 16, bottom: 10, left: 8 }}>
        <CartesianGrid strokeOpacity={0.15} vertical={false} stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="t"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(ms) =>
            new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          }
          tick={{ fill: 'rgba(255,255,255,0.75)', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.25)' }}
          tickLine={{ stroke: 'rgba(255,255,255,0.25)' }}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.75)', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.25)' }}
          tickLine={{ stroke: 'rgba(255,255,255,0.25)' }}
          width={48}
        />
        <Tooltip
          labelFormatter={(ms) => new Date(Number(ms)).toLocaleString()}
          formatter={(value: any) => [Number(value).toFixed(2), 'Value']}
          contentStyle={{
            background: 'rgba(11, 15, 23, 0.95)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12,
          }}
          itemStyle={{ color: 'rgba(255,255,255,0.9)' }}
          labelStyle={{ color: 'rgba(255,255,255,0.75)' }}
        />
        <Line
          type="monotone"
          dataKey="v"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          stroke="#1890ff"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
