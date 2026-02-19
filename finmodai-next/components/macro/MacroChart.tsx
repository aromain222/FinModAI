/**
 * MacroChart Component
 * 
 * STRICT RULES:
 * - Never plot data at higher frequency than it exists
 * - Never convert nulls to 0
 * - Never interpolate across gaps
 * - Only show charts with >= 3 valid datapoints
 * - Use correct chart types per frequency
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { MacroSeries } from '@/types/macroSeries';
import { TimeRange } from '@/lib/macroData';
import { format } from 'date-fns';

const formatDate = (iso: string, range: TimeRange) => {
  const d = new Date(iso);
  switch (range) {
    case '1W':
    case '1M':
      return format(d, 'MMM d');
    case '3M':
    case '1Y':
      return format(d, 'MMM');
    default:
      return format(d, 'yyyy');
  }
};

/**
 * Calculate tight, realistic Y-axis domain based on data type
 * Improved to handle flat data and ensure minimum spans
 */
function calculateDomain(
  validValues: number[],
  seriesType: MacroSeriesType,
  currentValue?: number
): [number, number] {
  if (validValues.length === 0) return [0, 1];
  
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  
  // Handle single value or flat data with data-type-specific minimum padding
  if (min === max) {
    const center = min;
    let padding: number;
    
    if (seriesType === 'policy_step' || seriesType === 'macro_monthly') {
      // Rates/percentages: zoom for tiny variation
      padding = Math.max(0.08, Math.abs(center) * 0.02);
    } else if (seriesType === 'market_daily') {
      // Market levels: keep variation visible instead of flattening.
      padding = Math.max(Math.abs(center) * 0.01, 1);
    } else {
      padding = Math.max(0.1, Math.abs(center) * 0.05);
    }
    
    return [center - padding, center + padding];
  }
  
  const span = max - min;
  
  // For non-flat data, ensure minimum span based on data type
  let minSpan: number;
  if (seriesType === 'macro_monthly') {
    minSpan = 0.2;
  } else if (seriesType === 'market_daily' && currentValue) {
    minSpan = Math.max(Math.abs(currentValue) * 0.01, 1);
  } else if (seriesType === 'policy_step') {
    minSpan = 0.15;
  } else {
    minSpan = Math.max(Math.abs(max) * 0.01, 0.1);
  }
  
  // If span is too small, center around midpoint with minimum span
  if (span < minSpan) {
    const center = (min + max) / 2;
    return [center - minSpan / 2, center + minSpan / 2];
  }
  
  // Macro indicators: tight range, clamp to realistic bounds
  if (seriesType === 'macro_monthly') {
    const pad = span * 0.15; // 15% padding
    return [Math.max(0, min - pad), max + pad];
  }
  
  // Policy rates: step function, tight range
  if (seriesType === 'policy_step') {
    const pad = span * 0.1; // 10% padding
    return [Math.max(0, min - pad), max + pad];
  }
  
  // Rates (10Y Treasury): center around current value, ±20-40 bps
  if (seriesType === 'market_daily' && currentValue !== undefined && currentValue < 100) {
    const center = currentValue;
    const range = Math.max(span, 0.4);
    return [center - range / 2, center + range / 2];
  }
  
  // Equity indices: allow wider range but avoid extremes
  if (seriesType === 'market_daily') {
    const pad = span * 0.08;
    return [min - pad, max + pad];
  }
  
  // Default: 10% padding
  const pad = span * 0.1;
  return [min - pad, max + pad];
}

type MacroSeriesType = 'market_daily' | 'macro_monthly' | 'policy_step';
const formatPercentValue = (v: number, decimals: number = 2) => {
  if (!isFinite(v)) return '—';
  const rounded = Number(v.toFixed(decimals));
  const safe = Math.abs(rounded) < Math.pow(10, -decimals) ? 0 : rounded;
  return `${safe.toFixed(decimals)}%`;
};

const filterByRange = (data: { date: string; value: number }[], freq: 'daily' | 'monthly' | 'event', range: TimeRange) => {
  const countsDaily: Record<TimeRange, number> = {
    '1W': 7,
    '1M': 31,
    '3M': 92,
    '1Y': 366,
    '5Y': 1826,
    'MAX': data.length,
  };
  const countsMonthly: Record<TimeRange, number> = {
    '1W': 2,
    '1M': 4,
    '3M': 6,
    '1Y': 12,
    '5Y': 60,
    'MAX': data.length,
  };
  if (data.length === 0 || range === 'MAX') return data;
  if (freq === 'monthly') {
    const maxCount = countsMonthly[range];
    return maxCount >= data.length ? data : data.slice(data.length - maxCount);
  }

  const now = Date.now();
  const days = countsDaily[range];
  const start = now - days * 24 * 60 * 60 * 1000;
  const filtered = data.filter((point) => new Date(point.date).getTime() >= start);
  // Preserve at least the last two points if the selected range is sparse.
  if (filtered.length >= 2) return filtered;
  return data.slice(-Math.min(data.length, Math.max(2, Math.floor(days / 2))));
};

interface MacroChartProps {
  series?: MacroSeries;
  range: TimeRange;
  height?: number;
  currentValue?: number; // For centering rates
  showFrequencyLabel?: boolean;
}

