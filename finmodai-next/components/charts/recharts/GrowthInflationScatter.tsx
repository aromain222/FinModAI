'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
} from 'recharts';
import { Empty, Skeleton, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

export interface GrowthInflationScatterProps {
  data: Array<{ x: number; y: number; label?: string }>;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  xLabel?: string;
  yLabel?: string;
  xDomain?: [number, number] | 'auto';
  yDomain?: [number, number] | 'auto';
  fillColor?: string;
}

/**
 * Format tooltip value (show as percentage, clamp to reasonable range)
 */
function formatTooltipValue(value: any, isIndex: boolean = false): string {
  const numValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numValue)) return '—';
  
  // If value is clearly an index (too large for percentage), show as index
  if (isIndex || Math.abs(numValue) > 50) {
    return numValue.toFixed(0);
  }
  
  return `${numValue.toFixed(2)}%`;
}

/**
 * Determine if value is likely an index vs percentage
 */
function isLikelyIndex(value: number): boolean {
  return Math.abs(value) > 50;
}

/**
 * Determine regime from inflation and growth
 */
function getRegime(inflation: number, growth: number): {
  name: string;
  implications: string[];
} {
  const isHighInflation = inflation > 2.5;
  const isHighGrowth = growth > 2;
  const isLowGrowth = growth < 0;

  if (isHighGrowth && !isHighInflation) {
    return {
      name: 'High Growth / Low Inflation (Ideal)',
      implications: [
        'Supportive for equities as strong growth with contained inflation',
        'Positive for growth stocks and small caps',
        'May allow for easier monetary policy',
      ],
    };
  }

  if (isHighInflation && isLowGrowth) {
    return {
      name: 'High Inflation / Low Growth (Stagflation)',
      implications: [
        'Pressure on rates as central banks may need to tighten',
        'Headwinds for long-duration equities',
        'Support for commodities and value stocks',
      ],
    };
  }

  if (!isHighGrowth && !isHighInflation) {
    return {
      name: 'Low Growth / Low Inflation (Recession Risk)',
      implications: [
        'Economic contraction increases recession risks',
        'Typically driving flight to safety',
        'Pressures risk assets',
      ],
    };
  }

  // High Inflation / High Growth (Overheating)
  return {
    name: 'High Inflation / High Growth (Overheating)',
    implications: [
      'Pressure on rates as policy may need to tighten',
      'Headwinds for long-duration equities',
      'Support for commodities and value stocks',
    ],
  };
}

/**
 * Custom tooltip with regime information
 */
const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  xLabel?: string;
  yLabel?: string;
}> = ({ active, payload, xLabel = 'X', yLabel = 'Y' }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0].payload;
  const xNum = typeof point?.x === 'number' ? point.x : Number(point?.x);
  const yNum = typeof point?.y === 'number' ? point.y : Number(point?.y);
  
  const xIsIndex = isLikelyIndex(xNum);
  const yIsIndex = isLikelyIndex(yNum);
  
  const xValue = formatTooltipValue(xNum, xIsIndex);
  const yValue = formatTooltipValue(yNum, yIsIndex);
  
  // Only show regime if both are percentages (not indices)
  const regime = !xIsIndex && !yIsIndex ? getRegime(xNum, yNum) : null;

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
        {xLabel}: {xValue} | {yLabel}: {yValue}
      </p>
      {regime && (
        <>
          <p style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginTop: '6px', marginBottom: '4px' }}>
            Regime: {regime.name}
          </p>
          <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>
            {regime.implications[0]}
          </p>
        </>
      )}
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
 * GrowthInflationScatter - Recharts-based scatter chart for Growth vs Inflation regime
 * 
 * Features:
 * - Dark mode styling with visible axes and gridlines
 * - Configurable domains for better visualization
 * - Empty/loading/error states
 * - Supports single point (current regime) visualization
 */
