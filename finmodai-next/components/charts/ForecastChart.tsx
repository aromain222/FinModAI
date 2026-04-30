'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FinanceChart,
  financeChartMargin,
  financeTooltipStyle,
  financeXAxisProps,
  useYDomain,
} from '@/components/charts/FinanceChart';

type HistoricalPoint = { date: string; actual: number };
type ForecastPoint = { date: string; forecast: number; lower: number; upper: number };

export type ForecastChartProps = {
  ticker: string;
  historical: HistoricalPoint[];
  forecast: ForecastPoint[] | null;
  valuePrefix?: string;
  valueSuffix?: string;
  height?: number;
  loading?: boolean;
  modelAvailable?: boolean;
};

type ChartRow = {
  date: string;
  actual?: number;
  forecast?: number;
  band?: [number, number]; // [lower, upper] for the area
};

function fmt(value: number, prefix = '$'): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return `${prefix}${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `${prefix}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function ForecastChart({
  ticker,
  historical,
  forecast,
  valuePrefix = '$',
  valueSuffix,
  height = 220,
  loading = false,
  modelAvailable = true,
}: ForecastChartProps) {
  const allActual = historical.map((p) => p.actual);
  const allForecast = forecast?.map((p) => p.forecast) ?? [];
  const allLower = forecast?.map((p) => p.lower) ?? [];
  const allUpper = forecast?.map((p) => p.upper) ?? [];
  const yDomain = useYDomain(
    [...allActual, ...allForecast, ...allLower, ...allUpper],
    0.1,
  );

  const rows: ChartRow[] = [
    ...historical.map((p) => ({ date: p.date, actual: p.actual })),
    ...(forecast ?? []).map((p) => ({
      date: p.date,
      forecast: p.forecast,
      band: [p.lower, p.upper] as [number, number],
    })),
  ];

  const dividerDate = historical.at(-1)?.date;

  const subtitle = loading
    ? 'Loading forecast…'
    : !modelAvailable
      ? `Price trend · ${ticker} (TimesFM offline)`
      : forecast
        ? `${historical.length}-day history + ${forecast.length}-day TimesFM forecast`
        : `Price trend · ${ticker}`;

  return (
    <FinanceChart
      title={`${ticker} Price`}
      footnote={subtitle}
      empty={rows.length === 0}
      emptyMessage="No price data available"
      height={height}
    >
      <ComposedChart data={rows} margin={financeChartMargin}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border opacity-30" />
        <XAxis dataKey="date" {...financeXAxisProps()} />
        <YAxis
          stroke="#9ca3af"
          tick={{ fontSize: 11 }}
          width={60}
          domain={yDomain}
          tickFormatter={(v: number) => fmt(v, valuePrefix)}
        />
        <Tooltip
          contentStyle={financeTooltipStyle}
          formatter={(value: number, name: string) => [
            fmt(value, valuePrefix) + (valueSuffix ?? ''),
            name === 'actual' ? 'Price' : name === 'forecast' ? 'Forecast' : name,
          ]}
          labelFormatter={(label) => String(label)}
        />

        {/* Confidence band (Area) */}
        {forecast && (
          <Area
            type="monotone"
            dataKey="band"
            fill="#8b5cf6"
            fillOpacity={0.12}
            stroke="none"
            activeDot={false}
            legendType="none"
            isAnimationActive={false}
          />
        )}

        {/* Historical — solid green */}
        <Line
          type="monotone"
          dataKey="actual"
          name="actual"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
        />

        {/* Forecast — dashed violet */}
        {forecast && (
          <Line
            type="monotone"
            dataKey="forecast"
            name="forecast"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        )}

        {/* "Today" separator */}
        {dividerDate && forecast && (
          <ReferenceLine
            x={dividerDate}
            stroke="#4b5563"
            strokeDasharray="3 3"
            label={{ value: 'Today', fill: '#9ca3af', fontSize: 10, position: 'top' }}
          />
        )}
      </ComposedChart>
    </FinanceChart>
  );
}
