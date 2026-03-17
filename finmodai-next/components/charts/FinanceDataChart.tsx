'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Line,
  LineChart,
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
import {
  selectFinanceChartType,
  type FinanceStructuredChartType,
  type FinanceStructuredPoint,
} from '@/lib/charts/selectFinanceChartType';

export type FinanceDataChartInput = {
  title: string;
  xLabel?: string;
  yLabel?: string;
  subtitle?: string;
  data: FinanceStructuredPoint[];
  seriesLabel?: string;
  chartType?: 'auto' | FinanceStructuredChartType;
  valueFormat?: 'number' | 'currency' | 'percent';
  valuePrefix?: string;
  valueSuffix?: string;
  color?: string;
  footnote?: string;
  height?: number;
  className?: string;
};

function formatNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 100) return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatValue(
  value: number,
  format: FinanceDataChartInput['valueFormat'],
  prefix?: string,
  suffix?: string,
): string {
  if (!Number.isFinite(value)) return '—';
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: value >= 100 ? 0 : 2,
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  }
  if (format === 'percent') {
    return `${value.toFixed(1)}%`;
  }
  return `${prefix ?? ''}${formatNumber(value)}${suffix ?? ''}`;
}

export function FinanceDataChart({
  title,
  subtitle,
  xLabel,
  yLabel,
  data,
  seriesLabel,
  chartType = 'auto',
  valueFormat = 'number',
  valuePrefix,
  valueSuffix,
  color = '#22c55e',
  footnote,
  height = 300,
  className,
}: FinanceDataChartInput) {
  const validData = data.filter(
    (point): point is FinanceStructuredPoint & { y: number } =>
      point.y !== null && Number.isFinite(point.y),
  );
  const resolvedChartType =
    chartType === 'auto' ? selectFinanceChartType(validData) : chartType;
  const yDomain = useYDomain(validData.map((point) => point.y), 0.08);

  return (
    <FinanceChart
      title={title}
      footnote={footnote}
      empty={validData.length === 0}
      emptyMessage="No chartable data available"
      height={height}
      className={className}
    >
      {resolvedChartType === 'line' ? (
        <LineChart data={validData} margin={financeChartMargin}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border opacity-30" />
          <XAxis dataKey="x" {...financeXAxisProps()}>
            {xLabel ? <Label value={xLabel} position="insideBottom" offset={-4} style={{ fill: '#9ca3af', fontSize: 11 }} /> : null}
          </XAxis>
          <YAxis
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
            width={56}
            domain={yDomain}
            tickFormatter={(value: number) => formatValue(value, valueFormat, valuePrefix, valueSuffix)}
          >
            {yLabel ? (
              <Label
                value={yLabel}
                angle={-90}
                position="insideLeft"
                style={{ fill: '#9ca3af', fontSize: 11, textAnchor: 'middle' }}
              />
            ) : null}
          </YAxis>
          <Tooltip
            contentStyle={financeTooltipStyle}
            formatter={(value: number) => formatValue(value, valueFormat, valuePrefix, valueSuffix)}
            labelFormatter={(label) => String(label)}
          />
          <Line
            type="monotone"
            dataKey="y"
            name={seriesLabel ?? title}
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      ) : (
        <BarChart data={validData} margin={financeChartMargin}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border opacity-30" />
          <XAxis dataKey="x" {...financeXAxisProps()}>
            {xLabel ? <Label value={xLabel} position="insideBottom" offset={-4} style={{ fill: '#9ca3af', fontSize: 11 }} /> : null}
          </XAxis>
          <YAxis
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
            width={56}
            domain={yDomain}
            tickFormatter={(value: number) => formatValue(value, valueFormat, valuePrefix, valueSuffix)}
          >
            {yLabel ? (
              <Label
                value={yLabel}
                angle={-90}
                position="insideLeft"
                style={{ fill: '#9ca3af', fontSize: 11, textAnchor: 'middle' }}
              />
            ) : null}
          </YAxis>
          <Tooltip
            contentStyle={financeTooltipStyle}
            formatter={(value: number) => formatValue(value, valueFormat, valuePrefix, valueSuffix)}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="y" name={seriesLabel ?? title} fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      )}
      {subtitle ? <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p> : null}
    </FinanceChart>
  );
}
