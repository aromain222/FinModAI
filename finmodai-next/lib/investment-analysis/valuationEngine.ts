import type {
  DeterministicForecastRow,
  DeterministicScenarioSet,
  DeterministicValuationAssumptions,
  DeterministicValuationResult,
  DeterministicValuationSummary,
  InvestmentChartDefinition,
  InvestmentCompanyMetadata,
  InvestmentScenarioKey,
  ScenarioHelperOverrides,
} from '@/lib/investment-analysis/types';

const DEFAULT_COLORS = {
  revenue: '#2563eb',
  ebit: '#16a34a',
  fcff: '#f59e0b',
  enterpriseValue: '#2563eb',
  equityValue: '#16a34a',
  terminalValue: '#dc2626',
} as const;

function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizePath(
  values: number[],
  forecastYears: number,
  fallback: number,
): { path: number[]; warnings: string[] } {
  const warnings: string[] = [];
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  const rawValues = Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : [];

  if (rawValues.length === 0) {
    warnings.push('Assumption path was empty and was filled with a fallback value.');
    return { path: Array.from({ length: forecastYears }, () => safeFallback), warnings };
  }

  const path = Array.from({ length: forecastYears }, (_, index) => {
    const explicit = rawValues[index];
    if (typeof explicit === 'number') return explicit;
    return rawValues[rawValues.length - 1];
  });

  if (rawValues.length < forecastYears) {
    warnings.push('Assumption path was shorter than the forecast horizon and the final value was extended.');
  }

  return { path, warnings };
}

