import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

const TRADING_SIGNAL_SYSTEM_PROMPT = `You are the analysis engine for CapitalBase.

You must operate in ONE of two modes depending on the input:

* EVENT_ANALYSIS
* MODEL_ANALYSIS

Determine the mode from the input automatically.

---

## MODE 1: EVENT_ANALYSIS

If input contains an event or news:

You must:

1. Extract the single most important real-world event
2. Map it to financial model drivers:

   * revenue growth
   * operating margin
   * discount rate
3. Generate probabilistic scenarios (bull, base, bear)
4. Produce a trading signal

---

## MODE 2: MODEL_ANALYSIS

If input contains model inputs or valuation data:

You must:

1. Analyze sensitivity of the model
2. Identify primary drivers of valuation
3. Stress test assumptions
4. Generate insights and risks

---

## OUTPUT FORMAT (STRICT JSON ONLY)

{
  "mode": "EVENT_ANALYSIS|MODEL_ANALYSIS",

  "event": "",
  "type": "",
  "impact_type": "",
  "direction": "",
  "severity": 1,
  "confidence": 0,

  "model_impact": {
    "revenue_growth_delta": 0,
    "margin_delta": 0,
    "discount_rate_delta": 0,
    "primary_driver": ""
  },

  "scenarios": {
    "bull": {
      "probability": 0,
      "expected_direction": "up",
      "magnitude": 0
    },
    "base": {
      "probability": 0,
      "expected_direction": "neutral",
      "magnitude": 0
    },
    "bear": {
      "probability": 0,
      "expected_direction": "down",
      "magnitude": 0
    }
  },

  "signal": {
    "position": "LONG|SHORT|NEUTRAL",
    "conviction": 0,
    "size_pct": 0,
    "primary_driver": ""
  },

  "model_analysis": {
    "sensitivity": [],
    "key_drivers": [],
    "risks": [],
    "insights": []
  }
}

---

## RULES

* Output MUST be valid JSON only (no text, no markdown)
* No summaries of articles
* Only ONE event in EVENT_ANALYSIS
* Probabilities must sum to 1
* Use realistic, small magnitude changes
* Be conservative under uncertainty
* If input is unclear, still return structured output with lower confidence

---

## GOAL

Convert inputs into structured financial intelligence that can:

* update models
* drive valuation
* generate actionable signals`;

const scenarioCaseSchema = z.object({
  probability: z.number().min(0).max(1),
  expected_direction: z.string().min(1),
  magnitude: z.number(),
});

export const tradingSignalSchema = z.object({
  mode: z.enum(['EVENT_ANALYSIS', 'MODEL_ANALYSIS']),
  event: z.string().default(''),
  type: z.enum(['earnings', 'macro', 'geopolitics', 'regulatory', 'systemic']).optional(),
  impact_type: z.enum(['growth', 'margin', 'risk']).optional(),
  direction: z.enum(['positive', 'negative']).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  confidence: z.number().min(0).max(1),
  model_impact: z.object({
    revenue_growth_delta: z.number(),
    margin_delta: z.number(),
    discount_rate_delta: z.number(),
    primary_driver: z.enum(['growth', 'margin', 'discount_rate']),
  }).optional(),
  scenarios: z.object({
    bull: scenarioCaseSchema,
    base: scenarioCaseSchema,
    bear: scenarioCaseSchema,
  }).optional(),
  signal: z.object({
    position: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
    conviction: z.number().min(0).max(1),
    size_pct: z.number().min(0).max(1),
    primary_driver: z.string().min(1),
  }).optional(),
  model_analysis: z.object({
    sensitivity: z.array(z.unknown()),
    key_drivers: z.array(z.unknown()),
    risks: z.array(z.unknown()),
    insights: z.array(z.unknown()),
  }).optional(),
});

export type TradingSignal = z.infer<typeof tradingSignalSchema>;

function extractJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('no JSON object found');
  return JSON.parse(stripped.slice(first, last + 1));
}

export async function getTradingSignal(article: {
  title: string;
  description: string | null;
}): Promise<TradingSignal | null> {
  try {
    const response = await generateTextWithProviderFallback({
      clientType: 'service',
      preferredProvider: 'anthropic',
      temperature: 0.1,
      maxTokens: 700,
      messages: [
        { role: 'system', content: TRADING_SIGNAL_SYSTEM_PROMPT },
        { role: 'user', content: `Title: ${article.title}\nDescription: ${article.description ?? 'None'}` },
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
