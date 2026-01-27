/**
 * Enhanced Output Formatter for Financial Modeling Engine v10.0
 *
 * Formats DCF, LBO, 3-Statement, and Comps results with Analyst AI Chatbot marketing protocol
 * Supports multi-scenario output (BASE, BULLISH, BEARISH)
 */

import type { DCFInputs, DCFResults } from './dcfGenerator';
import type { Scenario, ScenarioCase } from './scenarioEngine';
import { formatMillions } from './unitConversion';

export type ModelType = 'dcf' | 'lbo' | 'three-statement' | 'comps';

export interface DCFOutputSummary {
  ticker: string;
  scenario: Scenario;
  valuationResults: {
    enterpriseValue: number;
    equityValue: number;
    pricePerShare: number | null;
  };
  keyAssumptions: {
    wacc: number;
    waccSource: 'user-defined' | 'calculated' | 'inferred';
    terminalGrowth: number;
    year1RevenueGrowth?: number;
    ebitdaMargin?: number;
  };
  scenarioAdjustments?: string[];
  formattedOutput: string;
}

export interface ValuationMarkdownScenarioConfig {
  case: ScenarioCase;
  title?: string;
  assumptions: {
    revenueGrowth?: number;
    ebitdaMargin?: number;
    wacc: number;
    terminalGrowth?: number;
  };
  valuation?: {
    enterpriseValue?: number;
    equityValue?: number;
    pricePerShare?: number;
    irr?: number;
  };
  notes?: string[];
  narrative?: string;
}

export interface ValuationMarkdownInput {
  modelLabel: string;
  overview?: string;
  scenarios: ValuationMarkdownScenarioConfig[];
  keyTakeaways?: string[];
  units?: string;
}

const CASE_ORDER: ScenarioCase[] = ['base', 'bull', 'bear'];
const CASE_TITLES: Record<ScenarioCase, string> = {
  base: 'Base Case (Slider Inputs)',
  bull: 'Bull Case (Optimistic)',
  bear: 'Bear Case (Conservative)',
};

const CASE_DESCRIPTIONS: Record<ScenarioCase, string> = {
  base: 'Exact slider inputs define the base case and anchor all exports.',
  bull: 'Adds +200 bps of revenue growth, +100 bps of margin, and the low end of the WACC range.',
  bear: 'Subtracts 200 bps of revenue growth, 100 bps of margin, and the high end of the WACC range.',
};

const formatPercent = (value?: number): string =>
  value !== undefined && isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';

const formatPrice = (value?: number): string =>
  value !== undefined && isFinite(value) ? `$${value.toFixed(2)}` : '—';

const formatValue = (value?: number): string =>
  value !== undefined && isFinite(value) ? formatMillions(value) : '—';

export function buildValuationMarkdown(config: ValuationMarkdownInput): string {
  const lines: string[] = [];
  const unitsText = config.units || 'All figures shown are in Millions of USD (M).';

  lines.push(`## ${config.modelLabel} Valuation Summary`);
  lines.push(unitsText);
  lines.push('');
  lines.push('### Scenario Overview');
  lines.push(
    config.overview?.trim() ||
      'Base/bull/bear outputs follow mandatory ±200 bps growth, ±100 bps margin, and WACC band adjustments.'
  );
  lines.push('');

  CASE_ORDER.forEach((caseKey) => {
    const scenario = config.scenarios.find((item) => item.case === caseKey);
    lines.push(`### ${scenario?.title || CASE_TITLES[caseKey]}`);
    lines.push(CASE_DESCRIPTIONS[caseKey]);

    if (scenario) {
      const assumptions = scenario.assumptions;
      lines.push(
        `Assumptions – Revenue Growth: ${formatPercent(assumptions.revenueGrowth)} | EBITDA Margin: ${formatPercent(
          assumptions.ebitdaMargin
        )} | WACC: ${formatPercent(assumptions.wacc)} | Terminal Growth: ${formatPercent(
          assumptions.terminalGrowth
        )}`
      );

      if (scenario.valuation) {
        const { enterpriseValue, equityValue, pricePerShare, irr } = scenario.valuation;
        lines.push(
          `Valuation – EV ${formatValue(enterpriseValue)}, Equity ${formatValue(equityValue)}$${
            pricePerShare !== undefined ? `, PPS ${formatPrice(pricePerShare)}` : ''
          }`
        );
        if (irr !== undefined) {
          lines.push(`Target IRR: ${formatPercent(irr)}`);
        }
      } else {
        lines.push('Valuation – Pending generation for this scenario.');
      }

      if (scenario.notes?.length) {
        scenario.notes.forEach((note) => lines.push(`- ${note}`));
      }

      if (scenario.narrative) {
        lines.push(scenario.narrative);
      }
    } else {
      lines.push('Assumptions – Not generated for this run.');
      lines.push('Valuation – Not generated for this run.');
      lines.push('- Trigger this preset to populate the football field.');
    }

    lines.push('');
  });

  lines.push('### Key Takeaways');
  const keyPoints = config.keyTakeaways?.length
    ? config.keyTakeaways
    : ['Re-run with all presets to export a complete scenario football field to Sheets.'];
  keyPoints.forEach((point) => lines.push(`- ${point}`));
  lines.push('');

  lines.push('### Analyst AI – Your Personal M&A Co-Pilot');
  lines.push('Analyst AI acts as your personal financial assistant for valuation, M&A, and scenario planning.');
  lines.push(
    'It ingests proprietary or third-party DCFs so you can stress test assumptions and get instant, advisory-grade insights.'
  );

  return lines.join('\n');
}