function sanitizeAssumptions(
  assumptions: DeterministicValuationAssumptions,
): { assumptions: DeterministicValuationAssumptions; forecastYears: number; warnings: string[]; assumptionsAdjusted: string[] } {
  const warnings: string[] = [];
  const assumptionsAdjusted: string[] = [];

  const forecastYears = Math.max(
    assumptions.revenueGrowthByYear?.length ?? 0,
    assumptions.operatingMarginByYear?.length ?? 0,
    1,
  );

  const { path: revenueGrowthByYear, warnings: growthWarnings } = normalizePath(
    assumptions.revenueGrowthByYear,
    forecastYears,
    0.05,
  );
  const { path: operatingMarginByYear, warnings: marginWarnings } = normalizePath(
    assumptions.operatingMarginByYear,
    forecastYears,
    0.2,
  );

  warnings.push(...growthWarnings, ...marginWarnings);

  const normalizedBaseRevenue = isFinitePositive(assumptions.baseRevenue) ? assumptions.baseRevenue : 1000;
  if (normalizedBaseRevenue !== assumptions.baseRevenue) {
    warnings.push('Base revenue was missing or invalid and was reset to 1000.');
    assumptionsAdjusted.push('baseRevenue');
  }

  const normalizedTaxRate = clamp(Number.isFinite(assumptions.taxRate) ? assumptions.taxRate : 0.25, 0, 0.6);
  if (normalizedTaxRate !== assumptions.taxRate) assumptionsAdjusted.push('taxRate');

  const normalizedCapexPctRevenue = clamp(
    Number.isFinite(assumptions.capexPctRevenue) ? assumptions.capexPctRevenue : 0.04,
    -0.1,
    0.5,
  );
  if (normalizedCapexPctRevenue !== assumptions.capexPctRevenue) assumptionsAdjusted.push('capexPctRevenue');

  const normalizedNwcChangePctRevenue = clamp(
    Number.isFinite(assumptions.nwcChangePctRevenue) ? assumptions.nwcChangePctRevenue : 0.02,
    -0.2,
    0.3,
  );
  if (normalizedNwcChangePctRevenue !== assumptions.nwcChangePctRevenue) assumptionsAdjusted.push('nwcChangePctRevenue');

  const normalizedWacc = clamp(Number.isFinite(assumptions.wacc) ? assumptions.wacc : 0.1, 0.04, 0.25);
  if (normalizedWacc !== assumptions.wacc) assumptionsAdjusted.push('wacc');

  let normalizedTerminalGrowthRate = clamp(
    Number.isFinite(assumptions.terminalGrowthRate) ? assumptions.terminalGrowthRate : 0.025,
    -0.01,
    0.06,
  );
  if (normalizedTerminalGrowthRate !== assumptions.terminalGrowthRate) assumptionsAdjusted.push('terminalGrowthRate');

  if (normalizedTerminalGrowthRate >= normalizedWacc - 0.005) {
    normalizedTerminalGrowthRate = normalizedWacc - 0.005;
    warnings.push('Terminal growth was capped below WACC to keep the Gordon growth formula valid.');
    assumptionsAdjusted.push('terminalGrowthRate');
  }

  const normalizedRevenueGrowth = revenueGrowthByYear.map((value) => clamp(value, -0.95, 2));
  const normalizedOperatingMargin = operatingMarginByYear.map((value) => clamp(value, -0.5, 0.8));

  if (normalizedRevenueGrowth.some((value, index) => value !== revenueGrowthByYear[index])) {
    assumptionsAdjusted.push('revenueGrowthByYear');
    warnings.push('Revenue growth assumptions were clamped to a safe range.');
  }
  if (normalizedOperatingMargin.some((value, index) => value !== operatingMarginByYear[index])) {
    assumptionsAdjusted.push('operatingMarginByYear');
    warnings.push('Operating margin assumptions were clamped to a safe range.');
  }

  return {
    assumptions: {
      ...assumptions,
      baseRevenue: normalizedBaseRevenue,
      revenueGrowthByYear: normalizedRevenueGrowth,
      operatingMarginByYear: normalizedOperatingMargin,
      taxRate: normalizedTaxRate,
      capexPctRevenue: normalizedCapexPctRevenue,
      nwcChangePctRevenue: normalizedNwcChangePctRevenue,
      wacc: normalizedWacc,
      terminalGrowthRate: normalizedTerminalGrowthRate,
      shareCount: typeof assumptions.shareCount === 'number' && assumptions.shareCount > 0 ? assumptions.shareCount : null,
      netDebt: typeof assumptions.netDebt === 'number' && Number.isFinite(assumptions.netDebt) ? assumptions.netDebt : 0,
    },
    forecastYears,
    warnings,
    assumptionsAdjusted: Array.from(new Set(assumptionsAdjusted)),
  };
}

function buildForecastRows(
  assumptions: DeterministicValuationAssumptions,
  forecastYears: number,
): DeterministicForecastRow[] {
  const rows: DeterministicForecastRow[] = [];
  let priorRevenue = assumptions.baseRevenue;

  for (let index = 0; index < forecastYears; index += 1) {
    const year = index + 1;
    const revenueGrowth = assumptions.revenueGrowthByYear[index] ?? assumptions.revenueGrowthByYear[assumptions.revenueGrowthByYear.length - 1] ?? 0;
    const operatingMargin = assumptions.operatingMarginByYear[index] ?? assumptions.operatingMarginByYear[assumptions.operatingMarginByYear.length - 1] ?? 0;
    const revenue = priorRevenue * (1 + revenueGrowth);
    const ebit = revenue * operatingMargin;
    const taxes = ebit > 0 ? ebit * assumptions.taxRate : 0;
    const nopat = ebit - taxes;
    const capex = revenue * assumptions.capexPctRevenue;
    const workingCapitalChange = revenue * assumptions.nwcChangePctRevenue;
    const unleveredFreeCashFlow = nopat - capex - workingCapitalChange;
    const discountFactor = 1 / Math.pow(1 + assumptions.wacc, year);
    const presentValueOfFcff = unleveredFreeCashFlow * discountFactor;

    rows.push({
      year,
      revenue: round(revenue),
      operatingMargin: round(operatingMargin, 4),
      ebit: round(ebit),
      taxes: round(taxes),
      nopat: round(nopat),
      capex: round(capex),
      workingCapitalChange: round(workingCapitalChange),
      unleveredFreeCashFlow: round(unleveredFreeCashFlow),
      discountFactor: round(discountFactor, 6),
      presentValueOfFcff: round(presentValueOfFcff),
    });

    priorRevenue = revenue;
  }

  return rows;
}

