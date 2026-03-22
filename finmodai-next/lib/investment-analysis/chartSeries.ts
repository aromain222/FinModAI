import {
  calculateDeterministicValuation,
} from '@/lib/investment-analysis/valuationEngine';
import type {
  DeterministicValuationAssumptions,
  InvestmentChartDocument,
  InvestmentAnalysisScenarioDocument,
  InvestmentChartDefinition,
  InvestmentSensitivityCell,
  InvestmentSensitivityTable,
  InvestmentValuationMetric,
} from '@/lib/investment-analysis/types';

const SCENARIO_COLORS = {
  base: '#2563eb',
  bull: '#16a34a',
  bear: '#dc2626',
  custom: '#f59e0b',
} as const;

function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}

function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getScenarioKeys(document: InvestmentChartDocument) {
  const keys: Array<keyof InvestmentChartDocument['scenarios']> = ['bear', 'base', 'bull'];
  if (document.activeScenario === 'custom' || document.scenarios.custom.dirty) {
    keys.push('custom');
  }
  return keys;
}

function resolveComparisonMetric(document: InvestmentChartDocument): InvestmentValuationMetric {
  const scenarioKeys = getScenarioKeys(document);
  const allHavePerShare = scenarioKeys.every((key) => {
    const value = document.scenarios[key].result.valuation.impliedPerShareValue;
    return typeof value === 'number' && Number.isFinite(value);
  });

  if (allHavePerShare) return 'impliedPerShareValue';
  return 'equityValue';
}

function valuationMetricLabel(metric: InvestmentValuationMetric): string {
  if (metric === 'enterpriseValue') return 'Enterprise Value';
  if (metric === 'equityValue') return 'Equity Value';
  return 'Implied Value / Share';
}

function valuationMetricFormat(metric: InvestmentValuationMetric): 'currency' | 'number' {
  return metric === 'impliedPerShareValue' ? 'currency' : 'currency';
}

function shiftValues(center: number, shifts: number[], floor: number, ceiling: number): number[] {
  const values = shifts.map((shift) => clamp(center + shift, floor, ceiling));
  return Array.from(new Set(values.map((value) => round(value, 4)))).sort((a, b) => a - b);
}

function buildSensitivityCell(
  baseAssumptions: DeterministicValuationAssumptions,
  scenario: InvestmentAnalysisScenarioDocument,
  rowValue: number,
  columnValue: number,
): InvestmentSensitivityCell {
  const recalculated = calculateDeterministicValuation(
    {
      ...baseAssumptions,
      wacc: rowValue,
      terminalGrowthRate: columnValue,
    },
    {
      company: scenario.result.company,
      scenarioKey: scenario.key,
      scenarioLabel: scenario.label,
    },
  );

  return {
    rowValue,
    columnValue,
    enterpriseValue: recalculated.valuation.enterpriseValue,
    equityValue: recalculated.valuation.equityValue,
    impliedPerShareValue: recalculated.valuation.impliedPerShareValue,
  };
}

export function buildRevenueForecastChart(
  scenario: InvestmentAnalysisScenarioDocument,
): InvestmentChartDefinition {
  return {
    kind: 'line',
    title: 'Revenue Forecast',
    subtitle: 'Projected revenue by year from the active deterministic scenario.',
    data: scenario.result.forecast.map((row) => ({
      x: `Y${row.year}`,
      revenue: row.revenue,
    })),
    series: [
      {
        key: 'revenue',
        label: 'Revenue',
        color: SCENARIO_COLORS[scenario.key],
        format: 'currency',
        axis: 'left',
      },
    ],
  };
}

export function buildFreeCashFlowForecastChart(
  scenario: InvestmentAnalysisScenarioDocument,
): InvestmentChartDefinition {
  return {
    kind: 'line',
    title: 'Free Cash Flow Forecast',
    subtitle: 'Unlevered free cash flow by projected year.',
    data: scenario.result.forecast.map((row) => ({
      x: `Y${row.year}`,
      unleveredFreeCashFlow: row.unleveredFreeCashFlow,
      nopat: row.nopat,
      capex: row.capex,
    })),
    series: [
      {
        key: 'unleveredFreeCashFlow',
        label: 'UFCF',
        color: '#f59e0b',
        format: 'currency',
        axis: 'left',
      },
      {
        key: 'nopat',
        label: 'NOPAT',
        color: '#16a34a',
        format: 'currency',
        axis: 'left',
      },
      {
        key: 'capex',
        label: 'Capex',
        color: '#dc2626',
        format: 'currency',
        axis: 'right',
      },
    ],
  };
}

export function buildScenarioComparisonChart(
  document: InvestmentChartDocument,
  metric: InvestmentValuationMetric = resolveComparisonMetric(document),
): InvestmentChartDefinition {
  const scenarioKeys = getScenarioKeys(document);

  return {
    kind: 'bar',
    title: `${valuationMetricLabel(metric)} Comparison`,
    subtitle: 'Bull, base, bear, and custom scenario outputs on a consistent valuation metric.',
    data: scenarioKeys.map((key) => ({
      x: document.scenarios[key].label,
      value: document.scenarios[key].result.valuation[metric] ?? 0,
      fill: SCENARIO_COLORS[key],
    })),
    series: [
      {
        key: 'value',
        label: valuationMetricLabel(metric),
        color: '#2563eb',
        format: valuationMetricFormat(metric),
      },
    ],
  };
}

export function buildSensitivityTable(
  scenario: InvestmentAnalysisScenarioDocument,
  metric: InvestmentValuationMetric = typeof scenario.result.valuation.impliedPerShareValue === 'number'
    ? 'impliedPerShareValue'
    : 'enterpriseValue',
): InvestmentSensitivityTable {
  // Recalculate a small WACC x terminal growth grid from the active scenario assumptions.
  // This stays fast enough for UI use while keeping the table tied to the same deterministic engine.
  const assumptions = scenario.assumptions;
  const rowValues = shiftValues(assumptions.wacc, [-0.02, -0.01, 0, 0.01, 0.02], 0.04, 0.25);
  const columnValues = shiftValues(
    assumptions.terminalGrowthRate,
    [-0.01, -0.005, 0, 0.005, 0.01],
    -0.01,
    Math.max(-0.01, assumptions.wacc - 0.005),
  );

  const cells = rowValues.map((rowValue) =>
    columnValues.map((columnValue) => buildSensitivityCell(assumptions, scenario, rowValue, columnValue)),
  );

  return {
    title: 'Sensitivity',
    subtitle: 'Implied valuation across WACC and terminal growth assumptions.',
    rowLabel: 'WACC',
    columnLabel: 'Terminal Growth',
    rowValues,
    columnValues,
    metric,
    format: valuationMetricFormat(metric),
    cells,
  };
}

export function buildInvestmentWorkspaceCharts(document: InvestmentChartDocument) {
  const activeScenario = document.scenarios[document.activeScenario];

  return {
    revenueForecast: buildRevenueForecastChart(activeScenario),
    freeCashFlowForecast: buildFreeCashFlowForecastChart(activeScenario),
    scenarioComparison: buildScenarioComparisonChart(document),
    sensitivity: buildSensitivityTable(activeScenario),
  };
}