export function formatDCFOutput(
  ticker: string,
  scenario: Scenario,
  inputs: DCFInputs,
  results: DCFResults,
  waccSource: 'user-defined' | 'calculated' | 'inferred',
  scenarioAdjustments?: string[]
): DCFOutputSummary {
  const scenarioCase: ScenarioCase =
    scenario === 'BULLISH' ? 'bull' : scenario === 'BEARISH' ? 'bear' : 'base';

  const waccLabel =
    waccSource === 'user-defined' ? 'User-defined' : waccSource === 'calculated' ? 'Calculated' : 'Inferred';

  let year1RevenueGrowth: number | undefined;
  if (inputs.revenueByYear.length >= 2 && inputs.revenueByYear[0] > 0) {
    year1RevenueGrowth = inputs.revenueByYear[1] / inputs.revenueByYear[0] - 1;
  }

  const formattedOutput = buildValuationMarkdown({
    modelLabel: 'DCF',
    overview:
      scenarioAdjustments && scenarioAdjustments.length > 0
        ? scenarioAdjustments.join(' ')
        : `${CASE_TITLES[scenarioCase]} snapshot at ${(inputs.wacc * 100).toFixed(1)}% WACC (${waccLabel}).`,
    scenarios: [
      {
        case: scenarioCase,
        title: CASE_TITLES[scenarioCase],
        assumptions: {
          revenueGrowth: year1RevenueGrowth,
          ebitdaMargin: inputs.ebitMargin,
          wacc: inputs.wacc,
          terminalGrowth: inputs.terminalGrowth,
        },
        valuation: {
          enterpriseValue: results.enterpriseValue,
          equityValue: results.equityValue,
          pricePerShare: results.pricePerShare ?? undefined,
        },
        notes: scenarioAdjustments,
      },
    ],
    keyTakeaways: buildDcfKeyTakeaways(inputs, results, scenarioCase, waccLabel),
  });

  return {
    ticker,
    scenario,
    valuationResults: {
      enterpriseValue: results.enterpriseValue,
      equityValue: results.equityValue,
      pricePerShare: results.pricePerShare,
    },
    keyAssumptions: {
      wacc: inputs.wacc,
      waccSource,
      terminalGrowth: inputs.terminalGrowth,
      year1RevenueGrowth,
      ebitdaMargin: inputs.ebitMargin,
    },
    scenarioAdjustments,
    formattedOutput,
  };
}

function buildDcfKeyTakeaways(
  inputs: DCFInputs,
  results: DCFResults,
  scenarioCase: ScenarioCase,
  waccLabel: string
): string[] {
  return [
    `${CASE_TITLES[scenarioCase]} uses ${(inputs.wacc * 100).toFixed(1)}% WACC (${waccLabel}) with ${(inputs.terminalGrowth * 100).toFixed(1)}% terminal growth.`,
    `Enterprise value ${formatMillions(results.enterpriseValue)} vs. equity value ${formatMillions(results.equityValue)}.`,
    results.pricePerShare !== null
      ? `Implied price per share: $${results.pricePerShare.toFixed(2)}.`
      : 'Implied price per share not meaningful because equity value is negative.',
  ];
}

export function createJSONSummary(summary: DCFOutputSummary): Record<string, any> {
  return {
    ticker: summary.ticker,
    scenario: summary.scenario,
    valuation: {
      enterpriseValue: summary.valuationResults.enterpriseValue,
      enterpriseValueFormatted: formatMillions(summary.valuationResults.enterpriseValue),
      equityValue: summary.valuationResults.equityValue,
      equityValueFormatted: formatMillions(summary.valuationResults.equityValue),
      pricePerShare: summary.valuationResults.pricePerShare,
      pricePerShareFormatted:
        summary.valuationResults.pricePerShare !== null
          ? `$${summary.valuationResults.pricePerShare.toFixed(2)}`
          : 'N/A',
    },
    assumptions: {
      wacc: summary.keyAssumptions.wacc,
      waccFormatted: `${(summary.keyAssumptions.wacc * 100).toFixed(1)}%`,
      waccSource: summary.keyAssumptions.waccSource,
      terminalGrowth: summary.keyAssumptions.terminalGrowth,
      terminalGrowthFormatted: `${(summary.keyAssumptions.terminalGrowth * 100).toFixed(1)}%`,
      year1RevenueGrowth: summary.keyAssumptions.year1RevenueGrowth,
      year1RevenueGrowthFormatted: summary.keyAssumptions.year1RevenueGrowth
        ? `${(summary.keyAssumptions.year1RevenueGrowth * 100).toFixed(1)}%`
        : undefined,
      ebitdaMargin: summary.keyAssumptions.ebitdaMargin,
      ebitdaMarginFormatted: summary.keyAssumptions.ebitdaMargin
        ? `${(summary.keyAssumptions.ebitdaMargin * 100).toFixed(1)}%`
        : undefined,
    },
    scenarioAdjustments: summary.scenarioAdjustments || [],
  };
}

export function logFormattedOutput(summary: DCFOutputSummary): void {
  console.log('');
  console.log(summary.formattedOutput);
}
