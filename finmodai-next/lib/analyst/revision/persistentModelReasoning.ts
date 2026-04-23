import { analystModelChatDeps } from '@/lib/analyst/modelChatDeps';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/types';
import type { ExtractedModelInputs } from '@/lib/model-generator/extractInputs';

type FinancialReasoningIntent = 'adjustment' | 'scenario' | 'explanation' | 'event_update' | 'other';

type FinancialReasoningDriverChange = {
  old: number | null;
  new: number | null;
};

export type FinancialReasoningResponse = {
  intent: FinancialReasoningIntent;
  changes: {
    revenue_growth: FinancialReasoningDriverChange;
    operating_margin: FinancialReasoningDriverChange;
    cogs_percentage: FinancialReasoningDriverChange;
    opex_percentage: FinancialReasoningDriverChange;
    wacc: FinancialReasoningDriverChange;
    terminal_growth_rate: FinancialReasoningDriverChange;
    multiple: FinancialReasoningDriverChange;
  };
  updated_outputs?: {
    valuation_change?: number | null;
    key_driver_impact?: string;
  } | null;
  summary: string;
  detailed_reasoning: string;
};

type PersistentModelDriverContext = {
  revenue_growth: number | null;
  operating_margin: number | null;
  cogs_percentage: number | null;
  opex_percentage: number | null;
  wacc: number | null;
  terminal_growth_rate: number | null;
  multiple: number | null;
};

const PERSISTENT_MODEL_REASONING_SYSTEM_PROMPT = `You are the financial reasoning engine inside CapitalBase, an AI-native financial operating system.

You operate on a persistent financial model that the user is actively interacting with.

Your role is to interpret user prompts and update, analyze, or explain the current model in a structured and financially sound way.

----------------------------------------
MODEL CONTEXT
----------------------------------------

You are always given the current model state, which includes:

- model_type (e.g. DCF, 3-statement, comps)
- company_name
- current assumptions:
  - revenue_growth
  - operating_margin
  - cogs_percentage
  - opex_percentage
  - wacc
  - terminal_growth_rate
  - multiple
- latest outputs:
  - valuation
  - key metrics
- history of prior changes

You MUST treat this model as persistent. Do NOT reset or rebuild unless explicitly asked.

----------------------------------------
PRIMARY OBJECTIVE
----------------------------------------

For every user prompt, determine the intent and respond appropriately while maintaining model continuity.

----------------------------------------
INTENT CLASSIFICATION
----------------------------------------

Classify the user prompt into ONE of the following:

1. "adjustment"
2. "scenario"
3. "explanation"
4. "event_update"
5. "other"

----------------------------------------
INSTRUCTIONS BY INTENT
----------------------------------------

IF intent = "adjustment" OR "event_update":
- Map the request to relevant financial drivers
- Adjust ONLY the affected drivers
- Maintain internal consistency
- Use realistic magnitudes (no extreme changes)
- Apply changes to the existing model

IF intent = "scenario":
- Generate a coherent set of assumption changes
- Clearly define base vs new case
- Apply structured changes across multiple drivers

IF intent = "explanation":
- Do NOT change the model
- Explain:
  - key drivers of valuation
  - sensitivities
  - risks

----------------------------------------
DRIVER CONSTRAINTS
----------------------------------------

You may ONLY modify:
- revenue_growth
- operating_margin
- cogs_percentage
- opex_percentage
- wacc
- terminal_growth_rate
- multiple

----------------------------------------
OUTPUT FORMAT (STRICT)
----------------------------------------

Return a structured JSON:

{
  "intent": "",
  "changes": {
    "revenue_growth": { "old": null, "new": null },
    "operating_margin": { "old": null, "new": null },
    "cogs_percentage": { "old": null, "new": null },
    "opex_percentage": { "old": null, "new": null },
    "wacc": { "old": null, "new": null },
    "terminal_growth_rate": { "old": null, "new": null },
    "multiple": { "old": null, "new": null }
  },
  "updated_outputs": {
    "valuation_change": null,
    "key_driver_impact": ""
  },
  "summary": "",
  "detailed_reasoning": ""
}

----------------------------------------
IMPORTANT RULES
----------------------------------------

- ALWAYS operate on the current model (no resets)
- ONLY change relevant drivers
- Keep all changes explainable and financially logical
- Ensure consistency across drivers
- Prefer conservative, realistic adjustments
- DO NOT hallucinate data`;

const PERSISTENT_DRIVER_KEYS = [
  'revenue_growth',
  'operating_margin',
  'cogs_percentage',
  'opex_percentage',
  'wacc',
  'terminal_growth_rate',
  'multiple',
] as const;

type PersistentDriverKey = (typeof PERSISTENT_DRIVER_KEYS)[number];

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

