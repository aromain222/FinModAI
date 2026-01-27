'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChartSpec } from '@/types/chartSpecs';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';

type Props = {
  charts: ChartSpec[];
  title?: string | null;
  density?: 'default' | 'compact';
  chartHeightClass?: string;
};

const colors = ['#10b981', '#60a5fa', '#f59e0b', '#f87171', '#a78bfa'];

const formatTooltip = (value: any) => (value === null || value === undefined ? '—' : value);

function LineChartCard({
  density,
  chartHeightClass,
  ...spec
}: Extract<ChartSpec, { type: 'line' }> & { density: Props['density']; chartHeightClass: string }) {
  return (
    <Card className="border border-white/10 bg-black/60">
      <CardHeader className={density === 'compact' ? 'p-3 pb-2' : undefined}>
        <CardTitle className={density === 'compact' ? 'text-xs text-white' : 'text-sm text-white'}>
          {spec.title}
        </CardTitle>
      </CardHeader>
      <CardContent className={`${chartHeightClass} ${density === 'compact' ? 'p-3 pt-0' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spec.data}>
            <XAxis dataKey={spec.xKey} stroke="#cbd5f5" />
            <YAxis stroke="#cbd5f5" />
            <Tooltip formatter={formatTooltip} />
            <Legend />
            {spec.series.map((s, idx) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? colors[idx % colors.length]} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function BarChartCard({
  density,
  chartHeightClass,
  ...spec
}: Extract<ChartSpec, { type: 'bar' }> & { density: Props['density']; chartHeightClass: string }) {
  return (
    <Card className="border border-white/10 bg-black/60">
      <CardHeader className={density === 'compact' ? 'p-3 pb-2' : undefined}>
        <CardTitle className={density === 'compact' ? 'text-xs text-white' : 'text-sm text-white'}>
          {spec.title}
        </CardTitle>
      </CardHeader>
      <CardContent className={`${chartHeightClass} ${density === 'compact' ? 'p-3 pt-0' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={spec.data}>
            <XAxis dataKey={spec.xKey} stroke="#cbd5f5" />
            <YAxis stroke="#cbd5f5" />
            <Tooltip formatter={formatTooltip} />
            <Legend />
            {spec.series.map((s, idx) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? colors[idx % colors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function WaterfallChartCard({
  density,
  chartHeightClass,
  ...spec
}: Extract<ChartSpec, { type: 'waterfall' }> & { density: Props['density']; chartHeightClass: string }) {
  const data = spec.steps.map((s, idx) => ({ label: s.label, value: s.value, idx }));
  return (
    <Card className="border border-white/10 bg-black/60">
      <CardHeader className={density === 'compact' ? 'p-3 pb-2' : undefined}>
        <CardTitle className={density === 'compact' ? 'text-xs text-white' : 'text-sm text-white'}>
          {spec.title}
        </CardTitle>
      </CardHeader>
      <CardContent className={`${chartHeightClass} ${density === 'compact' ? 'p-3 pt-0' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="label" stroke="#cbd5f5" />
            <YAxis stroke="#cbd5f5" />
            <Tooltip formatter={formatTooltip} />
            <Bar dataKey="value" name="Value" fill={colors[0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function HeatmapChartCard({
  density,
  chartHeightClass,
  ...spec
}: Extract<ChartSpec, { type: 'heatmap' }> & { density: Props['density']; chartHeightClass: string }) {
  const maxVal = Math.max(...spec.values.flat().map((v) => Math.abs(v || 0)), 1);
  return (
    <Card className="border border-white/10 bg-black/60">
      <CardHeader className={density === 'compact' ? 'p-3 pb-2' : undefined}>
        <CardTitle className={density === 'compact' ? 'text-xs text-white' : 'text-sm text-white'}>
          {spec.title}
        </CardTitle>
      </CardHeader>
      <CardContent className={`${chartHeightClass} ${density === 'compact' ? 'p-3 pt-0' : ''} overflow-auto space-y-2`}>
        <div className="text-[11px] text-slate-400 flex gap-2">
          <span>WACC/Rows</span>
          <span>Growth/Cols</span>
        </div>
        <div className="overflow-auto rounded-lg border border-white/10">
          <table className="min-w-full text-[11px] text-slate-200">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left"> </th>
                {spec.xLabels.map((x) => (
                  <th key={x} className="px-2 py-1 text-left">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.yLabels.map((y, rowIdx) => (
                <tr key={y} className="border-t border-white/5">
                  <td className="px-2 py-1 font-semibold">{y}</td>
                  {spec.xLabels.map((x, colIdx) => {
                    const val = spec.values[rowIdx]?.[colIdx] ?? 0;
                    const intensity = Math.min(1, Math.abs(val) / maxVal);
                    const bg = `rgba(16,185,129,${0.1 + intensity * 0.4})`;
                    return (
                      <td key={`${y}-${x}`} className="px-2 py-1" style={{ background: bg }}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function PreviewChartsPanel({
  charts,
  title = 'Charts',
  density = 'default',
  chartHeightClass = 'h-64',
}: Props) {
  return (
    <div className={density === 'compact' ? 'space-y-2' : 'space-y-3'}>
      {title ? <div className="text-sm font-semibold text-white">{title}</div> : null}
      {charts.length === 0 ? (
        <div className={`text-xs text-slate-400 rounded-md border border-white/10 bg-black/50 ${density === 'compact' ? 'p-3' : 'p-3'}`}>
          Charts will appear once outputs are available.
        </div>
      ) : (
        <div className={density === 'compact' ? 'grid gap-3 md:grid-cols-2' : 'grid gap-3 md:grid-cols-2'}>
          {charts.map((chart, idx) => {
            switch (chart.type) {
              case 'line':
                return (
                  <LineChartCard
                    key={`${chart.title}-${idx}`}
                    {...chart}
                    density={density}
                    chartHeightClass={chartHeightClass}
                  />
                );
              case 'bar':
                return (
                  <BarChartCard
                    key={`${chart.title}-${idx}`}
                    {...chart}
                    density={density}
                    chartHeightClass={chartHeightClass}
                  />
                );
              case 'waterfall':
                return (
                  <WaterfallChartCard
                    key={`${chart.title}-${idx}`}
                    {...chart}
                    density={density}
                    chartHeightClass={chartHeightClass}
                  />
                );
              case 'heatmap':
                return (
                  <HeatmapChartCard
                    key={`${chart.title}-${idx}`}
                    {...chart}
                    density={density}
                    chartHeightClass={chartHeightClass}
                  />
                );
              default:
                return null;
            }
          })}
        </div>
      )}
    </div>
  );
}
