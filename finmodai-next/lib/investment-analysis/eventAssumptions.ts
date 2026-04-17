import type { DeterministicValuationAssumptions } from '@/lib/investment-analysis/types';
import type {
  InvestmentEventAssumptionDelta,
  InvestmentEventAssumptionDeltaInput,
  InvestmentEventAssumptionDeltaResult,
  InvestmentEventCategory,
  InvestmentEventConfidence,
  InvestmentScenarioBias,
} from '@/lib/investment-analysis/eventTypes';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

type ShockTemplate = {
  revenueGrowthBps?: number[];
  operatingMarginBps?: number[];
  waccBps?: number;
  terminalGrowthBps?: number;
  scenarioBias: InvestmentScenarioBias;
  rationaleSummary: string;
};

type AllowedDriver =
  | 'revenue_growth'
  | 'operating_margin'
  | 'cogs_percentage'
  | 'opex_percentage'
  | 'wacc'
  | 'terminal_growth_rate'
  | 'multiple';

type DriverChange = {
  old: number | null;
  new: number | null;
};

type EventDriverAdjustmentResponse = {
  event_type: string;
  affected_drivers: AllowedDriver[];
  changes: Record<AllowedDriver, DriverChange>;
  summary: string;
  detailed_reasoning: string;
};

const EVENT_DRIVER_ADJUSTMENT_SYSTEM_PROMPT = `You are a financial modeling engine embedded inside an AI-native financial operating system.

Your role is to translate real-world events into structured changes in financial model assumptions.

You are NOT generating a full model. You are ONLY adjusting key financial drivers based on the event provided.

You are given:
1. A description of a real-world event
2. A set of current model assumptions
3. A list of allowed financial drivers you can modify

Your job is to:
- Interpret the event
- Identify which financial drivers are affected
- Adjust those drivers in a realistic, context-aware way
- Explain your reasoning clearly

Allowed drivers:
- revenue_growth
- operating_margin
- cogs_percentage
- opex_percentage
- wacc
- terminal_growth_rate
- multiple

Rules:
- Modify only relevant drivers
- Keep changes conservative and explainable
- Maintain internal consistency
- Only include drivers that are actually changed; unchanged fields must remain null
- Do not invent new variables
- Do not hallucinate data
- Return JSON only in this exact shape:
{
  "event_type": "",
  "affected_drivers": [],
  "changes": {
    "revenue_growth": { "old": null, "new": null },
    "operating_margin": { "old": null, "new": null },
    "cogs_percentage": { "old": null, "new": null },
    "opex_percentage": { "old": null, "new": null },
    "wacc": { "old": null, "new": null },
    "terminal_growth_rate": { "old": null, "new": null },
    "multiple": { "old": null, "new": null }
  },
  "summary": "",
  "detailed_reasoning": ""
}`;

const ALL_ALLOWED_DRIVERS: AllowedDriver[] = [
  'revenue_growth',
  'operating_margin',
  'cogs_percentage',
  'opex_percentage',
  'wacc',
  'terminal_growth_rate',
  'multiple',
];

function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const slice = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return JSON.parse(slice);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeDriverChange(value: unknown): DriverChange {
  if (!value || typeof value !== 'object') {
    return { old: null, new: null };
  }
  const row = value as { old?: unknown; new?: unknown };
  return {
    old: isFiniteNumber(row.old) ? row.old : null,
    new: isFiniteNumber(row.new) ? row.new : null,
  };
}

