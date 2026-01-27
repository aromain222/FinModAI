'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  ScatterChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  TooltipProps,
} from 'recharts';
import { format, isValid, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface ChartCardProps {
  title?: string;
  subtitle?: string;
  rightControls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export interface LineChartCardProps {
  data: Array<Record<string, any>>;
  xKey: string;
  yKey: string;
  height?: number;
  title?: string;
  subtitle?: string;
  rightControls?: React.ReactNode;
  onRetry?: () => void;
  formatXAxis?: (value: any) => string;
  formatYAxis?: (value: any) => string;
  formatTooltipLabel?: (label: any) => string;
  formatTooltipValue?: (value: any) => string;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface ScatterChartCardProps {
  data: Array<{ x: number; y: number; label?: string; [key: string]: any }>;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  title?: string;
  subtitle?: string;
  rightControls?: React.ReactNode;
  onRetry?: () => void;
  xDomain?: [number, number] | 'auto' | 'dataMin' | 'dataMax';
  yDomain?: [number, number] | 'auto' | 'dataMin' | 'dataMax';
  formatTooltipLabel?: (label: any) => string;
  formatTooltipValue?: (value: any) => string;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Format timestamp for x-axis labels
 * Handles various date formats and returns readable labels
 */
function formatTimestamp(value: any): string {
  if (value === null || value === undefined) return '';
  
  try {
    let date: Date;
    
    // Try parsing as ISO string first
    if (typeof value === 'string' && value.includes('T')) {
      date = parseISO(value);
    } else if (typeof value === 'string') {
      date = new Date(value);
    } else if (typeof value === 'number') {
      // Could be timestamp in milliseconds or seconds
      date = new Date(value > 1e10 ? value : value * 1000);
    } else {
      return String(value);
    }
    
    if (!isValid(date)) return String(value);
    
    // Format based on data density (simple heuristic)
    // For time series, show "MMM d" for most cases
    return format(date, 'MMM d');
  } catch {
    return String(value);
  }
}

/**
 * Format timestamp for tooltip (more detailed)
 */
function formatTooltipTimestamp(value: any): string {
  if (value === null || value === undefined) return '';
  
  try {
    let date: Date;
    
    if (typeof value === 'string' && value.includes('T')) {
      date = parseISO(value);
    } else if (typeof value === 'string') {
      date = new Date(value);
    } else if (typeof value === 'number') {
      date = new Date(value > 1e10 ? value : value * 1000);
    } else {
      return String(value);
    }
    
    if (!isValid(date)) return String(value);
    
    return format(date, 'MMM d, yyyy, h:mm a');
  } catch {
    return String(value);
  }
}

/**
 * Custom tooltip component for dark mode
 */
const CustomTooltip: React.FC<TooltipProps<any, any>> = ({ active, payload, label, labelFormatter, formatter }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formattedLabel = labelFormatter ? labelFormatter(label) : formatTooltipTimestamp(label);
  const formattedValue = formatter 
    ? formatter(payload[0].value, payload[0].name)
    : typeof payload[0].value === 'number' 
      ? payload[0].value.toFixed(2)
      : String(payload[0].value);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-lg">
      <p className="text-gray-200 text-xs font-medium mb-1">{formattedLabel}</p>
      <p className="text-gray-100 text-sm font-semibold">
        {typeof formattedValue === 'string' ? formattedValue : formattedValue[0]}
      </p>
    </div>
  );
};

/**
 * Empty state component with retry button
 */
const EmptyState: React.FC<{ onRetry?: () => void; message?: string }> = ({ onRetry, message = 'No data' }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
};

// ============================================================================
// ChartCard Wrapper
// ============================================================================

export const ChartCard: React.FC<ChartCardProps> = ({ 
  title, 
  subtitle, 
  rightControls, 
  children,
  className = '',
}) => {
  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 p-4 ${className}`}>
      {(title || subtitle || rightControls) && (
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-gray-100 truncate">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {rightControls && (
            <div className="ml-4 flex-shrink-0">{rightControls}</div>
          )}
        </div>
      )}
      <div className="w-full">
        {children}
      </div>
    </div>
  );
};

// ============================================================================
// LineChartCard
// ============================================================================

export const LineChartCard: React.FC<LineChartCardProps> = ({
  data,
  xKey,
  yKey,
  height = 300,
  title,
  subtitle,
  rightControls,
  onRetry,
  formatXAxis = formatTimestamp,
  formatYAxis = (value: any) => typeof value === 'number' ? value.toFixed(0) : String(value),
  formatTooltipLabel = formatTooltipTimestamp,
  formatTooltipValue = (value: any) => typeof value === 'number' ? value.toFixed(2) : String(value),
  strokeColor = '#3b82f6', // blue-500
  strokeWidth = 2,
}) => {
  // Check if we have enough data
  const hasData = useMemo(() => {
    return Array.isArray(data) && data.length >= 2;
  }, [data]);

  // Validate and normalize data
  const validData = useMemo(() => {
    if (!hasData) return [];
    
    return data.filter((point) => {
      const xValue = point[xKey];
      const yValue = point[yKey];
      return xValue !== null && xValue !== undefined && 
             yValue !== null && yValue !== undefined && 
             (typeof yValue === 'number' ? Number.isFinite(yValue) : true);
    });
  }, [data, xKey, yKey, hasData]);

  // Determine if x-axis contains timestamps
  const hasTimestamps = useMemo(() => {
    if (!hasData || validData.length === 0) return false;
    const firstX = validData[0]?.[xKey];
    return typeof firstX === 'string' && (firstX.includes('T') || firstX.includes('-')) ||
           (typeof firstX === 'number' && firstX > 1000000000); // Likely timestamp
  }, [validData, xKey, hasData]);

  const chartContent = hasData && validData.length >= 2 ? (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={validData} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
        <CartesianGrid 
          strokeDasharray="3 3" 
          stroke="#374151" // gray-700 for subtle grid
          opacity={0.3}
        />
        <XAxis
          dataKey={xKey}
          type={hasTimestamps && typeof validData[0]?.[xKey] === 'number' ? 'number' : 'category'}
          tickFormatter={hasTimestamps ? formatXAxis : undefined}
          tick={{ fill: '#d9d9d9', fontSize: 11 }}
          axisLine={{ stroke: '#6b7280', strokeWidth: 1 }}
          tickLine={{ stroke: '#6b7280' }}
          angle={validData.length > 10 ? -45 : 0}
          textAnchor={validData.length > 10 ? 'end' : 'middle'}
          height={validData.length > 10 ? 60 : 30}
          interval="preserveStartEnd"
          tickCount={hasTimestamps && typeof validData[0]?.[xKey] === 'number' ? 6 : undefined} // Limit to ~6 ticks max for numeric time axes
          domain={hasTimestamps && typeof validData[0]?.[xKey] === 'number' ? ['dataMin', 'dataMax'] : undefined}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fill: '#d9d9d9', fontSize: 11 }}
          axisLine={{ stroke: '#6b7280', strokeWidth: 1 }}
          tickLine={{ stroke: '#6b7280' }}
          width={60}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatTooltipLabel} formatter={formatTooltipValue} />}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          dot={false}
          activeDot={{ r: 4, fill: strokeColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  ) : (
    <div style={{ height }} className="w-full">
      <EmptyState onRetry={onRetry} message="No data available" />
    </div>
  );

  if (title || subtitle || rightControls) {
    return (
      <ChartCard title={title} subtitle={subtitle} rightControls={rightControls}>
        {chartContent}
      </ChartCard>
    );
  }

  return chartContent;
};

// ============================================================================
// ScatterChartCard (for Macro "Growth vs Inflation Regime")
// ============================================================================

export const ScatterChartCard: React.FC<ScatterChartCardProps> = ({
  data,
  xLabel = 'Growth',
  yLabel = 'Inflation',
  height = 400,
  title,
  subtitle,
  rightControls,
  onRetry,
  xDomain = 'auto',
  yDomain = 'auto',
  formatTooltipLabel = (label: any) => String(label),
  formatTooltipValue = (value: any) => typeof value === 'number' ? value.toFixed(2) : String(value),
}) => {
  // Check if we have enough data (scatter plots can show a single point for "current state" visualizations)
  const hasData = useMemo(() => {
    return Array.isArray(data) && data.length >= 1;
  }, [data]);

  // Validate and normalize scatter data
  const validData = useMemo(() => {
    if (!hasData) return [];
    
    return data
      .map((point) => ({
        x: typeof point.x === 'number' && Number.isFinite(point.x) ? point.x : null,
        y: typeof point.y === 'number' && Number.isFinite(point.y) ? point.y : null,
        label: point.label,
        ...point,
      }))
      .filter((point) => point.x !== null && point.y !== null);
  }, [data, hasData]);

  const chartContent = hasData && validData.length >= 1 ? (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid 
          strokeDasharray="3 3" 
          stroke="#374151" // gray-700 for subtle grid
          opacity={0.3}
        />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          label={{ value: xLabel, position: 'insideBottom', offset: -5, fill: '#d9d9d9', style: { fontSize: 12 } }}
          tick={{ fill: '#d9d9d9', fontSize: 11 }}
          axisLine={{ stroke: '#6b7280', strokeWidth: 1 }}
          tickLine={{ stroke: '#6b7280' }}
          domain={xDomain}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#d9d9d9', style: { fontSize: 12 } }}
          tick={{ fill: '#d9d9d9', fontSize: 11 }}
          axisLine={{ stroke: '#6b7280', strokeWidth: 1 }}
          tickLine={{ stroke: '#6b7280' }}
          domain={yDomain}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const point = payload[0].payload;
            const xValue = formatTooltipValue(point?.x);
            const yValue = formatTooltipValue(point?.y);
            const label = formatTooltipLabel('') || `${xLabel} vs ${yLabel}`;
            
            return (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-lg">
                <p className="text-gray-200 text-xs font-medium mb-1">{label}</p>
                <p className="text-gray-100 text-sm font-semibold">
                  {xLabel}: {xValue}
                </p>
                <p className="text-gray-100 text-sm font-semibold">
                  {yLabel}: {yValue}
                </p>
              </div>
            );
          }}
        />
        <Scatter
          name={`${xLabel} vs ${yLabel}`}
          data={validData}
          fill="#3b82f6" // blue-500
        />
      </ScatterChart>
    </ResponsiveContainer>
  ) : (
    <div style={{ height }} className="w-full">
      <EmptyState onRetry={onRetry} message="No data available" />
    </div>
  );

  if (title || subtitle || rightControls) {
    return (
      <ChartCard title={title} subtitle={subtitle} rightControls={rightControls}>
        {chartContent}
      </ChartCard>
    );
  }

  return chartContent;
};

