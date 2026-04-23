import type { SmartScenarioDcfReport } from '@/lib/scenarios/aiSmartDcf';

export type AnalystScenarioCardAssumptionRow = {
  metric: 'Growth' | 'Margin' | 'Discount Rate';
  base: number;
  scenario: number;
};

export type AnalystScenarioCardPayload = {
  modeLabel: string;
  title: string;
  company: string;
  baseValuation: number;
  scenarioValuation: number;
  changePercent: number;
  primaryDriver: 'Discount rate compression' | 'Operating performance';
  drivers: string[];
  assumptions: AnalystScenarioCardAssumptionRow[];
  interpretation: string[];
  risks: string[];
};

const TESLA_PATTERN = /\btesla\b|\btsla\b/i;
const MACRO_SCENARIO_CUES = [
  /\bwhat happens if\b/i,
  /\brates?\b/i,
  /\binterest rates?\b/i,
  /\bbps\b/i,
  /\bscenario\b/i,
  /\bimpact on\b/i,
];

function includesTeslaContext(message: string, explicitTicker?: string | null): boolean {
  if (TESLA_PATTERN.test(message)) return true;
  return String(explicitTicker || '')
    .trim()
    .toUpperCase() === 'TSLA';
}

function includesMacroCue(message: string): boolean {
  return MACRO_SCENARIO_CUES.some((pattern) => pattern.test(message));
}

export function looksLikeTeslaMacroScenarioPrompt(message: string, explicitTicker?: string | null): boolean {
  return includesTeslaContext(message, explicitTicker) && includesMacroCue(message);
}

export function buildAnalystScenarioCardPayload(report: SmartScenarioDcfReport): AnalystScenarioCardPayload {
  const assumptions: AnalystScenarioCardAssumptionRow[] = [
    {
      metric: 'Growth',
      base: report.baseCase.growth,
      scenario: report.adjustedAssumptions.growth,
    },
    {
      metric: 'Margin',
      base: report.baseCase.margin,
      scenario: report.adjustedAssumptions.margin,
    },
    {
      metric: 'Discount Rate',
      base: report.baseCase.discount_rate,
      scenario: report.adjustedAssumptions.discount_rate,
    },
  ];

  const sectionByTitle = new Map(report.sections.map((section) => [section.title, section.bullets] as const));
  const primaryDriver =
    Math.abs(report.baseCase.discount_rate - report.adjustedAssumptions.discount_rate) >
    Math.abs(report.baseCase.margin - report.adjustedAssumptions.margin)
      ? 'Discount rate compression'
      : 'Operating performance';
  const interpretation = [...(sectionByTitle.get('SECTION 5: Investor Interpretation') ?? [])];

  if (primaryDriver === 'Discount rate compression') {
    interpretation.push(
      'This suggests that valuation expansion is being driven more by macro conditions than underlying business performance.',
    );
  }

  return {
    modeLabel: 'Scenario Analysis Mode',
    title: 'AI Scenario: Rates ↓ 100bps',
    company: report.company,
    baseValuation: report.baseValuation.enterprise_value,
    scenarioValuation: report.scenarioValuation.enterprise_value,
    changePercent: report.valuationChangePct,
    primaryDriver,
    drivers: sectionByTitle.get('SECTION 4: Key Drivers of Change') ?? [],
    assumptions,
    interpretation,
    risks: sectionByTitle.get('SECTION 6: Risks') ?? [],
  };
}