export function MacroChart({
  series,
  range,
  height = 260,
  currentValue,
  showFrequencyLabel = true,
}: MacroChartProps) {
  if (!series) return null;
  
  // Filter and sort data - NEVER convert nulls to 0
  const rawData = series.points || [];
  const validDataFull = rawData
    .filter(p => p && p.date && p.value !== null && typeof p.value === 'number' && isFinite(p.value))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Respect native frequency: slice by range using counts instead of interpolating
  const validData = filterByRange(validDataFull as any, series.meta.frequency, range);
  
  // CRITICAL: Only show chart if >= 3 valid datapoints
  if (validData.length < 3) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <div className="text-center">
          <p>Insufficient data</p>
          <p className="text-xs mt-1">Requires at least 3 valid datapoints</p>
        </div>
      </div>
    );
  }
  
  // Get valid values for domain calculation
  const validValues = validData.map(p => p.value as number);
  const domain = calculateDomain(validValues, series.meta.type, currentValue);
  
  // Get last updated date
  const lastUpdated = validData.length > 0 
    ? new Date(validData[validData.length - 1].date)
    : null;
  
  // Frequency label and source
  const frequencyLabel = series.meta.frequency === 'daily' 
    ? 'Daily' 
    : series.meta.frequency === 'monthly' 
    ? 'Monthly' 
    : 'Event-based';
  const sourceLabel = series.meta.source || 'Unknown source';
  
  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border opacity-30" />
      <XAxis
        dataKey="date"
        tickFormatter={(v) => formatDate(v, range)}
        tickLine={false}
        axisLine={false}
        interval="preserveStartEnd"
        style={{ fontSize: 11 }}
      />
      <YAxis 
        domain={domain} 
        tickLine={false} 
        axisLine={false} 
        width={50} 
        style={{ fontSize: 11 }}
        tickFormatter={(v) => {
          if (series.meta.unit === 'percent') return formatPercentValue(v, 1);
          if (series.meta.unit === 'bps') return `${(v * 100).toFixed(0)}bps`;
          return v.toFixed(0);
        }}
      />
      <Tooltip
        contentStyle={{
          borderRadius: '0.5rem',
          border: '1px solid hsl(var(--border))',
          background: 'hsl(var(--background))',
        }}
        formatter={(value: any) => {
          const formatted = series.meta.unit === 'percent' 
            ? formatPercentValue(Number(value), 2)
            : series.meta.unit === 'bps'
            ? `${(Number(value) * 100).toFixed(0)}bps`
            : Number(value).toFixed(2);
          return [formatted, series.meta.displayName || 'Value'];
        }}
        labelFormatter={(v) => `${formatDate(v as string, range)} • ${series.meta.source}`}
      />
    </>
  );
  
  // Policy step (Fed Funds): step function, no interpolation
  if (series.meta.type === 'policy_step') {
    return (
      <div>
        {showFrequencyLabel && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
            <span>{frequencyLabel} • {sourceLabel}</span>
            {lastUpdated && (
              <span>Updated: {format(lastUpdated, 'MMM d, yyyy')}</span>
            )}
          </div>
        )}
        <ResponsiveContainer width="100%" height={height}>
          <LineChart 
            data={validData} 
            margin={{ left: 0, right: 8, top: 8, bottom: 8 }}
          >
            {commonAxes}
            <Line 
              type="stepAfter" 
              dataKey="value" 
              stroke="#2563eb" 
              strokeWidth={2} 
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  
  // Macro monthly (CPI, Unemployment): dots only, no smooth lines
  if (series.meta.type === 'macro_monthly') {
    return (
      <div>
        {showFrequencyLabel && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
            <span>{frequencyLabel} • {sourceLabel}</span>
            {lastUpdated && (
              <span>Updated: {format(lastUpdated, 'MMM d, yyyy')}</span>
            )}
          </div>
        )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart 
          data={validData} 
          margin={{ left: 0, right: 8, top: 8, bottom: 8 }}
        >
          {commonAxes}
          <Line 
            type="linear" 
              dataKey="value" 
              stroke="#16a34a" 
              strokeWidth={2}
              dot={{ fill: '#16a34a', r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  
  // Market daily (SPY, VIX, Treasury): only insert null for long gaps (holidays), not weekends (2–3 days)
  const GAP_DAYS_BEFORE_NULL = 5;
  const preparedData = (() => {
    if (validData.length < 2) return validData;
    const out: typeof validData = [];
    for (let i = 0; i < validData.length; i++) {
      const curr = validData[i];
      out.push(curr);
      if (i === 0) continue;
      const prev = validData[i - 1];
      const daysDiff = (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > GAP_DAYS_BEFORE_NULL) {
        const midDate = new Date((new Date(prev.date).getTime() + new Date(curr.date).getTime()) / 2);
        out.push({ date: midDate.toISOString(), value: null as any });
      }
    }
    return out;
  })();
  const hasGaps = preparedData.some(p => p.value === null);
  const showGapWarning = hasGaps || (series.quality.maxGapDays ?? 0) > 7;
  
  return (
    <div>
      {showFrequencyLabel && (
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
          <span>{frequencyLabel} • {sourceLabel}</span>
          {lastUpdated && (
            <span>Updated: {format(lastUpdated, 'MMM d, yyyy')}</span>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart 
          data={preparedData} 
          margin={{ left: 0, right: 8, top: 8, bottom: 8 }}
        >
          {commonAxes}
          <Line 
            type="linear"
            dataKey="value" 
            stroke="#2563eb" 
            strokeWidth={2}
            dot={hasGaps ? { fill: '#2563eb', r: 3 } : false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {showGapWarning && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
          Data gap detected; chart shows gaps to avoid misleading interpolation.
        </p>
      )}
    </div>
  );
}