export function GrowthInflationScatter({
  data,
  height = 340,
  loading = false,
  error = null,
  onRetry,
  xLabel = 'Inflation (%)',
  yLabel = 'Growth (%)',
  xDomain = 'auto',
  yDomain = 'auto',
  fillColor = '#3b82f6',
}: GrowthInflationScatterProps) {
  // Validate and prepare data - support both single point and trajectory
  const validData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    
    return data
      .map((point) => ({
        x: typeof point.x === 'number' && Number.isFinite(point.x) ? point.x : null,
        y: typeof point.y === 'number' && Number.isFinite(point.y) ? point.y : null,
        label: point.label,
        date: point.date,
      }))
      .filter((point) => point.x !== null && point.y !== null)
      .sort((a, b) => (a.date ?? 0) - (b.date ?? 0)); // Sort by date if available
  }, [data]);

  // Determine if values are indices vs percentages
  const xIsIndex = validData.length > 0 && isLikelyIndex(validData[0]?.x ?? 0);
  const yIsIndex = validData.length > 0 && isLikelyIndex(validData[0]?.y ?? 0);

  // Clamp domains to reasonable ranges for percentages
  const clampedXDomain = useMemo(() => {
    if (xDomain !== 'auto' && Array.isArray(xDomain)) return xDomain;
    if (xIsIndex) return 'auto';
    
    const xValues = validData.map((d) => d.x).filter((v) => Number.isFinite(v));
    if (xValues.length === 0) return 'auto';
    
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const rangeX = maxX - minX;
    const paddingX = rangeX * 0.15;
    
    // Clamp to reasonable percentage range
    return [Math.max(-5, minX - paddingX), Math.min(15, maxX + paddingX)] as [number, number];
  }, [xDomain, validData, xIsIndex]);

  const clampedYDomain = useMemo(() => {
    if (yDomain !== 'auto' && Array.isArray(yDomain)) return yDomain;
    if (yIsIndex) return 'auto';
    
    const yValues = validData.map((d) => d.y).filter((v) => Number.isFinite(v));
    if (yValues.length === 0) return 'auto';
    
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const rangeY = maxY - minY;
    const paddingY = rangeY * 0.15;
    
    // Clamp to reasonable percentage range
    return [Math.max(-5, minY - paddingY), Math.min(15, maxY + paddingY)] as [number, number];
  }, [yDomain, validData, yIsIndex]);

  // Get latest point for regime verdict
  const latestPoint = validData.length > 0 ? validData[validData.length - 1] : null;
  const regimeVerdict = latestPoint && !xIsIndex && !yIsIndex
    ? getRegime(latestPoint.x, latestPoint.y)
    : null;

  // Custom shape for scatter points (brightest for latest, faded for older)
  const renderScatterShape = (props: any, entry: any, index: number) => {
    const { cx, cy } = props;
    const isLatest = index === validData.length - 1;
    const radius = isLatest ? 5 : 4;
    const fill = isLatest ? fillColor : 'rgba(59,130,246,0.4)';
    const stroke = isLatest ? fillColor : 'rgba(59,130,246,0.6)';
    const strokeWidth = isLatest ? 1.5 : 1;
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  };

  // Loading state
  if (loading) {
    return <Skeleton active style={{ height }} />;
  }

  // Empty/error state (scatter can show single point for current regime)
  if (validData.length < 1 || error) {
    return (
      <EmptyState 
        onRetry={onRetry} 
        message={error || 'Insufficient data to render chart'} 
      />
    );
  }

  // Render chart
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="rgba(229, 231, 235, 0.12)"
          />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            label={{ value: xIsIndex ? `${xLabel} (Index)` : xLabel, position: 'insideBottom', offset: -5, fill: '#e5e7eb', style: { fontSize: 13 } }}
            tick={{ fill: '#e5e7eb', fontSize: 12 }}
            axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
            tickLine={{ stroke: '#e5e7eb' }}
            domain={clampedXDomain === 'auto' ? undefined : clampedXDomain}
            tickFormatter={(value) => xIsIndex ? value.toFixed(0) : `${value.toFixed(2)}%`}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            label={{ value: yIsIndex ? `${yLabel} (Index)` : yLabel, angle: -90, position: 'insideLeft', fill: '#e5e7eb', style: { fontSize: 13 } }}
            tick={{ fill: '#e5e7eb', fontSize: 12 }}
            axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
            tickLine={{ stroke: '#e5e7eb' }}
            domain={clampedYDomain === 'auto' ? undefined : clampedYDomain}
            tickFormatter={(value) => yIsIndex ? value.toFixed(0) : `${value.toFixed(2)}%`}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={<CustomTooltip xLabel={xIsIndex ? `${xLabel} (Index)` : xLabel} yLabel={yIsIndex ? `${yLabel} (Index)` : yLabel} />}
          />
          {/* Show trajectory line if multiple points */}
          {validData.length > 1 && (
            <Line
              type="monotone"
              dataKey="y"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              data={validData}
            />
          )}
          {/* Show all points with fading for older points */}
          <Scatter
            data={validData}
            shape={renderScatterShape}
          />
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Regime Verdict Box */}
      {regimeVerdict && (
        <div
          style={{
            marginTop: 16,
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.95)', marginBottom: '8px' }}>
            Current Regime: {regimeVerdict.name}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.80)' }}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Implications:</div>
            <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '20px' }}>
              {regimeVerdict.implications.map((imp, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>
                  {imp}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