function normalizeEventDriverAdjustmentResponse(raw: unknown): EventDriverAdjustmentResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as {
    event_type?: unknown;
    affected_drivers?: unknown;
    changes?: unknown;
    summary?: unknown;
    detailed_reasoning?: unknown;
  };
  if (
    typeof candidate.event_type !== 'string' ||
    !Array.isArray(candidate.affected_drivers) ||
    typeof candidate.summary !== 'string' ||
    typeof candidate.detailed_reasoning !== 'string' ||
    !candidate.changes ||
    typeof candidate.changes !== 'object'
  ) {
    return null;
  }

  const affectedDrivers = candidate.affected_drivers.filter((driver): driver is AllowedDriver =>
    typeof driver === 'string' && ALL_ALLOWED_DRIVERS.includes(driver as AllowedDriver),
  );

  const changesRecord = candidate.changes as Record<string, unknown>;
  const changes = ALL_ALLOWED_DRIVERS.reduce<Record<AllowedDriver, DriverChange>>((acc, driver) => {
    acc[driver] = normalizeDriverChange(changesRecord[driver]);
    return acc;
  }, {} as Record<AllowedDriver, DriverChange>);

  return {
    event_type: candidate.event_type.trim(),
    affected_drivers: affectedDrivers,
    changes,
    summary: candidate.summary.trim(),
    detailed_reasoning: candidate.detailed_reasoning.trim(),
  };
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

function buildAiPromptPayload(
  input: InvestmentEventAssumptionDeltaInput & { rawEventText: string },
): Record<string, unknown> {
  return {
    event: input.rawEventText,
    company_context: {
      company_name: input.company?.companyName ?? null,
      sector: input.company?.sector ?? null,
      industry: input.company?.industry ?? null,
      classified_event_category: input.event.category,
      event_confidence: input.event.confidence,
      normalized_event_summary: input.event.normalizedEventSummary,
    },
    current_assumptions: {
      revenue_growth: input.baseAssumptions.revenueGrowthByYear[0] ?? null,
      operating_margin: input.baseAssumptions.operatingMarginByYear[0] ?? null,
      cogs_percentage: null,
      opex_percentage: null,
      wacc: input.baseAssumptions.wacc,
      terminal_growth_rate: input.baseAssumptions.terminalGrowthRate,
      multiple: null,
    },
    allowed_drivers: ALL_ALLOWED_DRIVERS,
  };
}

function getBiasImpact(driver: AllowedDriver, change: DriverChange): number {
  if (!isFiniteNumber(change.old) || !isFiniteNumber(change.new)) return 0;
  const delta = change.new - change.old;
  switch (driver) {
    case 'revenue_growth':
    case 'operating_margin':
    case 'terminal_growth_rate':
    case 'multiple':
      return delta;
    case 'cogs_percentage':
    case 'opex_percentage':
    case 'wacc':
      return -delta;
    default:
      return 0;
  }
}

function deriveScenarioBiasFromDriverChanges(
  changes: Record<AllowedDriver, DriverChange>,
  fallback: InvestmentScenarioBias,
): InvestmentScenarioBias {
  const score = ALL_ALLOWED_DRIVERS.reduce((total, driver) => total + getBiasImpact(driver, changes[driver]), 0);
  if (Math.abs(score) < 1e-9) return fallback;
  return score > 0 ? 'bullish' : 'bearish';
}

function pointChangeToBps(change: DriverChange): number | null {
  if (!isFiniteNumber(change.old) || !isFiniteNumber(change.new)) return null;
  return Math.round((change.new - change.old) * 10000);
}

