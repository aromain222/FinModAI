export type GroundedBaseCase = {
  company: string;
  revenue: number;
  growth: number;
  margin: number;
  discount_rate: number;
};

export type MacroScenario = {
  name: string;
  revenue_growth_delta: number;
  margin_delta: number;
  discount_rate_delta: number;
};

export type ScenarioProjection = {
  year: number;
  revenue: number;
  freeCashFlow: number;
  discountFactor: number;
  presentValue: number;
  source: 'provided_base_case_dataset' | 'provided_macro_assumptions';
};

export type ScenarioValuation = {
  assumptions: {
    revenue: number;
    growth: number;
    margin: number;
    discount_rate: number;
    terminal_growth_rate: number;
    fcf_conversion: number;
  };
  projections: ScenarioProjection[];
  pv_of_projected_fcf: number;
  terminal_value: number;
  discounted_terminal_value: number;
  enterprise_value: number;
};

export type InvestorGradeSection = {
  title:
    | 'SECTION 1: Earnings Snapshot'
    | 'SECTION 2: AI Smart Assumptions Applied'
    | 'SECTION 3: Scenario-Based DCF Output'
    | 'SECTION 4: Key Drivers of Change'
    | 'SECTION 5: Investor Interpretation'
    | 'SECTION 6: Risks';
  bullets: string[];
};

export type SmartScenarioDcfReport = {
  company: string;
  workflow: 'macro_change_to_company_impact_to_dcf';
  sources: {
    base_case: 'provided_base_case_dataset';
    scenario: 'provided_macro_assumptions';
  };
  baseCase: GroundedBaseCase & { source: 'provided_base_case_dataset' };
  scenario: MacroScenario & { source: 'provided_macro_assumptions' };
  adjustedAssumptions: {
    growth: number;
    margin: number;
    discount_rate: number;
  };
  baseValuation: ScenarioValuation;
  scenarioValuation: ScenarioValuation;
  valuationChangePct: number;
  sections: InvestorGradeSection[];
  formattedResponse: string;
};

const TERMINAL_GROWTH_RATE = 0.03;
const FCF_CONVERSION = 0.75;
const PROJECTION_YEARS = 5;

export const TESLA_BASE_CASE: GroundedBaseCase = {
  company: 'Tesla',
  revenue: 100_000_000_000,
  growth: 0.08,
  margin: 0.18,
  discount_rate: 0.1,
};

export const RATES_DOWN_100BPS_SCENARIO: MacroScenario = {
  name: 'Interest Rates DOWN 100bps',
  revenue_growth_delta: 0.05,
  margin_delta: -0.005,
  discount_rate_delta: -0.01,
};

function assertFinitePositiveNumber(value: unknown, field: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }
  return numeric;
}

function assertFiniteNumber(value: unknown, field: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return numeric;
}

function validateBaseCase(baseCase: GroundedBaseCase): GroundedBaseCase {
  return {
    company: String(baseCase.company || '').trim() || 'Unknown Company',
    revenue: assertFinitePositiveNumber(baseCase.revenue, 'revenue'),
    growth: assertFiniteNumber(baseCase.growth, 'growth'),
    margin: assertFiniteNumber(baseCase.margin, 'margin'),
    discount_rate: assertFinitePositiveNumber(baseCase.discount_rate, 'discount_rate'),
  };
}

function validateScenario(scenario: MacroScenario): MacroScenario {
  return {
    name: String(scenario.name || '').trim() || 'Unnamed Scenario',
    revenue_growth_delta: assertFiniteNumber(scenario.revenue_growth_delta, 'revenue_growth_delta'),
    margin_delta: assertFiniteNumber(scenario.margin_delta, 'margin_delta'),
    discount_rate_delta: assertFiniteNumber(scenario.discount_rate_delta, 'discount_rate_delta'),
  };
}