function averageNumericArray(values: unknown): number | null {
  if (!Array.isArray(values)) return null;
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function clampNumber(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}

function buildEmptyDriverChanges(): FinancialReasoningResponse['changes'] {
  return {
    revenue_growth: { old: null, new: null },
    operating_margin: { old: null, new: null },
    cogs_percentage: { old: null, new: null },
    opex_percentage: { old: null, new: null },
    wacc: { old: null, new: null },
    terminal_growth_rate: { old: null, new: null },
    multiple: { old: null, new: null },
  };
}

function normalizeDriverChange(value: unknown): FinancialReasoningDriverChange {
  if (!value || typeof value !== 'object') return { old: null, new: null };
  const row = value as Record<string, unknown>;
  const oldValue = typeof row.old === 'number' && Number.isFinite(row.old) ? row.old : null;
  const newValue = typeof row.new === 'number' && Number.isFinite(row.new) ? row.new : null;
  return { old: oldValue, new: newValue };
}

function normalizeFinancialReasoningResponse(raw: string | null): FinancialReasoningResponse | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const intent = parsed.intent;
    if (
      intent !== 'adjustment' &&
      intent !== 'scenario' &&
      intent !== 'explanation' &&
      intent !== 'event_update' &&
      intent !== 'other'
    ) {
      return null;
    }
    const changesRow = parsed.changes && typeof parsed.changes === 'object'
      ? parsed.changes as Record<string, unknown>
      : {};
    const changes = buildEmptyDriverChanges();
    for (const key of PERSISTENT_DRIVER_KEYS) {
      changes[key] = normalizeDriverChange(changesRow[key]);
    }
    return {
      intent,
      changes,
      updated_outputs:
        parsed.updated_outputs && typeof parsed.updated_outputs === 'object'
          ? {
              valuation_change:
                typeof (parsed.updated_outputs as Record<string, unknown>).valuation_change === 'number'
                  ? ((parsed.updated_outputs as Record<string, unknown>).valuation_change as number)
                  : null,
              key_driver_impact:
                typeof (parsed.updated_outputs as Record<string, unknown>).key_driver_impact === 'string'
                  ? ((parsed.updated_outputs as Record<string, unknown>).key_driver_impact as string)
                  : '',
            }
          : null,
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      detailed_reasoning: typeof parsed.detailed_reasoning === 'string' ? parsed.detailed_reasoning.trim() : '',
    };
  } catch {
    return null;
  }
}

export function buildPersistentDriverContext(inputs: ExtractedModelInputs): PersistentModelDriverContext {
  const row = inputs as Record<string, unknown>;
  const revenueGrowth =
    averageNumericArray(row.revenueGrowth) ??
    (typeof row.growthRate === 'number' ? row.growthRate : null);
  const operatingMargin =
    averageNumericArray(row.ebitMargin) ??
    (typeof row.ebitdaMargin === 'number'
      ? row.ebitdaMargin
      : typeof row.grossMargin === 'number' && typeof row.opexPctRevenue === 'number'
        ? row.grossMargin - row.opexPctRevenue
        : null);
  const cogsPercentage =
    typeof row.grossMargin === 'number' ? 1 - row.grossMargin : null;
  const opexPercentage =
    typeof row.opexPctRevenue === 'number' ? row.opexPctRevenue : null;
  const wacc =
    typeof row.wacc === 'number' ? row.wacc : null;
  const terminalGrowthRate =
    typeof row.terminalGrowth === 'number'
      ? row.terminalGrowth
      : typeof row.terminalGrowthRate === 'number'
        ? row.terminalGrowthRate
        : null;
  const multiple =
    typeof row.exitMultiple === 'number'
      ? row.exitMultiple
      : typeof row.ebitdaMultiple === 'number'
        ? row.ebitdaMultiple
        : typeof row.revenueMultiple === 'number'
          ? row.revenueMultiple
          : typeof row.entryMultiple === 'number'
            ? row.entryMultiple
            : null;

  return {
    revenue_growth: revenueGrowth,
    operating_margin: operatingMargin,
    cogs_percentage: cogsPercentage,
    opex_percentage: opexPercentage,
    wacc,
    terminal_growth_rate: terminalGrowthRate,
    multiple,
  };
}

function buildPersistentModelContext(
  prompt: string,
  payload: AnalystGeneratedModelPayload,
): Record<string, unknown> {
  const companyName =
    'companyName' in payload.extractedInputs && typeof payload.extractedInputs.companyName === 'string'
      ? payload.extractedInputs.companyName
      : payload.title;
  const driverContext = buildPersistentDriverContext(payload.extractedInputs);

  return {
    user_prompt: prompt,
    model_type: payload.modelType,
    company_name: companyName,
    current_assumptions: driverContext,
    latest_outputs: {
      valuation: null,
      key_metrics: payload.keyOutputs,
      latest_title: payload.title,
    },
    history_of_prior_changes: payload.comparisonSummary
      ? {
          previous_version_number: payload.comparisonSummary.previousVersionNumber,
          current_version_number: payload.comparisonSummary.currentVersionNumber,
          changed_keys: payload.comparisonSummary.changedKeys,
        }
      : null,
  };
}

