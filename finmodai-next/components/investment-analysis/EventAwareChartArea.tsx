'use client';

import { memo, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FinanceChart, financeChartMargin, financeTooltipStyle, financeXAxisProps } from '@/components/charts/FinanceChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatAxisCurrency,
  formatAxisPercent,
  formatTooltipValue,
  yDomainWithPadding,
} from '@/lib/chartFormat';
import { buildEventAwareCharts } from '@/lib/investment-analysis/eventChartSeries';
import type {
  InvestmentChartDefinition,
  InvestmentChartFormat,
  InvestmentEventChartInput,
} from '@/lib/investment-analysis/types';

function formatValue(value: number, format: InvestmentChartFormat): string {
  if (!Number.isFinite(value)) return '—';
  if (format === 'percent') return formatAxisPercent(value * 100);
  if (format === 'currency') return formatTooltipValue(value, 'currency');
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatAxisValue(value: number, format: InvestmentChartFormat): string {
  if (!Number.isFinite(value)) return '—';
  if (format === 'percent') return formatAxisPercent(value * 100);
  if (format === 'currency') return formatAxisCurrency(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function buildDomain(chart: InvestmentChartDefinition): [number, number] {
  const values = chart.data.flatMap((point) =>
    chart.series.map((series) => {
      const value = point[series.key];
      return typeof value === 'number' ? value : null;
    }),
  );
  return yDomainWithPadding(values, 0.08);
}

const EventComparisonChart = memo(function EventComparisonChart({
  chart,
}: {
  chart: InvestmentChartDefinition;
}) {
  const leftSeries = chart.series.filter((series) => series.axis !== 'right');
  const rightSeries = chart.series.filter((series) => series.axis === 'right');
  const leftDomain = useMemo(
    () =>
      yDomainWithPadding(
        chart.data.flatMap((point) =>
          leftSeries.map((series) => (typeof point[series.key] === 'number' ? (point[series.key] as number) : null)),
        ),
        0.08,
      ),
    [chart.data, leftSeries],
  );
  const rightDomain = useMemo(
    () =>
      rightSeries.length > 0
        ? yDomainWithPadding(
            chart.data.flatMap((point) =>
              rightSeries.map((series) => (typeof point[series.key] === 'number' ? (point[series.key] as number) : null)),
            ),
            0.08,
          )
        : undefined,
    [chart.data, rightSeries],
  );

  return (
    <FinanceChart title={chart.title} footnote={chart.subtitle} height={340}>
      <LineChart data={chart.data} margin={financeChartMargin}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border opacity-30" />
        <XAxis dataKey="x" {...financeXAxisProps()} />
        <YAxis
          yAxisId="left"
          stroke="#9ca3af"
          tick={{ fontSize: 11 }}
          width={78}
          domain={leftDomain}
          tickFormatter={(value: number) => formatAxisValue(value, leftSeries[0]?.format ?? 'number')}
        />
        {rightSeries.length > 0 ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
            width={78}
            domain={rightDomain}
            tickFormatter={(value: number) => formatAxisValue(value, rightSeries[0]?.format ?? 'number')}
          />
        ) : null}
        <Tooltip
          contentStyle={financeTooltipStyle}
          formatter={(value: number, _name: string, item) =>
            formatValue(
              value,
              chart.series.find((series) => series.key === item.dataKey)?.format ?? 'number',
            )
          }
        />
        <Legend />
        {chart.series.map((series) => (
          <Line
            key={series.key}
            yAxisId={series.axis === 'right' ? 'right' : 'left'}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2.25}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </FinanceChart>
  );
});

const EventValuationBarChart = memo(function EventValuationBarChart({
  chart,
}: {
  chart: InvestmentChartDefinition;
}) {
  const domain = useMemo(() => buildDomain(chart), [chart]);

  return (
    <FinanceChart title={chart.title} footnote={chart.subtitle} height={320}>
      <BarChart data={chart.data} margin={financeChartMargin}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border opacity-30" />
        <XAxis dataKey="x" {...financeXAxisProps()} />
        <YAxis
          stroke="#9ca3af"
          tick={{ fontSize: 11 }}
          width={78}
          domain={domain}
          tickFormatter={(value: number) => formatAxisValue(value, chart.series[0]?.format ?? 'number')}
        />
        <Tooltip
          contentStyle={financeTooltipStyle}
          formatter={(value: number, _name: string, item) =>
            formatValue(
              value,
              chart.series.find((series) => series.key === item.dataKey)?.format ?? 'number',
            )
          }
        />
        <Legend />
        {chart.series.map((series) => (
          <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} radius={[6, 6, 0, 0]}>
            {chart.data.map((point) => (
              <Cell key={`${point.x}`} fill={typeof point.fill === 'string' ? point.fill : series.color} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </FinanceChart>
  );
});

type EventAwareChartAreaProps = {
  chartInput: InvestmentEventChartInput;
};

export function EventAwareChartArea({ chartInput }: EventAwareChartAreaProps) {
  const charts = useMemo(() => buildEventAwareCharts(chartInput), [chartInput]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle>Event-Aware Charts</CardTitle>
        <CardDescription>
          Deterministic before-versus-after views from the event-adjusted valuation workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 gap-2 bg-[var(--cb-surface-alt)] p-1 md:grid-cols-4">
            <TabsTrigger value="revenue">Revenue Impact</TabsTrigger>
            <TabsTrigger value="fcf">FCF Impact</TabsTrigger>
            <TabsTrigger value="valuation">Valuation Impact</TabsTrigger>
            <TabsTrigger value="scenarios" disabled={!charts.scenarioComparison}>
              Scenarios
            </TabsTrigger>
          </TabsList>

          <TabsContent value="revenue">
            <EventComparisonChart chart={charts.revenueForecastComparison} />
          </TabsContent>

          <TabsContent value="fcf">
            <EventComparisonChart chart={charts.freeCashFlowForecastComparison} />
          </TabsContent>

          <TabsContent value="valuation">
            <EventValuationBarChart chart={charts.valuationComparison} />
          </TabsContent>

          <TabsContent value="scenarios">
            {charts.scenarioComparison ? <EventValuationBarChart chart={charts.scenarioComparison} /> : null}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
