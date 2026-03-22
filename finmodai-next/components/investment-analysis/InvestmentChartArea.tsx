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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatAxisCurrency,
  formatAxisPercent,
  formatTooltipValue,
  yDomainWithPadding,
} from '@/lib/chartFormat';
import { buildInvestmentWorkspaceCharts } from '@/lib/investment-analysis/chartSeries';
import type {
  InvestmentChartDefinition,
  InvestmentChartDocument,
  InvestmentChartFormat,
  InvestmentSensitivityTable,
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

const ComparisonChart = memo(function ComparisonChart({
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

const ForecastChart = memo(function ForecastChart({
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

function renderSensitivityMetricValue(
  value: number | null,
  format: InvestmentSensitivityTable['format'],
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatValue(value, format);
}

function getSensitivityCellTone(
  value: number | null,
  minValue: number,
  maxValue: number,
): string {
  if (value == null || !Number.isFinite(value)) {
    return 'bg-[var(--cb-surface-alt)] text-[var(--cb-text-muted)]';
  }

  if (maxValue === minValue) {
    return 'bg-emerald-50/70 text-emerald-950';
  }

  const normalized = (value - minValue) / (maxValue - minValue);

  if (normalized >= 0.8) return 'bg-emerald-100 text-emerald-950';
  if (normalized >= 0.6) return 'bg-emerald-50 text-emerald-900';
  if (normalized >= 0.4) return 'bg-slate-50 text-slate-900';
  if (normalized >= 0.2) return 'bg-amber-50 text-amber-900';
  return 'bg-rose-50 text-rose-900';
}

const SensitivityTableCard = memo(function SensitivityTableCard({
  table,
}: {
  table: InvestmentSensitivityTable;
}) {
  const metricValues = useMemo(() => {
    return table.cells.flatMap((row) =>
      row.map((cell) => {
        const value = cell[table.metric];
        return typeof value === 'number' ? value : null;
      }),
    );
  }, [table]);

  const validValues = metricValues.filter((value): value is number => value != null && Number.isFinite(value));
  const minValue = validValues.length > 0 ? Math.min(...validValues) : 0;
  const maxValue = validValues.length > 0 ? Math.max(...validValues) : 0;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{table.title}</h3>
        {table.subtitle ? (
          <p className="mt-1 text-xs text-[var(--cb-text-muted)]">{table.subtitle}</p>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">{table.rowLabel}</TableHead>
            {table.columnValues.map((value) => (
              <TableHead key={value} className="text-right">
                {formatAxisPercent(value * 100)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.cells.map((row, rowIndex) => (
            <TableRow key={table.rowValues[rowIndex]}>
              <TableCell className="font-medium">{formatAxisPercent(table.rowValues[rowIndex] * 100)}</TableCell>
              {row.map((cell) => {
                const metricValue = cell[table.metric];
                return (
                  <TableCell
                    key={`${cell.rowValue}-${cell.columnValue}`}
                    className={`text-right font-medium ${getSensitivityCellTone(metricValue, minValue, maxValue)}`}
                  >
                    {renderSensitivityMetricValue(metricValue, table.format)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="text-[11px] text-[var(--cb-text-muted)]">
        Higher values highlight the more favorable valuation combinations. Rows are WACC assumptions; columns are terminal growth assumptions.
      </div>
    </div>
  );
});

export function InvestmentChartArea({
  document,
}: {
  document: InvestmentChartDocument;
}) {
  // Derive chart data from structured scenario state only.
  // Memo text is intentionally excluded from the chart pipeline.
  const charts = useMemo(() => buildInvestmentWorkspaceCharts(document), [document]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle>Scenario Charts</CardTitle>
        <CardDescription>
          Deterministic chart views from the structured forecast and valuation state.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 gap-2 bg-[var(--cb-surface-alt)] p-1 md:grid-cols-4">
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="fcf">Free Cash Flow</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue">
            <ForecastChart chart={charts.revenueForecast} />
          </TabsContent>

          <TabsContent value="fcf">
            <ForecastChart chart={charts.freeCashFlowForecast} />
          </TabsContent>

          <TabsContent value="scenarios">
            <ComparisonChart chart={charts.scenarioComparison} />
          </TabsContent>

          <TabsContent value="sensitivity">
            <SensitivityTableCard table={charts.sensitivity} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
