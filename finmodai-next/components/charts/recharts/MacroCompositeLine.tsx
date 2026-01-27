'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
} from 'recharts';
import { format } from 'date-fns';
import { Empty, Skeleton, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { SeriesPoint } from '@/lib/charts/normalize';
import type { RangeKey } from '@/lib/charts/ranges';

export interface MacroCompositeLineProps {
  data: SeriesPoint[];
  range: RangeKey;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  label?: string;
  strokeColor?: string;
}

/**
 * Format timestamp for x-axis labels based on range
 * - 1D: HH:mm
 * - <=3M: MMM d
 * - YTD/1Y: MMM
 */
function formatXAxisLabel(value: any, range: RangeKey): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    if (range === '1D') {
      return format(date, 'HH:mm');
    }
    if (range === 'YTD' || range === '1Y') {
      return format(date, 'MMM');
    }
    // 1W, 1M, 3M
    return format(date, 'MMM d');
  } catch {
    return String(value);
  }
}

/**
 * Format timestamp for tooltip (more detailed)
 */
function formatTooltipLabel(value: any, range: RangeKey): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return format(date, range === '1D' ? 'HH:mm' : 'MMM d, yyyy');
  } catch {
    return String(value);
  }
}

/**
 * Format Y-axis value (always show 2 decimals for macro data)
 */
function formatYAxis(value: any): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

/**
 * Format tooltip value
 */
function formatTooltipValue(value: any): string {
  const numValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numValue)) return '—';
  return numValue.toFixed(2);
}

/**
 * Determine regime from composite value
 */
function getRegime(value: number): { name: string; color: string; implication: string } {
  if (value < 500) {
    return {
      name: 'Tightening',
      color: '#ef4444',
      implication: 'Conditions tightening vs prior month',
    };
  }
  if (value < 650) {
    return {
      name: 'Neutral',
      color: '#eab308',
      implication: 'Conditions neutral vs prior month',
    };
  }
  return {
    name: 'Accommodative',
    color: '#22c55e',
    implication: 'Conditions improving vs prior month',
  };
}

/**
 * Custom tooltip with regime and implication
 */
const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: any;
  range: RangeKey;
}> = ({ active, payload, label, range }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const value = payload[0].value;
  const formattedLabel = formatTooltipLabel(label, range);
  const formattedValue = formatTooltipValue(value);
  const regime = getRegime(Number(value));

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
      <p style={{ color: '#e5e7eb', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
        {formattedLabel}
      </p>
      <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
        Macro Composite: {formattedValue}
      </p>
      <p style={{ color: regime.color, fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
        Regime: {regime.name}
      </p>
      <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>
        {regime.implication}
      </p>
    </div>
  );
};

/**
 * Empty state component
 */
const EmptyState: React.FC<{ onRetry?: () => void; message?: string }> = ({ onRetry, message = 'No data available' }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3" style={{ minHeight: 200 }}>
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button
          icon={<ReloadOutlined />}
          onClick={onRetry}
          size="small"
        >
          Retry
        </Button>
      )}
    </div>
  );
};

/**
 * MacroCompositeLine - Recharts-based line chart for macro market composite data
 * 
 * Features:
 * - Dark mode styling with visible axes and gridlines
 * - Proper timestamp formatting based on range
 * - Empty/loading/error states
 */
export function MacroCompositeLine({
  data,
  range,
  height = 340,
  loading = false,
  error = null,
  onRetry,
  label,
  strokeColor = '#1890ff',
}: MacroCompositeLineProps) {
  // Validate and sort data
  const validData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    
    return data
      .filter((point) => {
        return point.t !== null && 
               point.t !== undefined && 
               point.v !== null && 
               point.v !== undefined && 
               Number.isFinite(point.t) && 
               Number.isFinite(point.v);
      })
      .sort((a, b) => a.t - b.t);
  }, [data]);

  // Loading state
  if (loading) {
    return <Skeleton active style={{ height }} />;
  }

  // Empty/error state
  if (validData.length < 2 || error) {
    return (
      <EmptyState 
        onRetry={onRetry} 
        message={error || 'Insufficient data to render chart'} 
      />
    );
  }

  // Calculate Y domain for regime bands
  const yValues = validData.map((d) => d.v);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const yRange = yMax - yMin;
  const yPadding = yRange * 0.1;

  // Render chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={validData} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
        <CartesianGrid 
          strokeDasharray="3 3" 
          stroke="rgba(229, 231, 235, 0.12)"
        />
        {/* Regime shading bands */}
        <ReferenceArea
          y1={yMin - yPadding}
          y2={500}
          fill="rgba(239,68,68,0.06)"
          stroke="none"
        />
        <ReferenceArea
          y1={500}
          y2={650}
          fill="rgba(234,179,8,0.06)"
          stroke="none"
        />
        <ReferenceArea
          y1={650}
          y2={yMax + yPadding}
          fill="rgba(34,197,94,0.06)"
          stroke="none"
        />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value) => formatXAxisLabel(value, range)}
          tick={{ fill: '#e5e7eb', fontSize: 12 }}
          axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
          tickLine={{ stroke: '#e5e7eb' }}
          angle={validData.length > 10 ? -45 : 0}
          textAnchor={validData.length > 10 ? 'end' : 'middle'}
          height={validData.length > 10 ? 60 : 30}
          tickCount={6}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fill: '#e5e7eb', fontSize: 12 }}
          axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
          tickLine={{ stroke: '#e5e7eb' }}
          width={80}
          domain={[yMin - yPadding, yMax + yPadding]}
        />
        <Tooltip
          content={<CustomTooltip range={range} />}
        />
        <Line
          type="monotone"
          dataKey="v"
          stroke={strokeColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: strokeColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
