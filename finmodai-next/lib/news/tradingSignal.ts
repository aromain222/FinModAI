import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

const FINANCIAL_MODEL_ENGINE_PROMPT = `You are the CapitalBase Financial Model Engine.

You operate as a structured system, not a chatbot.

---

## INPUT (ALWAYS PROVIDED)

{
  "mode": "EVENT_ANALYSIS | MODEL_ANALYSIS | WHAT_IF_SIMULATION",
  "data": { ... }
}

You MUST follow the given mode.
Do NOT infer the mode.

---

## CORE RULES

* Always return valid JSON
* Never return empty or zero-only outputs
* If input is weak → reduce confidence, but still produce values
* Be concise and deterministic

---

## MODE 1: EVENT_ANALYSIS

Input:
{
  "content": "news or event"
}

Steps:

1. Extract ONE real event

2. Classify:

   * type: earnings | macro | regulatory | management
   * impact_type: growth | margin | risk
   * direction: positive | negative
   * severity: 1–5

3. Map to model deltas (small, realistic):

   * growth: ±0.005 to ±0.02
   * margin: ±0.002 to ±0.01
   * discount_rate: ±0.002 to ±0.02

---

## MODE 2: MODEL_ANALYSIS

Input:
{
  "growth": number,
  "margin": number,
  "discount_rate": number
}

Steps:

* Identify primary driver
* Highlight 2–3 key risks
* Provide directional insight

---

## MODE 3: WHAT_IF_SIMULATION

Input:
{
  "base_model": {
    "growth": number,
    "margin": number,
    "discount_rate": number
  },
  "change": {
    "variable": "growth | margin | discount_rate",
    "delta": number
  }
}

Steps:

* Apply ONLY the change
* Estimate valuation change (direction + magnitude)

---

## MODE EXECUTION RULES

You MUST execute ONLY the logic relevant to the provided mode.

EVENT_ANALYSIS:
Populate event + classification + model_impact + signal
Leave what_if empty

MODEL_ANALYSIS:
Populate model_analysis + signal
Leave event fields empty

WHAT_IF_SIMULATION:
Populate what_if + signal
Do NOT extract events

Never attempt to run multiple modes at once.

---

## OUTPUT (JSON ONLY)

{
  "mode": "",

  "event": "",
  "type": "",
  "impact_type": "",
  "direction": "",
  "severity": 1,
  "confidence": 0.7,

  "model_impact": {
    "growth_delta": 0.01,
    "margin_delta": 0.005,
    "discount_rate_delta": 0,
    "primary_driver": ""
  },

  "what_if": {
    "variable": "",
    "delta": 0,
    "valuation_change": 0
  },

  "scenarios": {
    "bull": { "probability": 0.3, "impact": 0.1 },
    "base": { "probability": 0.5, "impact": 0.03 },
    "bear": { "probability": 0.2, "impact": -0.08 }
  },

  "signal": {
    "position": "LONG|SHORT|NEUTRAL",
    "conviction": 0.6,
    "size_pct": 5,
    "primary_driver": ""
  },

  "model_analysis": {
    "key_driver": "",
    "risks": [],
    "insight": ""
  }
}`;

export const tradingSignalSchema = z.object({
  mode: z.enum(['EVENT_ANALYSIS', 'MODEL_ANALYSIS', 'WHAT_IF_SIMULATION']),
  event: z.string().default(''),
  type: z.enum(['earnings', 'macro', 'regulatory', 'management']).optional(),
  impact_type: z.enum(['growth', 'margin', 'risk']).optional(),
  direction: z.enum(['positive', 'negative']).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  confidence: z.number().min(0).max(1),
  model_impact: z.object({
    growth_delta: z.number(),
    margin_delta: z.number(),
    discount_rate_delta: z.number(),
    primary_driver: z.string(),
  }).optional(),
  what_if: z.object({
    variable: z.string(),
    delta: z.number(),
    valuation_change: z.number(),
  }).optional(),
  scenarios: z.object({
    bull: z.object({ probability: z.number().min(0).max(1), impact: z.number() }),
    base: z.object({ probability: z.number().min(0).max(1), impact: z.number() }),
    bear: z.object({ probability: z.number().min(0).max(1), impact: z.number() }),
  }).optional(),
  signal: z.object({
    position: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
    conviction: z.number().min(0).max(1),
    size_pct: z.number().min(0),
    primary_driver: z.string(),
  }).optional(),
  model_analysis: z.object({
    key_driver: z.string(),
    risks: z.array(z.string()),
    insight: z.string(),
  }).optional(),
});

export type TradingSignal = z.infer<typeof tradingSignalSchema>;

export type FinancialModelInput =
  | { mode: 'EVENT_ANALYSIS'; data: { content: string } }
  | { mode: 'MODEL_ANALYSIS'; data: { growth: number; margin: number; discount_rate: number } }
  | { mode: 'WHAT_IF_SIMULATION'; data: { base_model: { growth: number; margin: number; discount_rate: number }; change: { variable: string; delta: number } } };

function extractJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('no JSON object found');
  return JSON.parse(stripped.slice(first, last + 1));
}

export async function getFinancialModelAnalysis(input: FinancialModelInput): Promise<TradingSignal | null> {
  try {
    const response = await generateTextWithProviderFallback({
      clientType: 'service',
      preferredProvider: 'anthropic',
      temperature: 0.1,
      maxTokens: 600,
      messages: [
        { role: 'system', content: FINANCIAL_MODEL_ENGINE_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });

    if (!response?.text) return null;

    const parsed = tradingSignalSchema.safeParse(extractJson(response.text));
    if (!parsed.success) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

/** Convenience wrapper for news/event enrichment. */
export async function getTradingSignal(article: {
  title: string;
  description: string | null;
}): Promise<TradingSignal | null> {
  return getFinancialModelAnalysis({
    mode: 'EVENT_ANALYSIS',
    data: { content: `${article.title}. ${article.description ?? ''}`.trim() },
  });
}