function buildValuationSummary(
  forecast: DeterministicForecastRow[],
  assumptions: DeterministicValuationAssumptions,
): DeterministicValuationSummary {
  const presentValueOfForecastCashFlows = round(
    forecast.reduce((sum, row) => sum + row.presentValueOfFcff, 0),
  );

  const lastForecastRow = forecast[forecast.length - 1];
  const terminalCashFlow = lastForecastRow
    ? lastForecastRow.unleveredFreeCashFlow * (1 + assumptions.terminalGrowthRate)
    : 0;
  const terminalValueRaw =
    assumptions.wacc > assumptions.terminalGrowthRate
      ? terminalCashFlow / (assumptions.wacc - assumptions.terminalGrowthRate)
      : 0;
  const terminalValue = round(terminalValueRaw);
  const presentValueOfTerminalValue = round(
    terminalValue * (forecast[forecast.length - 1]?.discountFactor ?? 0),
  );
  const enterpriseValue = round(presentValueOfForecastCashFlows + presentValueOfTerminalValue);
  const equityValue = round(enterpriseValue - (assumptions.netDebt ?? 0));
  const impliedPerShareValue =
    typeof assumptions.shareCount === 'number' && assumptions.shareCount > 0
      ? round(equityValue / assumptions.shareCount, 2)
      : null;

  return {
    presentValueOfForecastCashFlows,
    terminalValue,
    presentValueOfTerminalValue,
    enterpriseValue,
    equityValue,
    impliedPerShareValue,
  };
}

function buildOperatingForecastChart(forecast: DeterministicForecastRow[]): InvestmentChartDefinition {
  return {
    title: 'Forecast Operating Profile',
    subtitle: 'Projected revenue, EBIT, and unlevered free cash flow.',
    data: forecast.map((row) => ({
      x: `Y${row.year}`,
      revenue: row.revenue,
      ebit: row.ebit,
      unleveredFreeCashFlow: row.unleveredFreeCashFlow,
    })),
    series: [
      { key: 'revenue', label: 'Revenue', color: DEFAULT_COLORS.revenue, format: 'currency', axis: 'left' },
      { key: 'ebit', label: 'EBIT', color: DEFAULT_COLORS.ebit, format: 'currency', axis: 'left' },
      { key: 'unleveredFreeCashFlow', label: 'UFCF', color: DEFAULT_COLORS.fcff, format: 'currency', axis: 'right' },
    ],
  };
}

function buildValuationBridgeChart(summary: DeterministicValuationSummary): InvestmentChartDefinition {
  return {
    title: 'Valuation Bridge',
    subtitle: 'Forecast PV plus terminal value roll into enterprise and equity value.',
    data: [
      {
        x: 'PV Forecast',
        value: summary.presentValueOfForecastCashFlows,
      },
      {
        x: 'PV Terminal',
        value: summary.presentValueOfTerminalValue,
      },
      {
        x: 'Enterprise Value',
        value: summary.enterpriseValue,
      },
      {
        x: 'Equity Value',
        value: summary.equityValue,
      },
    ],
    series: [
      {
        key: 'value',
        label: 'Value',
        color: DEFAULT_COLORS.enterpriseValue,
        format: 'currency',
      },
    ],
  };
}

function applyScenarioOverrides(
  base: DeterministicValuationAssumptions,
  overrides: ScenarioHelperOverrides,
): DeterministicValuationAssumptions {
  return {
    ...base,
    ...overrides,
    revenueGrowthByYear: overrides.revenueGrowthByYear ?? base.revenueGrowthByYear,
    operatingMarginByYear: overrides.operatingMarginByYear ?? base.operatingMarginByYear,
  };
}