function formatCurrencyBillions(value: number): string {
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function runSimpleDcf(baseCase: GroundedBaseCase): ScenarioValuation {
  if (baseCase.discount_rate <= TERMINAL_GROWTH_RATE) {
    throw new Error('discount_rate must be greater than terminal growth for the terminal value formula.');
  }

  const projections: ScenarioProjection[] = [];
  let currentRevenue = baseCase.revenue;

  for (let year = 1; year <= PROJECTION_YEARS; year += 1) {
    currentRevenue = currentRevenue * (1 + baseCase.growth);
    const freeCashFlow = currentRevenue * baseCase.margin * FCF_CONVERSION;
    const discountFactor = 1 / Math.pow(1 + baseCase.discount_rate, year);
    const presentValue = freeCashFlow * discountFactor;

    projections.push({
      year,
      revenue: currentRevenue,
      freeCashFlow,
      discountFactor,
      presentValue,
      source: 'provided_base_case_dataset',
    });
  }

  const pv_of_projected_fcf = projections.reduce((sum, projection) => sum + projection.presentValue, 0);
  const finalYearFcf = projections.at(-1)?.freeCashFlow ?? 0;
  const terminal_value =
    (finalYearFcf * (1 + TERMINAL_GROWTH_RATE)) / (baseCase.discount_rate - TERMINAL_GROWTH_RATE);
  const discounted_terminal_value =
    terminal_value / Math.pow(1 + baseCase.discount_rate, PROJECTION_YEARS);
  const enterprise_value = pv_of_projected_fcf + discounted_terminal_value;

  return {
    assumptions: {
      revenue: baseCase.revenue,
      growth: baseCase.growth,
      margin: baseCase.margin,
      discount_rate: baseCase.discount_rate,
      terminal_growth_rate: TERMINAL_GROWTH_RATE,
      fcf_conversion: FCF_CONVERSION,
    },
    projections,
    pv_of_projected_fcf,
    terminal_value,
    discounted_terminal_value,
    enterprise_value,
  };
}

function buildFormattedResponse(sections: InvestorGradeSection[]): string {
  return sections
    .map((section) => `${section.title}\n\n${section.bullets.map((bullet) => `* ${bullet}`).join('\n')}`)
    .join('\n\n');
}

export function buildAiSmartDcfReport(
  baseCaseInput: GroundedBaseCase = TESLA_BASE_CASE,
  scenarioInput: MacroScenario = RATES_DOWN_100BPS_SCENARIO,
): SmartScenarioDcfReport {
  const baseCase = validateBaseCase(baseCaseInput);
  const scenario = validateScenario(scenarioInput);

  const adjustedAssumptions = {
    growth: baseCase.growth + scenario.revenue_growth_delta,
    margin: baseCase.margin + scenario.margin_delta,
    discount_rate: baseCase.discount_rate + scenario.discount_rate_delta,
  };

  if (adjustedAssumptions.discount_rate <= TERMINAL_GROWTH_RATE) {
    throw new Error('Adjusted discount_rate must stay above terminal growth.');
  }

  const baseValuation = runSimpleDcf(baseCase);
  const scenarioValuation = runSimpleDcf({
    ...baseCase,
    growth: adjustedAssumptions.growth,
    margin: adjustedAssumptions.margin,
    discount_rate: adjustedAssumptions.discount_rate,
  });

  const valuationChangePct =
    (scenarioValuation.enterprise_value - baseValuation.enterprise_value) / baseValuation.enterprise_value;

  const baseYearFiveRevenue = baseValuation.projections.at(-1)?.revenue ?? 0;
  const scenarioYearFiveRevenue = scenarioValuation.projections.at(-1)?.revenue ?? 0;

  const sections: InvestorGradeSection[] = [
    {
      title: 'SECTION 1: Earnings Snapshot',
      bullets: [
        `Revenue: ${formatCurrencyBillions(baseCase.revenue)} (source: provided base case dataset)`,
        `Growth: ${formatPercent(baseCase.growth)} (source: provided base case dataset)`,
        `Margin: ${formatPercent(baseCase.margin)} (source: provided base case dataset)`,
      ],
    },
    {
      title: 'SECTION 2: AI Smart Assumptions Applied',
      bullets: [
        `${scenario.name} is translated deterministically into Tesla model inputs before valuation.`,
        `Revenue growth increases from ${formatPercent(baseCase.growth)} to ${formatPercent(adjustedAssumptions.growth)} because lower rates are assumed to support demand conversion.`,
        `Margin decreases from ${formatPercent(baseCase.margin)} to ${formatPercent(adjustedAssumptions.margin)} because easier financing is paired with a modest profitability give-back.`,
        `Discount rate decreases from ${formatPercent(baseCase.discount_rate)} to ${formatPercent(adjustedAssumptions.discount_rate)}, lifting the present value of projected cash flows and terminal value.`,
      ],
    },
    {
      title: 'SECTION 3: Scenario-Based DCF Output',
      bullets: [
        `Base Valuation (estimate): ${formatCurrencyBillions(baseValuation.enterprise_value)} enterprise value`,
        `Scenario Valuation: ${formatCurrencyBillions(scenarioValuation.enterprise_value)} enterprise value`,
        `% Change: ${formatPercent(valuationChangePct)}`,
      ],
    },
    {
      title: 'SECTION 4: Key Drivers of Change',
      bullets: [
        `Revenue impact: Year 5 revenue rises from ${formatCurrencyBillions(baseYearFiveRevenue)} to ${formatCurrencyBillions(scenarioYearFiveRevenue)} as growth moves from ${formatPercent(baseCase.growth)} to ${formatPercent(adjustedAssumptions.growth)}.`,
        `Margin impact: Free cash flow conversion is partially offset because margin compresses from ${formatPercent(baseCase.margin)} to ${formatPercent(adjustedAssumptions.margin)}.`,
        `Discount rate impact: The rate falls from ${formatPercent(baseCase.discount_rate)} to ${formatPercent(adjustedAssumptions.discount_rate)}, which materially increases discounted cash flow value, especially in the terminal value.`,
      ],
    },
    {
      title: 'SECTION 5: Investor Interpretation',
      bullets: [
        `Valuation increases because the scenario combines faster top-line compounding with a lower discount rate, and those two effects outweigh the 50bps margin give-back.`,
        `The tradeoff is that the scenario is more volume-supportive than profitability-supportive: demand improves, but each dollar of revenue converts into slightly less free cash flow.`,
      ],
    },
    {
      title: 'SECTION 6: Risks',
      bullets: [
        'If lower rates do not translate into real demand, the growth uplift would be overstated.',
        'If margin pressure is worse than the modeled 50bps decline, the revenue benefit may not convert into higher valuation.',
        'If the discount rate does not stay 100bps lower, a meaningful portion of the terminal-value uplift would reverse.',
      ],
    },
  ];

  return {
    company: baseCase.company,
    workflow: 'macro_change_to_company_impact_to_dcf',
    sources: {
      base_case: 'provided_base_case_dataset',
      scenario: 'provided_macro_assumptions',
    },
    baseCase: {
      ...baseCase,
      source: 'provided_base_case_dataset',
    },
    scenario: {
      ...scenario,
      source: 'provided_macro_assumptions',
    },
    adjustedAssumptions,
    baseValuation,
    scenarioValuation,
    valuationChangePct,
    sections,
    formattedResponse: buildFormattedResponse(sections),
  };
}
