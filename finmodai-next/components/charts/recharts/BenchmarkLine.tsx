'use client';

import React, { useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format } from 'date-fns';
import { ChartFrame } from '@/components/charts/ChartFrame';
import type { ChartPoint } from '@/lib/charts/normalizeChartSeries';
import type { RangeKey } from '@/lib/charts/ranges';

export type ScaleKey = 'Price' | 'Return%';

export type Series = {
  name: string;        // "SPY"
  color: string;       // stroke color
  data: ChartPoint[];  // canonical points
};

export interface BenchmarkLineProps {
  // Support both single data (backward compatible) and multiple series
  data?: ChartPoint[]; // canonical: {time:number,value:number}[]
  series?: Series[];   // multiple series for comparison
  range: RangeKey;
  scale: ScaleKey;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  label?: string;
  strokeColor?: string;
  compact?: boolean;   // Enable compact mode for dashboard cards
}

/** X-axis tick labels */
function formatXAxisLabel(value: any, range: RangeKey): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    if (range === '1D') return format(date, 'HH:mm');
    if (range === 'YTD' || range === '1Y') return format(date, 'MMM');
    return format(date, 'MMM d'); // 1W,1M,3M
  } catch {
    return '';
  }
}

/** Tooltip label */
function formatTooltipLabel(value: any, range: RangeKey): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return format(date, range === '1D' ? 'HH:mm' : 'MMM d, yyyy');
  } catch {
    return String(value);
  }
}

/** Y-axis values */
function formatYAxis(value: any, scale: ScaleKey): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (scale === 'Return%') return `${(value * 100).toFixed(2)}%`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** Compute Y-axis domain for zooming on shorter ranges */
function computeYDomain(
  data: { value: number }[],
  scale: ScaleKey,
  range: RangeKey
): [number, number] | ['auto', 'auto'] {
  if (data.length < 2) return ['auto', 'auto'];

  // Only zoom for shorter ranges
  if (!['1W', '1M', '3M'].includes(range)) {
    return ['auto', 'auto'];
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return ['auto', 'auto'];
  }

  const padding = scale === 'Return%'
    ? 0.02
    : (max - min) * 0.05;

  return [min - padding, max + padding];
}

/** Volatility bands helper */
type BandPoint = {
  time: number;
  value: number;
  upper?: number;
  lower?: number;
};

function addVolBands(
  data: { time: number; value: number }[],
  windowSize: number,
  k: number
): BandPoint[] {
  if (data.length < 3) return data as BandPoint[];

  const out: BandPoint[] = data.map((d) => ({ ...d }));
  const values = data.map((d) => d.value);

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);

    if (slice.length < Math.min(windowSize, 5)) continue;

    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance =
      slice.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / slice.length;
    const sd = Math.sqrt(variance);

    if (!Number.isFinite(mean) || !Number.isFinite(sd)) continue;

    out[i].upper = mean + k * sd;
    out[i].lower = mean - k * sd;
  }

  return out;
}

/** Align multiple series by time for comparison */
function alignSeries(series: Series[]): Array<Record<string, number | null>> {
  const timeSet = new Set<number>();
  for (const s of series) {
    for (const p of s.data) {
      timeSet.add(p.time);
    }
  }

  const times = Array.from(timeSet).sort((a, b) => a - b);

  return times.map((t) => {
    const row: Record<string, number | null> = { time: t };
    for (const s of series) {
      const match = s.data.find((p) => p.time === t);
      row[s.name] = match ? match.value : null;
    }
    return row;
  });
}

/** Tooltip values */
function formatTooltipValue(value: any, scale: ScaleKey): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '—';
  if (scale === 'Return%') return `${(num * 100).toFixed(2)}%`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: any;
  range: RangeKey;
  scale: ScaleKey;
  isMultiSeries?: boolean;
}> = ({ active, payload, label, range, scale, isMultiSeries }) => {
  if (!active || !payload || payload.length === 0) return null;

  const formattedLabel = formatTooltipLabel(label, range);

  return (
    <div
      style={{
        backgroundColor: '#0b0f17',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
      }}
    >
      <p style={{ color: '#e5e7eb', fontSize: '12px', fontWeight: 500, marginBottom: '8px' }}>
        {formattedLabel}
      </p>
      {isMultiSeries ? (
        // Multi-series: show all values
        payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p, idx) => (
            <p
              key={idx}
              style={{
                color: p.color || '#fff',
                fontSize: '14px',
                fontWeight: 600,
                margin: '4px 0',
              }}
            >
              {p.dataKey}: {formatTooltipValue(p.value, scale)}
            </p>
          ))
      ) : (
        // Single series: show single value
        <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: 0 }}>
          {formatTooltipValue(payload[0]?.value, scale)}
        </p>
      )}
    </div>
  );
};