export function calculateDeterministicValuation(
  assumptionsInput: DeterministicValuationAssumptions,
  options?: {
    company?: InvestmentCompanyMetadata;
    scenarioKey?: InvestmentScenarioKey;
    scenarioLabel?: string;
  },
): DeterministicValuationResult {
  const { assumptions, forecastYears, warnings, assumptionsAdjusted } = sanitizeAssumptions(assumptionsInput);
  const forecast = buildForecastRows(assumptions, forecastYears);
  const valuation = buildValuationSummary(forecast, assumptions);

  return {
    company: options?.company,
    scenario: {
      key: options?.scenarioKey ?? 'base',
      label: options?.scenarioLabel ?? 'Base Case',
    },
    assumptions,
    forecast,
    valuation,
    charts: {
      operatingForecast: buildOperatingForecastChart(forecast),
      valuationBridge: buildValuationBridgeChart(valuation),
    },
    warnings,
    assumptionsAdjusted,
  };
}

export function buildBaseCase(
  assumptions: DeterministicValuationAssumptions,
  company?: InvestmentCompanyMetadata,
): DeterministicValuationResult {
  return calculateDeterministicValuation(assumptions, {
    company,
    scenarioKey: 'base',
    scenarioLabel: 'Base Case',
  });
}

export function buildBullCase(
  assumptions: DeterministicValuationAssumptions,
  company?: InvestmentCompanyMetadata,
  overrides?: ScenarioHelperOverrides,
): DeterministicValuationResult {
  const defaultBullAssumptions = applyScenarioOverrides(assumptions, {
    revenueGrowthByYear: assumptions.revenueGrowthByYear.map((value) => value + 0.02),
    operatingMarginByYear: assumptions.operatingMarginByYear.map((value) => value + 0.01),
    wacc: assumptions.wacc - 0.01,
    terminalGrowthRate: assumptions.terminalGrowthRate + 0.005,
  });
  return calculateDeterministicValuation(applyScenarioOverrides(defaultBullAssumptions, overrides ?? {}), {
    company,
    scenarioKey: 'bull',
    scenarioLabel: 'Bull Case',
  });
}

export function buildBearCase(
  assumptions: DeterministicValuationAssumptions,
  company?: InvestmentCompanyMetadata,
  overrides?: ScenarioHelperOverrides,
): DeterministicValuationResult {
  const defaultBearAssumptions = applyScenarioOverrides(assumptions, {
    revenueGrowthByYear: assumptions.revenueGrowthByYear.map((value) => value - 0.02),
    operatingMarginByYear: assumptions.operatingMarginByYear.map((value) => value - 0.01),
    wacc: assumptions.wacc + 0.01,
    terminalGrowthRate: assumptions.terminalGrowthRate - 0.005,
  });
  return calculateDeterministicValuation(applyScenarioOverrides(defaultBearAssumptions, overrides ?? {}), {
    company,
    scenarioKey: 'bear',
    scenarioLabel: 'Bear Case',
  });
}

export function buildCustomScenario(
  baseAssumptions: DeterministicValuationAssumptions,
  overrides: ScenarioHelperOverrides,
  options?: {
    company?: InvestmentCompanyMetadata;
    label?: string;
  },
): DeterministicValuationResult {
  return calculateDeterministicValuation(applyScenarioOverrides(baseAssumptions, overrides), {
    company: options?.company,
    scenarioKey: 'custom',
    scenarioLabel: options?.label ?? 'Custom Scenario',
  });
}

export function buildStandardScenarioSet(
  assumptions: DeterministicValuationAssumptions,
  company?: InvestmentCompanyMetadata,
): DeterministicScenarioSet {
  return {
    base: buildBaseCase(assumptions, company),
    bull: buildBullCase(assumptions, company),
    bear: buildBearCase(assumptions, company),
  };
}
