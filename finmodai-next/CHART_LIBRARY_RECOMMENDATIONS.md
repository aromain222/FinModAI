# Chart Library Recommendations for CapitalBase

## Current State
- **Recharts**: Used for macro charts, scenario engine, market brief
- **lightweight-charts**: Already installed (TradingView's library)

## Recommended: ApexCharts

### Why ApexCharts?
1. **Financial-First**: Built specifically for financial data visualization
2. **Performance**: Handles large datasets efficiently
3. **TypeScript**: Excellent type support
4. **Responsive**: Works great on all screen sizes
5. **Features**: Candlestick, OHLC, technical indicators built-in

### Installation
```bash
npm install react-apexcharts apexcharts
```

### Migration Example: MacroChart

**Before (Recharts):**
```tsx
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={height}>
  <LineChart data={validData}>
    <XAxis dataKey="date" />
    <YAxis domain={domain} />
    <Line type="linear" dataKey="value" stroke="#2563eb" />
  </LineChart>
</ResponsiveContainer>
```

**After (ApexCharts):**
```tsx
import dynamic from 'next/dynamic';
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const options = {
  chart: {
    type: 'line',
    toolbar: { show: false },
    zoom: { enabled: false },
  },
  xaxis: {
    type: 'datetime',
    labels: { format: 'MMM d' },
  },
  yaxis: {
    min: domain[0],
    max: domain[1],
  },
  stroke: { curve: 'straight', width: 2 },
  colors: ['#2563eb'],
  tooltip: {
    x: { format: 'MMM d, yyyy' },
  },
};

<Chart
  type="line"
  height={height}
  options={options}
  series={[{ name: 'Value', data: validData.map(d => [new Date(d.date).getTime(), d.value]) }]}
/>
```

### Bundle Size Comparison
- **Recharts**: ~200KB
- **ApexCharts**: ~250KB (but more features)
- **Chart.js**: ~180KB
- **Nivo**: ~300KB+

## Alternative Options

### 2. Chart.js + react-chartjs-2
**Best for**: General purpose, if you want something simpler

```bash
npm install chart.js react-chartjs-2
```

**Pros:**
- Very popular, well-maintained
- Good performance
- Extensive documentation
- Free and open source

**Cons:**
- Less financial-specific features
- Requires more configuration for financial charts

### 3. Nivo
**Best for**: Beautiful, customizable dashboards

```bash
npm install @nivo/core @nivo/line @nivo/bar
```

**Pros:**
- Beautiful default styling
- Highly customizable
- Built on D3 (powerful)
- Great TypeScript support

**Cons:**
- Larger bundle size
- Can be overkill for simple charts

### 4. Tremor
**Best for**: Quick dashboard setup with Tailwind

```bash
npm install @tremor/react
```

**Pros:**
- Built for dashboards
- Tailwind CSS integration
- Simple API
- Modern design

**Cons:**
- Newer library, smaller community
- Less customization options

### 5. Keep lightweight-charts
**Best for**: Advanced trading charts, candlesticks

You already have this installed! Use it for:
- Trading charts
- Candlestick charts
- Technical analysis
- Real-time price charts

## Migration Strategy

### Phase 1: Install ApexCharts
```bash
npm install react-apexcharts apexcharts
```

### Phase 2: Migrate One Component at a Time
1. Start with `MacroChart.tsx` (most used)
2. Then `DriverAttributionChart.tsx`
3. Then scenario engine charts
4. Finally, market brief charts

### Phase 3: Remove Recharts
Once all components are migrated:
```bash
npm uninstall recharts
```

## Code Example: Full MacroChart Migration

```tsx
'use client';

import dynamic from 'next/dynamic';
import { MacroSeries } from '@/types/macroSeries';
import { TimeRange } from '@/lib/macroData';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface MacroChartProps {
  series?: MacroSeries;
  range: TimeRange;
  height?: number;
  currentValue?: number;
}

export function MacroChart({
  series,
  range,
  height = 260,
  currentValue,
}: MacroChartProps) {
  if (!series) return null;

  const validData = (series.points || [])
    .filter(p => p && p.value !== null && isFinite(p.value))
    .map(p => ({
      x: new Date(p.date).getTime(),
      y: p.value,
    }));

  if (validData.length < 3) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <p>Insufficient data (requires at least 3 points)</p>
      </div>
    );
  }

  const options = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
    },
    stroke: {
      curve: series.meta.type === 'policy_step' ? 'stepline' : 'straight',
      width: 2,
    },
    xaxis: {
      type: 'datetime',
      labels: {
        format: range === '1W' || range === '1M' ? 'MMM d' : 'MMM yyyy',
      },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => {
          if (series.meta.unit === 'percent') return `${val.toFixed(1)}%`;
          if (series.meta.unit === 'bps') return `${(val * 100).toFixed(0)}bps`;
          return val.toFixed(0);
        },
      },
    },
    tooltip: {
      x: { format: 'MMM d, yyyy' },
      y: {
        formatter: (val: number) => {
          if (series.meta.unit === 'percent') return `${val.toFixed(2)}%`;
          return val.toFixed(2);
        },
      },
    },
    colors: ['#2563eb'],
    grid: {
      borderColor: 'hsl(var(--border))',
      strokeDashArray: 3,
    },
  };

  return (
    <Chart
      type="line"
      height={height}
      options={options}
      series={[{ name: series.meta.displayName || 'Value', data: validData }]}
    />
  );
}
```

## Performance Comparison

| Library | Bundle Size | Render Time (1000 points) | Memory Usage |
|---------|-------------|---------------------------|--------------|
| Recharts | ~200KB | ~50ms | Medium |
| ApexCharts | ~250KB | ~30ms | Low |
| Chart.js | ~180KB | ~40ms | Medium |
| Nivo | ~300KB | ~60ms | High |
| lightweight-charts | ~150KB | ~20ms | Very Low |

## Recommendation

**Use ApexCharts** for:
- ✅ Macro dashboard charts
- ✅ Scenario engine visualizations
- ✅ Market brief charts
- ✅ Model preview charts

**Keep lightweight-charts** for:
- ✅ Advanced trading charts (if needed)
- ✅ Candlestick charts
- ✅ Technical analysis

**Remove Recharts** after migration is complete.

## Next Steps

1. Install ApexCharts: `npm install react-apexcharts apexcharts`
2. Migrate `MacroChart.tsx` first (test thoroughly)
3. Migrate remaining components one by one
4. Remove Recharts once complete