export function buildEventDeltaResultFromDriverAdjustmentResponse(
  input: InvestmentEventAssumptionDeltaInput,
  response: EventDriverAdjustmentResponse,
  fallback: InvestmentEventAssumptionDeltaResult,
): InvestmentEventAssumptionDeltaResult | null {
  const revenueGrowthBps = pointChangeToBps(response.changes.revenue_growth);
  const operatingMarginBps = pointChangeToBps(response.changes.operating_margin);
  const waccBps = pointChangeToBps(response.changes.wacc);
  const terminalGrowthBps = pointChangeToBps(response.changes.terminal_growth_rate);

  const deltas: InvestmentEventAssumptionDelta[] = [];

  if (revenueGrowthBps) {
    deltas.push({
      lever: 'revenueGrowthByYear',
      direction: revenueGrowthBps > 0 ? 'up' : 'down',
      unit: 'bps',
      amount: Array.from({ length: input.baseAssumptions.revenueGrowthByYear.length }, () => revenueGrowthBps),
      rationale: 'Revenue growth adjusted from the event-aware driver translation.',
      confidence: input.event.confidence,
    });
  }

  if (operatingMarginBps) {
    deltas.push({
      lever: 'operatingMarginByYear',
      direction: operatingMarginBps > 0 ? 'up' : 'down',
      unit: 'bps',
      amount: Array.from({ length: input.baseAssumptions.operatingMarginByYear.length }, () => operatingMarginBps),
      rationale: 'Operating margin adjusted from the event-aware driver translation.',
      confidence: input.event.confidence,
    });
  }

  if (waccBps) {
    deltas.push({
      lever: 'wacc',
      direction: waccBps > 0 ? 'up' : 'down',
      unit: 'bps',
      amount: waccBps,
      rationale: 'WACC adjusted from the event-aware driver translation.',
      confidence: input.event.confidence,
    });
  }

  if (terminalGrowthBps) {
    deltas.push({
      lever: 'terminalGrowthRate',
      direction: terminalGrowthBps > 0 ? 'up' : 'down',
      unit: 'bps',
      amount: terminalGrowthBps,
      rationale: 'Terminal growth adjusted from the event-aware driver translation.',
      confidence: input.event.confidence,
    });
  }

  if (deltas.length === 0) return null;

  const adjustedAssumptions = {
    revenueGrowthByYear: applyPathShock(
      input.baseAssumptions.revenueGrowthByYear,
      revenueGrowthBps ? Array.from({ length: input.baseAssumptions.revenueGrowthByYear.length }, () => revenueGrowthBps) : undefined,
      { min: -0.4, max: 0.6 },
    ),
    operatingMarginByYear: applyPathShock(
      input.baseAssumptions.operatingMarginByYear,
      operatingMarginBps ? Array.from({ length: input.baseAssumptions.operatingMarginByYear.length }, () => operatingMarginBps) : undefined,
      { min: -0.2, max: 0.6 },
    ),
    wacc: applyPointShock(input.baseAssumptions.wacc, waccBps ?? undefined, { min: 0.04, max: 0.2 }),
    terminalGrowthRate: applyPointShock(
      input.baseAssumptions.terminalGrowthRate,
      terminalGrowthBps ?? undefined,
      { min: 0, max: 0.06 },
    ),
  };

  if (adjustedAssumptions.terminalGrowthRate >= adjustedAssumptions.wacc - 0.005) {
    adjustedAssumptions.terminalGrowthRate = clamp(adjustedAssumptions.wacc - 0.01, 0, 0.06);
  }

  return {
    eventCategory: input.event.category,
    confidence: input.event.confidence,
    normalizedEventSummary: input.event.normalizedEventSummary,
    scenarioBias: deriveScenarioBiasFromDriverChanges(response.changes, fallback.scenarioBias),
    deltas,
    adjustedAssumptions,
    rationaleSummary: response.summary || fallback.rationaleSummary,
  };
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

function isCommodityLinkedSector(sector?: string | null, industry?: string | null): boolean {
  const text = `${sector ?? ''} ${industry ?? ''}`.trim();
  return /\benergy\b|\boil\b|\bgas\b|\bmaterials?\b|\bmining\b|\bmetals?\b/i.test(text);
}

function isTradeExposedSector(sector?: string | null, industry?: string | null): boolean {
  const text = `${sector ?? ''} ${industry ?? ''}`.trim();
  return /\bsemiconductors?\b|\bhardware\b|\bindustrials?\b|\bconsumer electronics\b|\blogistics\b|\bapparel\b/i.test(text);
}

function isDurationSensitiveSector(sector?: string | null, industry?: string | null): boolean {
  const text = `${sector ?? ''} ${industry ?? ''}`.trim();
  return /\breal estate\b|\butilities\b|\bsoftware\b|\bsaas\b|\bfinancials?\b/i.test(text);
}

function getShockTemplate(
  category: InvestmentEventCategory,
  company?: InvestmentEventAssumptionDeltaInput['company'],
): ShockTemplate {
  const defenseLike = isDefenseLikeSector(company?.sector, company?.industry);
  const commodityLinked = isCommodityLinkedSector(company?.sector, company?.industry);
  const tradeExposed = isTradeExposedSector(company?.sector, company?.industry);
  const durationSensitive = isDurationSensitiveSector(company?.sector, company?.industry);

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
    case 'inflation_shock':
      if (commodityLinked) {
        return {
          revenueGrowthBps: [100, 75, 50, 25, 25],
          operatingMarginBps: [50, 50, 35, 20, 10],
          waccBps: 25,
          terminalGrowthBps: 0,
          scenarioBias: 'bullish',
          rationaleSummary:
            'Commodity-linked businesses can see stronger near-term pricing and cash flow in an inflation shock, although discount rates still rise modestly.',
        };
      }
      return {
        revenueGrowthBps: [-75, -50, -50, -25, -25],
        operatingMarginBps: [-125, -100, -75, -50, -25],
        waccBps: 75,
        terminalGrowthBps: -25,
        scenarioBias: 'bearish',
        rationaleSummary:
          'Inflation shocks usually hurt real demand and margins before they help nominal revenue, while higher discount rates compress valuation support.',
      };
    case 'trade_fragmentation':
      if (tradeExposed) {
        return {
          revenueGrowthBps: [-125, -100, -75, -50, -50],
          operatingMarginBps: [-100, -75, -75, -50, -25],
          waccBps: 75,
          terminalGrowthBps: -25,
          scenarioBias: 'bearish',
          rationaleSummary:
            'Trade fragmentation usually lowers efficiency, shrinks addressable markets, and raises compliance and sourcing costs for globally exposed businesses.',
        };
      }
      return {
        revenueGrowthBps: [-50, -50, -25, -25, 0],
        operatingMarginBps: [-50, -50, -35, -25, -10],
        waccBps: 50,
        terminalGrowthBps: -10,
        scenarioBias: 'bearish',
        rationaleSummary:
          'Trade fragmentation tends to act through slower growth, higher costs, and lower strategic visibility even when direct exposure is not extreme.',
        };
    case 'debt_cycle_stress':
      return {
        revenueGrowthBps: durationSensitive ? [-100, -75, -50, -25, -25] : [-50, -50, -25, -25, -25],
        operatingMarginBps: durationSensitive ? [-75, -50, -50, -25, -25] : [-50, -35, -25, -25, -10],
        waccBps: durationSensitive ? 100 : 75,
        terminalGrowthBps: -50,
        scenarioBias: 'bearish',
        rationaleSummary:
          'Debt-cycle stress raises the required return and weakens valuation support, especially for duration-sensitive or financing-heavy businesses.',
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

export async function deriveEventAwareAssumptionDeltasWithAi(
  input: InvestmentEventAssumptionDeltaInput & { rawEventText?: string | null },
): Promise<InvestmentEventAssumptionDeltaResult> {
  const fallback = deriveEventAwareAssumptionDeltas(input);
  const rawEventText = input.rawEventText?.trim();
  if (!rawEventText) return fallback;

  try {
    const result = await generateTextWithProviderFallback({
      preferredProvider: 'openai',
      clientType: 'service',
      temperature: 0.1,
      maxTokens: 900,
      messages: [
        { role: 'system', content: EVENT_DRIVER_ADJUSTMENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify(buildAiPromptPayload({ ...input, rawEventText }), null, 2),
        },
      ],
    });
    const parsed = normalizeEventDriverAdjustmentResponse(extractJsonObject(result?.text ?? ''));
    if (!parsed) return fallback;

    const translated = buildEventDeltaResultFromDriverAdjustmentResponse(input, parsed, fallback);
    return translated ?? fallback;
  } catch {
    return fallback;
  }
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
