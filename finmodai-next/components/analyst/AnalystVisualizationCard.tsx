'use client';

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalystVisualizationPayload } from '@/lib/analyst/visualization';
import { validateFinanceChartSpec, type FinanceAxisFormat, type FinanceChartSpec } from '@/lib/charts/financeChartSpec';

function formatValue(value: number, format?: FinanceAxisFormat, currencyCode = 'USD', decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: Math.abs(value) >= 100 ? 0 : Math.min(decimals, 2),
        maximumFractionDigits: Math.abs(value) >= 100 ? 0 : Math.min(decimals, 2),
      }).format(value);
    case 'percent':
      return `${value.toFixed(decimals)}%`;
    case 'multiple':
      return `${value.toFixed(decimals)}x`;
    case 'date':
    case 'string':
      return String(value);
    case 'number':
    default:
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
      });
  }
}

function VisualizationPanel({ panel }: { panel: NonNullable<AnalystVisualizationPayload['panels']>[number] }) {
  const spec = validateFinanceChartSpec(panel.spec);
  if (!spec) {
    return (
      <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 p-4 text-sm text-amber-900">
        Chart spec is invalid for this visualization panel.
      </div>
    );
  }

  const formatting = spec.formatting ?? {};
  const leftFormat = formatting.yLeftFormat ?? spec.series.find((item) => item.axis !== 'right')?.format ?? 'number';
  const rightFormat = formatting.yRightFormat ?? spec.series.find((item) => item.axis === 'right')?.format ?? 'number';
  const hasRightAxis = spec.series.some((series) => series.axis === 'right');

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-[var(--cb-text-primary)]">{spec.title}</div>
        {spec.subtitle ? <div className="mt-1 text-xs text-[var(--cb-text-muted)]">{spec.subtitle}</div> : null}
      </div>
      <div style={{ height: panel.height ?? 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={spec.data} margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fill: 'rgba(244,244,245,0.72)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              label={
                spec.xLabel
                  ? { value: spec.xLabel, position: 'insideBottom', offset: -4, fill: 'rgba(244,244,245,0.5)', fontSize: 11 }
                  : undefined
              }
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: 'rgba(244,244,245,0.72)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              tickFormatter={(value) =>
                formatValue(Number(value), leftFormat, formatting.currencyCode, formatting.decimals ?? 1)
              }
              label={
                spec.yLabel
                  ? {
                      value: spec.yLabel,
                      angle: -90,
                      position: 'insideLeft',
                      fill: 'rgba(244,244,245,0.5)',
                      fontSize: 11,
                      textAnchor: 'middle',
                    }
                  : undefined
              }
            />
            {hasRightAxis ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: 'rgba(244,244,245,0.72)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                tickFormatter={(value) =>
                  formatValue(Number(value), rightFormat, formatting.currencyCode, formatting.decimals ?? 1)
                }
                label={
                  spec.yRightLabel
                    ? {
                        value: spec.yRightLabel,
                        angle: 90,
                        position: 'insideRight',
                        fill: 'rgba(244,244,245,0.5)',
                        fontSize: 11,
                        textAnchor: 'middle',
                      }
                    : undefined
                }
              />
            ) : null}
            <Tooltip
              contentStyle={{
                background: 'rgba(9, 9, 11, 0.96)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                color: '#f4f4f5',
              }}
              formatter={(value, name) => {
                const series = spec.series.find((item) => item.label === name || item.key === name);
                const seriesFormat = series?.axis === 'right' ? rightFormat : leftFormat;
                return [
                  formatValue(Number(value), series?.format ?? seriesFormat, formatting.currencyCode, formatting.decimals ?? 1),
                  series?.label ?? String(name),
                ];
              }}
            />
            <Legend wrapperStyle={{ color: 'rgba(244,244,245,0.72)', fontSize: 12 }} />
            {spec.series.map((series) => {
              const seriesType = series.renderAs ?? spec.chartType;
              const color = series.color ?? '#60a5fa';
              if (seriesType === 'bar') {
                return (
                  <Bar
                    key={series.key}
                    yAxisId={series.axis === 'right' ? 'right' : 'left'}
                    dataKey={series.key}
                    name={series.label}
                    fill={color}
                    radius={[6, 6, 0, 0]}
                  >
                    {spec.data.map((_, idx) => (
                      <Cell key={`${series.key}-${idx}`} fill={color} />
                    ))}
                  </Bar>
                );
              }
              if (seriesType === 'area') {
                return (
                  <Area
                    key={series.key}
                    yAxisId={series.axis === 'right' ? 'right' : 'left'}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.18}
                  />
                );
              }
              if (seriesType === 'scatter') {
                return (
                  <Scatter
                    key={series.key}
                    yAxisId={series.axis === 'right' ? 'right' : 'left'}
                    dataKey={series.key}
                    name={series.label}
                    fill={color}
                  />
                );
              }
              return (
                <Line
                  key={series.key}
                  yAxisId={series.axis === 'right' ? 'right' : 'left'}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={color}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {spec.note ? <div className="mt-3 text-xs text-[var(--cb-text-muted)]">{spec.note}</div> : null}
    </div>
  );
}

export function AnalystVisualizationCard({ payload }: { payload: AnalystVisualizationPayload }) {
  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle className="text-base">{payload.title}</CardTitle>
        <CardDescription>{payload.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-sm text-[var(--cb-text-primary)]">
          <span className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Context</span>
          <div className="mt-1">{payload.contextLabel}</div>
        </div>
        {payload.panels.length > 0 ? (
          <div className="space-y-4">
            {payload.panels.map((panel) => (
              <VisualizationPanel key={panel.id} panel={panel} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
            No standalone chart template exists yet for this artifact.
          </div>
        )}
        {payload.notes.length > 0 ? (
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Chart Notes</div>
            <ul className="space-y-2 text-sm text-[var(--cb-text-primary)]">
              {payload.notes.map((note) => (
                <li key={note}>- {note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
