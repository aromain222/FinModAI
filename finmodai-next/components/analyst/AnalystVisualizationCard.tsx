'use client';

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalystVisualizationPayload } from '@/lib/analyst/visualization';

type PanelTrace = {
  type?: string;
  mode?: string;
  name?: string;
  x?: unknown[];
  y?: unknown[];
  text?: unknown[];
  marker?: { color?: string | string[] };
  line?: { color?: string };
  yaxis?: string;
};

type PanelLayout = {
  barmode?: string;
  yaxis?: { tickprefix?: string; ticksuffix?: string };
  yaxis2?: { tickprefix?: string; ticksuffix?: string };
};

type ChartSeriesConfig = {
  key: string;
  name: string;
  kind: 'bar' | 'line';
  color: string;
  axis: 'left' | 'right';
  barColors?: string[];
};

type ChartRow = {
  label: string;
  [key: string]: string | number | null | undefined;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatAxisValue(value: number, prefix?: string, suffix?: string): string {
  const compact = Math.abs(value) >= 1000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${prefix ?? ''}${compact}${suffix ?? ''}`;
}

function buildChartModel(panel: { data: Record<string, unknown>[]; layout?: Record<string, unknown> }) {
  const traces = panel.data as PanelTrace[];
  const layout = (panel.layout ?? {}) as PanelLayout;
  const rows = new Map<string, ChartRow>();
  const series: ChartSeriesConfig[] = [];

  traces.forEach((trace, traceIndex) => {
    const xValues = Array.isArray(trace.x) ? trace.x : [];
    const yValues = Array.isArray(trace.y) ? trace.y : [];
    const seriesKey = `series_${traceIndex}`;
    const name = trace.name ?? `Series ${traceIndex + 1}`;
    const kind = trace.type === 'bar' ? 'bar' : 'line';
    const axis = trace.yaxis === 'y2' ? 'right' : 'left';
    const color =
      typeof trace.line?.color === 'string'
        ? trace.line.color
        : typeof trace.marker?.color === 'string'
          ? trace.marker.color
          : '#60a5fa';
    const barColors = Array.isArray(trace.marker?.color)
      ? trace.marker?.color.filter((item): item is string => typeof item === 'string')
      : undefined;

    series.push({ key: seriesKey, name, kind, color, axis, barColors });

    xValues.forEach((rawLabel, idx) => {
      const label = String(rawLabel ?? `Point ${idx + 1}`);
      if (!rows.has(label)) rows.set(label, { label });
      rows.get(label)![seriesKey] = toNumber(yValues[idx]);
    });
  });

  return {
    data: Array.from(rows.values()),
    series,
    leftAxis: layout.yaxis,
    rightAxis: layout.yaxis2,
  };
}

function VisualizationPanel({
  panel,
}: {
  panel: NonNullable<AnalystVisualizationPayload['panels']>[number];
}) {
  const model = buildChartModel(panel);
  const hasRightAxis = model.series.some((series) => series.axis === 'right');

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-[var(--cb-text-primary)]">{panel.title}</div>
        {panel.subtitle ? (
          <div className="mt-1 text-xs text-[var(--cb-text-muted)]">{panel.subtitle}</div>
        ) : null}
      </div>
      <div style={{ height: panel.height ?? 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={model.data} margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(244,244,245,0.72)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: 'rgba(244,244,245,0.72)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              tickLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              tickFormatter={(value) =>
                formatAxisValue(Number(value), model.leftAxis?.tickprefix, model.leftAxis?.ticksuffix)
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
                  formatAxisValue(Number(value), model.rightAxis?.tickprefix, model.rightAxis?.ticksuffix)
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
                const series = model.series.find((item) => item.name === name);
                const axis = series?.axis === 'right' ? model.rightAxis : model.leftAxis;
                return [
                  formatAxisValue(Number(value), axis?.tickprefix, axis?.ticksuffix),
                  name,
                ];
              }}
            />
            <Legend wrapperStyle={{ color: 'rgba(244,244,245,0.72)', fontSize: 12 }} />
            {model.series.map((series) =>
              series.kind === 'line' ? (
                <Line
                  key={series.key}
                  yAxisId={series.axis}
                  type="monotone"
                  dataKey={series.key}
                  name={series.name}
                  stroke={series.color}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: series.color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              ) : (
                <Bar
                  key={series.key}
                  yAxisId={series.axis}
                  dataKey={series.key}
                  name={series.name}
                  fill={series.color}
                  radius={[6, 6, 0, 0]}
                >
                  {series.barColors?.length
                    ? model.data.map((_, idx) => (
                        <Cell key={`${series.key}-${idx}`} fill={series.barColors?.[idx] ?? series.color} />
                      ))
                    : null}
                </Bar>
              )
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
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
