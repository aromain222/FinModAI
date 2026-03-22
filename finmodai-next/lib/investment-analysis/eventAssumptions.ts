import type { DeterministicValuationAssumptions } from '@/lib/investment-analysis/types';
import type {
  InvestmentEventAssumptionDelta,
  InvestmentEventAssumptionDeltaInput,
  InvestmentEventAssumptionDeltaResult,
  InvestmentEventCategory,
  InvestmentEventConfidence,
  InvestmentScenarioBias,
} from '@/lib/investment-analysis/eventTypes';

type ShockTemplate = {
  revenueGrowthBps?: number[];
  operatingMarginBps?: number[];
  waccBps?: number;
  terminalGrowthBps?: number;
  scenarioBias: InvestmentScenarioBias;
  rationaleSummary: string;
};

function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function applyPathShock(basePath: number[], shockBps: number[] | undefined, bounds: { min: number; max: number }): number[] {
  if (!shockBps || shockBps.length === 0) return [...basePath];
  return basePath.map((value, index) => {
    const delta = bpsToDecimal(shockBps[Math.min(index, shockBps.length - 1)] ?? 0);
    return clamp(value + delta, bounds.min, bounds.max);
  });
}

function applyPointShock(baseValue: number, shockBps: number | undefined, bounds: { min: number; max: number }): number {
  if (!shockBps) return baseValue;
  return clamp(baseValue + bpsToDecimal(shockBps), bounds.min, bounds.max);
}

function buildPathDelta(
  lever: 'revenueGrowthByYear' | 'operatingMarginByYear',
  shockBps: number[] | undefined,
  rationale: string,
  confidence: InvestmentEventConfidence,
): InvestmentEventAssumptionDelta | null {
  if (!shockBps || shockBps.every((value) => value === 0)) return null;
  const direction = shockBps.every((value) => value > 0)
    ? 'up'
    : shockBps.every((value) => value < 0)
      ? 'down'
      : 'mixed';

  return {
    lever,
    direction,
    unit: 'bps',
    amount: shockBps,
    rationale,
    confidence,
  };
}

function buildPointDelta(
  lever: 'wacc' | 'terminalGrowthRate',
  shockBps: number | undefined,
  rationale: string,
  confidence: InvestmentEventConfidence,
): InvestmentEventAssumptionDelta | null {
  if (!shockBps) return null;
  return {
    lever,
    direction: shockBps > 0 ? 'up' : shockBps < 0 ? 'down' : 'flat',
    unit: 'bps',
    amount: shockBps,
    rationale,
    confidence,
  };
}

function isDefenseLikeSector(sector?: string | null, industry?: string | null): boolean {
  const text = `${sector ?? ''} ${industry ?? ''}`.trim();
  return /\bdefen[cs]e\b|\baerospace\b|\bgovernment contracting\b/i.test(text);
}

function getShockTemplate(
  category: InvestmentEventCategory,
  company?: InvestmentEventAssumptionDeltaInput['company'],
): ShockTemplate {
  const defenseLike = isDefenseLikeSector(company?.sector, company?.industry);

  switch (category) {
    case 'management_transition':
      return {
        revenueGrowthBps: [-50, -50, -25, 0, 0],
        operatingMarginBps: [-30, -30, -20, -10, 0],
        waccBps: 50,
        terminalGrowthBps: -25,
        scenarioBias: 'bearish',
        rationaleSummary:
          'Management transitions usually raise near-term execution risk and the required return more than they change the long-run business model outright.',
      };
    case 'geopolitical_conflict':
      if (defenseLike) {
        return {
          revenueGrowthBps: [150, 125, 100, 75, 50],
          operatingMarginBps: [25, 25, 20, 15, 10],
          waccBps: -25,
          terminalGrowthBps: 10,
          scenarioBias: 'bullish',
          rationaleSummary:
            'For defense-linked businesses, prolonged conflict can improve demand visibility and backlog support, with only modest margin or risk-premium changes.',
        };
      }

      return {
        revenueGrowthBps: [-75, -75, -50, -25, -25],
        operatingMarginBps: [-50, -50, -35, -20, -10],
        waccBps: 50,
        terminalGrowthBps: -25,
        scenarioBias: 'bearish',
        rationaleSummary:
          'Geopolitical conflict usually raises risk premium and cost pressure, while creating demand uncertainty outside direct beneficiaries.',
      };
    case 'macro_slowdown':
      return {
        revenueGrowthBps: [-200, -150, -100, -75, -50],
        operatingMarginBps: [-100, -75, -50, -25, -25],
        waccBps: 75,
        terminalGrowthBps: -50,
        scenarioBias: 'bearish',
        rationaleSummary:
          'Recession conditions generally pressure demand, reduce operating leverage, and compress value through a higher discount rate and lower terminal support.',
      };
    case 'regulatory_shift':
      return {
        revenueGrowthBps: [-50, -50, -25, -25, 0],
        operatingMarginBps: [-75, -50, -50, -25, -25],
        waccBps: 50,
        terminalGrowthBps: -25,
        scenarioBias: 'bearish',
        rationaleSummary:
          'Regulatory shifts usually act through margin drag and a higher risk premium before they show up as large top-line changes.',
      };
    case 'major_contract_win':
      return {
        revenueGrowthBps: [150, 125, 100, 75, 50],
        operatingMarginBps: [25, 25, 15, 10, 10],
        waccBps: -25,
        terminalGrowthBps: 10,
        scenarioBias: 'bullish',
        rationaleSummary:
          'A major contract win usually improves revenue visibility first, with modest help to mix, margin, and perceived execution risk.',
      };
    case 'product_catalyst':
      return {
        revenueGrowthBps: [125, 100, 75, 50, 25],
        operatingMarginBps: [0, 10, 15, 15, 10],
        waccBps: -25,
        terminalGrowthBps: 10,
        scenarioBias: 'bullish',
        rationaleSummary:
          'Product catalysts usually pull forward demand and can support mix over time, but the effect should stay modest until commercialization is clearer.',
      };
    case 'unknown':
    default:
      return {
        scenarioBias: 'neutral',
        rationaleSummary:
          'The event did not classify strongly enough to support a deterministic assumption shock, so the engine returns the base case unchanged.',
      };
  }
}

