/**
 * ApexCharts MacroChart Component
 * 
 * Fintech-styled chart with professional appearance
 * Replaces Recharts with a more modern, financial-focused look
 */

'use client';

import dynamic from 'next/dynamic';
import { MacroSeries } from '@/types/macroSeries';
import { TimeRange } from '@/lib/macroData';
import { format } from 'date-fns';

// Dynamic import to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type MacroSeriesType = 'market_daily' | 'macro_monthly' | 'policy_step';

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

function calculateDomain(
  validValues: number[],
  seriesType: MacroSeriesType,
  currentValue?: number
): [number, number] {
  if (validValues.length === 0) return [0, 1];
  
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  
  if (min === max) {
    const center = min;
    let padding: number;
    
    if (seriesType === 'policy_step' || seriesType === 'macro_monthly') {
      padding = Math.max(0.08, Math.abs(center) * 0.02);
    } else if (seriesType === 'market_daily') {
      padding = Math.max(Math.abs(center) * 0.01, 1);
    } else {
      padding = Math.max(0.1, Math.abs(center) * 0.05);
    }
    
    return [center - padding, center + padding];
  }
  
  const span = max - min;
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
  
  if (span < minSpan) {
    const center = (min + max) / 2;
    return [center - minSpan / 2, center + minSpan / 2];
  }
  
  if (seriesType === 'macro_monthly') {
    const pad = span * 0.15;
    return [Math.max(0, min - pad), max + pad];
  }
  
  if (seriesType === 'policy_step') {
    const pad = span * 0.1;
    return [Math.max(0, min - pad), max + pad];
  }
  
  if (seriesType === 'market_daily' && currentValue !== undefined && currentValue < 100) {
    const center = currentValue;
    const range = Math.max(span, 0.4);
    return [center - range / 2, center + range / 2];
  }
  
  const pad = span * 0.1;
  return [min - pad, max + pad];
}

interface ApexMacroChartProps {
  series?: MacroSeries;
  range: TimeRange;
  height?: number;
  currentValue?: number;
  showFrequencyLabel?: boolean;
}

export function ApexMacroChart({
  series,
  range,
  height = 260,
  currentValue,
  showFrequencyLabel = true,
}: ApexMacroChartProps) {
  if (!series) return null;
  
  const rawData = series.points || [];
  const validDataFull = rawData
    .filter(p => p && p.date && p.value !== null && typeof p.value === 'number' && isFinite(p.value))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Filter by range (simplified - you can enhance this)
  const validData = validDataFull.slice(-50); // Show last 50 points
  
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
  
  const validValues = validData.map(p => p.value as number);
  const domain = calculateDomain(validValues, series.meta.type, currentValue);
  
  const lastUpdated = validData.length > 0 
    ? new Date(validData[validData.length - 1].date)
    : null;

  const frequencyLabel = series.meta.frequency === 'daily' 
    ? 'Daily' 
    : series.meta.frequency === 'monthly' 
    ? 'Monthly' 
    : 'Event-based';
  const sourceLabel = series.meta.source || 'Unknown source';

  // Fintech color scheme - professional blues and greens
  const chartColor = series.meta.type === 'policy_step' 
    ? '#2563eb' // Blue for rates
    : series.meta.type === 'macro_monthly'
    ? '#16a34a' // Green for macro indicators
    : '#3b82f6'; // Default blue

  // For daily market data: use category x-axis so weekends/holidays don't create visual gaps.
  // For monthly/event data: keep datetime so the true time scale is shown.
  const isDailyMarket = series.meta.type === 'market_daily' || series.meta.frequency === 'daily';
  const chartData = isDailyMarket
    ? validData.map((p, i) => ({ x: formatDate(p.date, range), y: p.value as number }))
    : validData.map(p => ({ x: new Date(p.date).getTime(), y: p.value as number }));

  const options = {
    chart: {
      type: 'line' as const,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      fontFamily: 'Inter, system-ui, sans-serif',
      background: 'transparent',
    },
    stroke: {
      curve: series.meta.type === 'policy_step' ? 'stepline' as const : 'straight' as const,
      width: 2,
      colors: [chartColor],
    },
    colors: [chartColor],
    grid: {
      borderColor: 'hsl(var(--border))',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    xaxis: {
      type: isDailyMarket ? 'category' as const : 'datetime' as const,
      labels: {
        style: {
          colors: 'hsl(var(--muted-foreground))',
          fontSize: '11px',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        format: !isDailyMarket && (range === '1W' || range === '1M') ? 'MMM d' : !isDailyMarket ? 'MMM yyyy' : undefined,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: domain[0],
      max: domain[1],
      labels: {
        style: {
          colors: 'hsl(var(--muted-foreground))',
          fontSize: '11px',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        formatter: (val: number) => {
          if (series.meta.unit === 'percent') return `${val.toFixed(1)}%`;
          if (series.meta.unit === 'bps') return `${(val * 100).toFixed(0)}bps`;
          return val.toFixed(0);
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    tooltip: {
      theme: 'dark' as const,
      style: {
        fontSize: '12px',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      x: {
        formatter: (val: number | string) =>
          typeof val === 'string' ? val : format(new Date(val), 'MMM d, yyyy'),
      },
      y: {
        formatter: (val: number) => {
          if (series.meta.unit === 'percent') return `${val.toFixed(2)}%`;
          if (series.meta.unit === 'bps') return `${(val * 100).toFixed(0)}bps`;
          return val.toFixed(2);
        },
      },
    },
    markers: {
      size: series.meta.type === 'macro_monthly' ? 4 : 0,
      colors: [chartColor],
      strokeColors: '#fff',
      strokeWidth: 1,
    },
    dataLabels: { enabled: false },
  };

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
      <Chart
        type="line"
        height={height}
        options={options}
        series={[{ name: series.meta.displayName || 'Value', data: chartData }]}
      />
    </div>
  );
}