export function BenchmarkLine({
  data,
  series,
  range,
  scale,
  loading = false,
  error = null,
  onRetry,
  label = 'Chart',
  strokeColor = '#1890ff',
  compact = false,
}: BenchmarkLineProps) {
  /**
   * ✅ HARD FORK TEST
   * If this renders, charts + layout are fine, and the bug is your Market Brief data pipeline.
   */
  const USE_HARDCODED = false;

  const hardcoded: ChartPoint[] = useMemo(() => {
    const now = Date.now();
    return [
      { time: now - 3 * 86400000, value: 100 },
      { time: now - 2 * 86400000, value: 103 },
      { time: now - 1 * 86400000, value: 101 },
      { time: now, value: 106 },
    ];
  }, []);

  // Determine if we're using multi-series mode
  const isMultiSeries = Array.isArray(series) && series.length > 0;
  
  // Process single data mode (backward compatible)
  const singleData = useMemo(() => {
    if (isMultiSeries) return [];
    const src = USE_HARDCODED ? hardcoded : (data || []);
    if (!Array.isArray(src)) return [];
    return src.filter(
      (p): p is ChartPoint =>
        p != null &&
        typeof p === 'object' &&
        typeof (p as any).time === 'number' &&
        typeof (p as any).value === 'number' &&
        Number.isFinite((p as any).time) &&
        Number.isFinite((p as any).value)
    );
  }, [USE_HARDCODED, hardcoded, data, isMultiSeries]);

  // Process multi-series mode
  const chartData = useMemo(() => {
    if (!isMultiSeries) return null;
    // Validate and filter series data
    const validSeries: Series[] = series
      .filter((s) => Array.isArray(s.data) && s.data.length > 0)
      .map((s) => ({
        ...s,
        data: s.data.filter(
          (p): p is ChartPoint =>
            p != null &&
            typeof p === 'object' &&
            typeof (p as any).time === 'number' &&
            typeof (p as any).value === 'number' &&
            Number.isFinite((p as any).time) &&
            Number.isFinite((p as any).value)
        ),
      }))
      .filter((s) => s.data.length > 0);
    
    if (validSeries.length === 0) return null;
    return alignSeries(validSeries);
  }, [isMultiSeries, series]);

  // Use appropriate data source
  const validData = isMultiSeries ? (chartData || []) : singleData;

  // Flatline detection (only for single series)
  const isFlatline = useMemo(() => {
    if (isMultiSeries) return false; // Skip for multi-series
    if (validData.length < 3) return false;
    // For multi-series chartData, check first series
    if (isMultiSeries && chartData) {
      const firstSeriesName = series?.[0]?.name;
      if (firstSeriesName) {
        const vals = chartData
          .map((d) => d[firstSeriesName])
          .filter((v): v is number => v !== null && typeof v === 'number');
        if (vals.length < 3) return false;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        return max - min === 0;
      }
    }
    // Single series mode
    const vals = (validData as ChartPoint[]).map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return max - min === 0;
  }, [validData, isMultiSeries, chartData, series]);

  const notEnoughData = validData.length > 0 && validData.length < 2;
  const hasData = validData.length >= 2 && !isFlatline;

  const displayError =
    error ||
    (notEnoughData
      ? 'Not enough data for this range'
      : isFlatline && validData.length > 0
      ? 'Chart shows constant values - data may be invalid'
      : null);

  const axisColor = '#ffffff';

  const chartKey = useMemo(() => {
    if (isMultiSeries && chartData) {
      const first = chartData[0];
      const last = chartData[chartData.length - 1];
      return `${label}:${range}:${scale}:${chartData.length}:${first?.time ?? 0}:${last?.time ?? 0}:MULTI`;
    }
    const first = singleData[0];
    const last = singleData[singleData.length - 1];
    return `${label}:${range}:${scale}:${singleData.length}:${first?.time ?? 0}:${last?.time ?? 0}:${USE_HARDCODED ? 'H' : 'L'}`;
  }, [label, range, scale, isMultiSeries, chartData, singleData, USE_HARDCODED]);

  // Unique gradient ID per chart instance
  const gradientId = useMemo(() => `cbLineFill-${chartKey}`, [chartKey]);

  // For Y-domain calculation, use first series in multi-series mode
  const domainData = useMemo(() => {
    if (isMultiSeries && chartData) {
      const firstSeriesName = series?.[0]?.name;
      if (firstSeriesName) {
        return chartData
          .map((d) => ({ value: d[firstSeriesName] }))
          .filter((d) => d.value !== null && typeof d.value === 'number') as { value: number }[];
      }
    }
    return (validData as ChartPoint[]).map((p) => ({ value: p.value }));
  }, [isMultiSeries, chartData, series, validData]);

  const yDomain = useMemo(
    () => computeYDomain(domainData, scale, range),
    [domainData, scale, range]
  );

  // Volatility bands configuration (only for single series, Price scale)
  const bandWindow = useMemo(() => {
    // tune per range
    if (range === '1W') return 10;
    if (range === '1M') return 14;
    if (range === '3M') return 20;
    return 20;
  }, [range]);

  const bandedData = useMemo(() => {
    // Only show bands for single series, Price scale
    if (isMultiSeries || scale !== 'Price') return validData as any;
    return addVolBands(singleData, bandWindow, 2);
  }, [isMultiSeries, singleData, validData, bandWindow, scale]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    console.log('[BenchmarkLine] render', {
      USE_HARDCODED,
      count: validData.length,
      first: validData[0],
      last: validData.at(-1),
      hasData,
      displayError,
    });
  }, [USE_HARDCODED, validData, hasData, displayError]);

  return (
    <ChartFrame title={label} loading={loading} error={displayError} hasData={hasData} onRetry={onRetry}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          key={chartKey}
          data={bandedData}
          margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.22} />
              <stop offset="70%" stopColor={strokeColor} stopOpacity={0.06} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 6"
            stroke="rgba(255, 255, 255, 0.08)"
          />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => formatXAxisLabel(v, range)}
            tick={{ fill: axisColor, fontSize: 12 }}
            axisLine={{ stroke: axisColor, strokeWidth: 1 }}
            tickLine={{ stroke: axisColor }}
            tickCount={6}
            interval="preserveStartEnd"
            angle={validData.length > 10 ? -45 : 0}
            textAnchor={validData.length > 10 ? 'end' : 'middle'}
            height={validData.length > 10 ? 60 : 30}
          />
          <YAxis
            domain={yDomain}
            tickFormatter={(v) => formatYAxis(v, scale)}
            tick={{ fill: axisColor, fontSize: 12 }}
            axisLine={{ stroke: axisColor, strokeWidth: 1 }}
            tickLine={{ stroke: axisColor }}
            width={80}
          />
          <Tooltip content={<CustomTooltip range={range} scale={scale} isMultiSeries={isMultiSeries} />} />
          {/* Volatility band fill (only for single series, Price scale, non-compact) */}
          {!compact && !isMultiSeries && scale === 'Price' && (
            <>
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="rgba(255,255,255,0.06)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="rgba(0,0,0,0)"
                isAnimationActive={false}
              />
              {/* Upper/Lower lines */}
              <Line
                type="monotone"
                dataKey="upper"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="lower"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
            </>
          )}
          {/* Gradient area fill (only for single series, non-compact) */}
          {!compact && !isMultiSeries && (
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          )}
          {/* Render lines: multi-series or single */}
          {isMultiSeries && series ? (
            series.map((s) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={s.color}
                strokeWidth={compact ? 2 : 1.75}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={compact ? 2 : 1.75}
              dot={false}
              activeDot={compact ? false : { r: 3 }}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
