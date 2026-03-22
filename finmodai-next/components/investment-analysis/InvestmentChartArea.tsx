'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FinanceChart,
  financeChartMargin,
  financeTooltipStyle,
  financeXAxisProps,
} from '@/components/charts/FinanceChart';
import type { InvestmentAnalysisScenarioDocument, InvestmentChartFormat } from '@/lib/investment-analysis/types';

function formatValue(value: number, format: InvestmentChartFormat): string {
  if (!Number.isFinite(value)) return '—';
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
    }).format(value);
  }
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function ChartRenderer({ scenario }: { scenario: InvestmentAnalysisScenarioDocument }) {
  const charts = scenario.result.charts;

  return (
    <Tabs defaultValue="forecast" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 bg-[var(--cb-surface-alt)]">
        <TabsTrigger value="forecast">Forecast</TabsTrigger>
        <TabsTrigger value="valuation">Valuation</TabsTrigger>
      </TabsList>

      <TabsContent value="forecast">
        <FinanceChart title={charts.operatingForecast.title} footnote={charts.operatingForecast.subtitle} height={320}>
          <LineChart data={charts.operatingForecast.data} margin={financeChartMargin}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border opacity-30" />
            <XAxis dataKey="x" {...financeXAxisProps()} />
            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 11 }}
              width={68}
              tickFormatter={(value: number) => formatValue(value, 'currency')}
            />
            <Tooltip
              contentStyle={financeTooltipStyle}
              formatter={(value: number, _name: string, item) =>
                formatValue(value, (item?.payload && charts.operatingForecast.series.find((series) => series.key === item.dataKey)?.format) || 'number')
              }
            />
            <Legend />
            {charts.operatingForecast.series.map((series) => (
              <Line
                key={series.key}
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
      </TabsContent>

      <TabsContent value="valuation">
        <FinanceChart title={charts.valuationBridge.title} footnote={charts.valuationBridge.subtitle} height={320}>
          <BarChart data={charts.valuationBridge.data} margin={financeChartMargin}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border opacity-30" />
            <XAxis dataKey="x" {...financeXAxisProps()} />
            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 11 }}
              width={68}
              tickFormatter={(value: number) => formatValue(value, 'currency')}
            />
            <Tooltip
              contentStyle={financeTooltipStyle}
              formatter={(value: number) => formatValue(value, 'currency')}
            />
            <Legend />
            {charts.valuationBridge.series.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                fill={series.color}
                radius={[6, 6, 0, 0]}
              />
            ))}
          </BarChart>
        </FinanceChart>
      </TabsContent>
    </Tabs>
  );
}

export function InvestmentChartArea({
  scenario,
}: {
  scenario: InvestmentAnalysisScenarioDocument;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle>Scenario Charts</CardTitle>
        <CardDescription>
          Deterministic forecast and valuation views for the active scenario.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <ChartRenderer scenario={scenario} />
      </CardContent>
    </Card>
  );
}
