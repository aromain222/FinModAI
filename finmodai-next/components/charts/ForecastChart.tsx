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
  /** Optional event-adjusted forecast values (same length as forecast). */
  eventAdjusted?: number[] | null;
  /** Label shown in tooltip for the event-adjusted line. */
  eventAdjustedLabel?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  height?: number;
  loading?: boolean;
  modelAvailable?: boolean;
  modelSource?: string | null;
  methodology?: string | null;
};

type ChartRow = {
  date: string;
  actual?: number;
  forecast?: number;
  band?: [number, number];
  eventAdjusted?: number;
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
  eventAdjusted,
  eventAdjustedLabel = 'News-adjusted',
  valuePrefix = '$',
  valueSuffix,
  height = 220,
  loading = false,
  modelAvailable = true,
  modelSource,
  methodology,
}: ForecastChartProps) {
  const isTimesFm = modelSource === 'timesfm';
  const forecastLabel = isTimesFm ? 'TimesFM baseline' : 'Provider trend';
  const allActual = historical.map((p) => p.actual);
  const allForecast = forecast?.map((p) => p.forecast) ?? [];
  const allLower = forecast?.map((p) => p.lower) ?? [];
  const allUpper = forecast?.map((p) => p.upper) ?? [];
  const allAdjusted = eventAdjusted ?? [];
  const yDomain = useYDomain(
    [...allActual, ...allForecast, ...allLower, ...allUpper, ...allAdjusted],
    0.1,
  );

  const cleanHistorical = historical.filter((point) => Number.isFinite(point.actual));
  const cleanForecast = forecast?.filter((point) =>
    Number.isFinite(point.forecast) &&
    Number.isFinite(point.lower) &&
    Number.isFinite(point.upper)
  ) ?? null;
  const lastActualPoint = cleanHistorical.at(-1) ?? null;

  const rows: ChartRow[] = cleanHistorical.map((point) => ({ date: point.date, actual: point.actual }));
  if (cleanForecast && cleanForecast.length > 0) {
    if (lastActualPoint) {
      const lastRow = rows.at(-1);
      if (lastRow) {
        lastRow.forecast = lastActualPoint.actual;
        lastRow.band = [lastActualPoint.actual, lastActualPoint.actual];
        if (eventAdjusted && eventAdjusted.length > 0) {
          lastRow.eventAdjusted = lastActualPoint.actual;
        }
      }
    }
    rows.push(
      ...cleanForecast.map((point, i) => ({
        date: point.date,
        forecast: point.forecast,
        band: [point.lower, point.upper] as [number, number],
        ...(eventAdjusted?.[i] != null && Number.isFinite(eventAdjusted[i])
          ? { eventAdjusted: eventAdjusted[i] }
          : {}),
      })),
    );
  }

  const dividerDate = historical.at(-1)?.date;

  const hasAdjusted = cleanForecast != null && eventAdjusted != null && eventAdjusted.length > 0;

  const subtitle = loading
    ? 'Loading forecast…'
    : !modelAvailable
      ? `Price trend · ${ticker} (TimesFM offline)`
      : hasAdjusted
        ? `${historical.length}d history + ${forecastLabel} (violet) + ${eventAdjustedLabel} (cyan)`
        : forecast
          ? `${historical.length}-day history + ${forecast.length}-day ${forecastLabel}`
          : `Price trend · ${ticker}`;
  const footnote = methodology
    ? `${subtitle}. ${isTimesFm ? 'TimesFM' : 'TimesFM offline; provider fallback'}: ${methodology}`
    : subtitle;

  return (
    <FinanceChart
      title={`${ticker} Price`}
      footnote={footnote}
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
            name === 'actual' ? 'Price'
              : name === 'forecast' ? forecastLabel
              : name === 'eventAdjusted' ? eventAdjustedLabel
              : name,
          ]}
          labelFormatter={(label) => String(label)}
        />

        {/* Confidence band */}
        {cleanForecast && (
          <Area
            type="linear"
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
          type="linear"
          dataKey="actual"
          name="actual"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />

        {/* Forecast baseline — dashed violet */}
        {cleanForecast && (
          <Line
            type="linear"
            dataKey="forecast"
            name="forecast"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}

        {/* Event-adjusted forecast — dashed cyan */}
        {hasAdjusted && (
          <Line
            type="linear"
            dataKey="eventAdjusted"
            name="eventAdjusted"
            stroke="#06b6d4"
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={false}
            activeDot={{ r: 4 }}
          />
        )}

        {/* "Today" separator */}
        {dividerDate && cleanForecast && (
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