export async function derivePersistentModelReasoningResponse(
  prompt: string,
  payload: AnalystGeneratedModelPayload,
): Promise<FinancialReasoningResponse | null> {
  try {
    const result = await analystModelChatDeps.generateTextWithProviderFallback({
      preferredProvider: 'openai',
      clientType: 'service',
      temperature: 0.1,
      maxTokens: 900,
      messages: [
        { role: 'system', content: PERSISTENT_MODEL_REASONING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify(buildPersistentModelContext(prompt, payload), null, 2),
        },
      ],
    });
    return normalizeFinancialReasoningResponse(extractJsonObject(result?.text ?? ''));
  } catch {
    return null;
  }
}

function applyScalarShiftToArray(
  values: unknown,
  oldValue: number | null,
  newValue: number | null,
  floor: number,
  ceiling: number,
): number[] | undefined {
  if (!Array.isArray(values) || oldValue === null || newValue === null) return undefined;
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length !== values.length) return undefined;
  const delta = newValue - oldValue;
  return numeric.map((value) => clampNumber(value + delta, floor, ceiling));
}

function hasMeaningfulDriverChange(change: FinancialReasoningDriverChange): boolean {
  return change.old !== null && change.new !== null && Math.abs(change.new - change.old) > 1e-6;
}

export function translateFinancialReasoningToOverrides(
  payload: AnalystGeneratedModelPayload,
  response: FinancialReasoningResponse,
): Record<string, unknown> {
  const current = payload.extractedInputs as Record<string, unknown>;
  const overrides: Record<string, unknown> = {};
  const hasExplicitCogsChange = hasMeaningfulDriverChange(response.changes.cogs_percentage);
  const hasExplicitOpexChange = hasMeaningfulDriverChange(response.changes.opex_percentage);

  if (hasMeaningfulDriverChange(response.changes.revenue_growth)) {
    const change = response.changes.revenue_growth;
    if (Array.isArray(current.revenueGrowth)) {
      const next = applyScalarShiftToArray(current.revenueGrowth, change.old, change.new, -0.95, 3);
      if (next) overrides.revenueGrowth = next;
    } else if (typeof current.growthRate === 'number' && change.new !== null) {
      overrides.growthRate = clampNumber(change.new, -0.95, 3);
    }
  }

  if (hasMeaningfulDriverChange(response.changes.cogs_percentage) && typeof current.grossMargin === 'number') {
    overrides.grossMargin = clampNumber(1 - (response.changes.cogs_percentage.new as number), 0.01, 0.99);
  }

  if (hasMeaningfulDriverChange(response.changes.opex_percentage) && typeof current.opexPctRevenue === 'number') {
    overrides.opexPctRevenue = clampNumber(response.changes.opex_percentage.new as number, 0, 0.99);
  }

  if (hasMeaningfulDriverChange(response.changes.operating_margin)) {
    const change = response.changes.operating_margin;
    if (Array.isArray(current.ebitMargin)) {
      const next = applyScalarShiftToArray(current.ebitMargin, change.old, change.new, -0.5, 0.95);
      if (next) overrides.ebitMargin = next;
    } else if (typeof current.ebitdaMargin === 'number' && change.new !== null) {
      overrides.ebitdaMargin = clampNumber(change.new, -0.5, 0.99);
    } else if (
      !hasExplicitOpexChange &&
      !hasExplicitCogsChange &&
      typeof current.grossMargin === 'number' &&
      typeof current.opexPctRevenue === 'number' &&
      change.old !== null &&
      change.new !== null
    ) {
      const delta = change.new - change.old;
      overrides.opexPctRevenue = clampNumber(current.opexPctRevenue - delta, 0, 0.99);
    }
  }

  if (hasMeaningfulDriverChange(response.changes.wacc) && typeof current.wacc === 'number') {
    overrides.wacc = clampNumber(response.changes.wacc.new as number, 0.01, 0.4);
  }

  if (hasMeaningfulDriverChange(response.changes.terminal_growth_rate)) {
    const next = clampNumber(response.changes.terminal_growth_rate.new as number, -0.05, 0.08);
    if (typeof current.terminalGrowth === 'number') {
      overrides.terminalGrowth = next;
    } else if (typeof current.terminalGrowthRate === 'number') {
      overrides.terminalGrowthRate = next;
    }
  }

  if (hasMeaningfulDriverChange(response.changes.multiple)) {
    const next = clampNumber(response.changes.multiple.new as number, 0, 100);
    if (typeof current.exitMultiple === 'number') {
      overrides.exitMultiple = next;
    } else if (typeof current.ebitdaMultiple === 'number') {
      overrides.ebitdaMultiple = next;
    } else if (typeof current.revenueMultiple === 'number') {
      overrides.revenueMultiple = next;
    } else if (typeof current.entryMultiple === 'number') {
      overrides.entryMultiple = next;
    }
  }

  return overrides;
}

export function buildReasoningReply(
  modelLabel: string,
  response: FinancialReasoningResponse,
  modelChanged: boolean,
): string {
  const parts = [
    response.summary.trim(),
    response.detailed_reasoning.trim(),
    modelChanged
      ? `The ${modelLabel} model card has been updated to reflect those changes.`
      : 'No model assumptions were changed.',
  ].filter((item) => item.length > 0);
  return parts.join('\n\n');
}