export function deriveEventAwareAssumptionDeltas(
  input: InvestmentEventAssumptionDeltaInput,
): InvestmentEventAssumptionDeltaResult {
  const template = getShockTemplate(input.event.category, input.company);
  const adjustedAssumptions = {
    revenueGrowthByYear: applyPathShock(input.baseAssumptions.revenueGrowthByYear, template.revenueGrowthBps, {
      min: -0.4,
      max: 0.6,
    }),
    operatingMarginByYear: applyPathShock(input.baseAssumptions.operatingMarginByYear, template.operatingMarginBps, {
      min: -0.2,
      max: 0.6,
    }),
    wacc: applyPointShock(input.baseAssumptions.wacc, template.waccBps, {
      min: 0.04,
      max: 0.2,
    }),
    terminalGrowthRate: applyPointShock(input.baseAssumptions.terminalGrowthRate, template.terminalGrowthBps, {
      min: 0,
      max: 0.06,
    }),
  };

  if (adjustedAssumptions.terminalGrowthRate >= adjustedAssumptions.wacc - 0.005) {
    adjustedAssumptions.terminalGrowthRate = clamp(
      adjustedAssumptions.wacc - 0.01,
      0,
      0.06,
    );
  }

  const deltas: InvestmentEventAssumptionDelta[] = [
    buildPathDelta(
      'revenueGrowthByYear',
      template.revenueGrowthBps,
      'Revenue growth path adjusted to reflect the event’s likely effect on demand or booking momentum.',
      input.event.confidence,
    ),
    buildPathDelta(
      'operatingMarginByYear',
      template.operatingMarginBps,
      'Operating margin path adjusted to reflect likely pressure or support from mix, execution, or cost structure.',
      input.event.confidence,
    ),
    buildPointDelta(
      'wacc',
      template.waccBps,
      'WACC adjusted to capture the change in perceived business and valuation risk.',
      input.event.confidence,
    ),
    buildPointDelta(
      'terminalGrowthRate',
      template.terminalGrowthBps,
      'Terminal growth adjusted only modestly to reflect whether the event changes the longer-term growth support for the business.',
      input.event.confidence,
    ),
  ].filter((entry): entry is InvestmentEventAssumptionDelta => Boolean(entry));

  return {
    eventCategory: input.event.category,
    confidence: input.event.confidence,
    normalizedEventSummary: input.event.normalizedEventSummary,
    scenarioBias: template.scenarioBias,
    deltas,
    adjustedAssumptions,
    rationaleSummary: template.rationaleSummary,
  };
}

export function buildEventAdjustedAssumptions(
  baseAssumptions: DeterministicValuationAssumptions,
  eventDeltaResult: InvestmentEventAssumptionDeltaResult,
): DeterministicValuationAssumptions {
  return {
    ...baseAssumptions,
    revenueGrowthByYear: eventDeltaResult.adjustedAssumptions.revenueGrowthByYear,
    operatingMarginByYear: eventDeltaResult.adjustedAssumptions.operatingMarginByYear,
    wacc: eventDeltaResult.adjustedAssumptions.wacc,
    terminalGrowthRate: eventDeltaResult.adjustedAssumptions.terminalGrowthRate,
  };
}
