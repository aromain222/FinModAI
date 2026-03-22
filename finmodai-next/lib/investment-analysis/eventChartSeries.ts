import { buildScenarioComparisonChart } from '@/lib/investment-analysis/chartSeries';
import type {
  InvestmentChartDefinition,
  InvestmentEventChartBundle,
  InvestmentEventChartInput,
} from '@/lib/investment-analysis/types';

const EVENT_CHART_COLORS = {
  before: '#64748b',
  after: '#2563eb',
} as const;

function resolveValuationMetric(input: InvestmentEventChartInput): {
  key: 'impliedPerShareValue' | 'equityValue';
  label: string;
} {
  const beforeValue = input.beforeScenario.result.valuation.impliedPerShareValue;
  const afterValue = input.afterScenario.result.valuation.impliedPerShareValue;
  const supportsPerShare =
    typeof beforeValue === 'number' &&
    Number.isFinite(beforeValue) &&
    typeof afterValue === 'number' &&
    Number.isFinite(afterValue);

  return supportsPerShare
    ? { key: 'impliedPerShareValue', label: 'Implied Value / Share' }
    : { key: 'equityValue', label: 'Equity Value' };
}

export function buildEventRevenueForecastComparisonChart(
  input: InvestmentEventChartInput,
): InvestmentChartDefinition {
  return {
    kind: 'line',
    title: 'Revenue Forecast Impact',
    subtitle: 'Before versus after the event-aware assumption adjustments.',
    data: input.afterScenario.result.forecast.map((afterRow, index) => {
      const beforeRow = input.beforeScenario.result.forecast[index];
      return {
        x: `Y${afterRow.year}`,
        beforeRevenue: beforeRow?.revenue ?? null,
        afterRevenue: afterRow.revenue,
      };
    }),
    series: [
      {
        key: 'beforeRevenue',
        label: 'Before Event',
        color: EVENT_CHART_COLORS.before,
        format: 'currency',
        axis: 'left',
      },
      {
        key: 'afterRevenue',
        label: 'After Event',
        color: EVENT_CHART_COLORS.after,
        format: 'currency',
        axis: 'left',
      },
    ],
  };
}

export function buildEventFreeCashFlowForecastComparisonChart(
  input: InvestmentEventChartInput,
): InvestmentChartDefinition {
  return {
    kind: 'line',
    title: 'Free Cash Flow Impact',
    subtitle: 'Unlevered free cash flow before and after the event-aware adjustment.',
    data: input.afterScenario.result.forecast.map((afterRow, index) => {
      const beforeRow = input.beforeScenario.result.forecast[index];
      return {
        x: `Y${afterRow.year}`,
        beforeUfcf: beforeRow?.unleveredFreeCashFlow ?? null,
        afterUfcf: afterRow.unleveredFreeCashFlow,
      };
    }),
    series: [
      {
        key: 'beforeUfcf',
        label: 'Before Event',
        color: EVENT_CHART_COLORS.before,
        format: 'currency',
        axis: 'left',
      },
      {
        key: 'afterUfcf',
        label: 'After Event',
        color: EVENT_CHART_COLORS.after,
        format: 'currency',
        axis: 'left',
      },
    ],
  };
}

export function buildEventValuationComparisonChart(
  input: InvestmentEventChartInput,
): InvestmentChartDefinition {
  const metric = resolveValuationMetric(input);
  return {
    kind: 'bar',
    title: `${metric.label} Impact`,
    subtitle: 'Valuation before versus after the event-aware adjustment.',
    data: [
      {
        x: 'Before Event',
        value: input.beforeScenario.result.valuation[metric.key] ?? 0,
        fill: EVENT_CHART_COLORS.before,
      },
      {
        x: 'After Event',
        value: input.afterScenario.result.valuation[metric.key] ?? 0,
        fill: EVENT_CHART_COLORS.after,
      },
    ],
    series: [
      {
        key: 'value',
        label: metric.label,
        color: EVENT_CHART_COLORS.after,
        format: 'currency',
      },
    ],
  };
}

export function buildEventAwareCharts(
  input: InvestmentEventChartInput,
): InvestmentEventChartBundle {
  return {
    revenueForecastComparison: buildEventRevenueForecastComparisonChart(input),
    freeCashFlowForecastComparison: buildEventFreeCashFlowForecastComparisonChart(input),
    valuationComparison: buildEventValuationComparisonChart(input),
    scenarioComparison: input.refreshedDocument
      ? buildScenarioComparisonChart(input.refreshedDocument)
      : null,
  };
}
