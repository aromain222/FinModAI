/**
 * POST /api/event-impact
 *
 * Accepts a headline + current model, calls the LLM to produce assumption
 * deltas, applies them via applyEventMutation, then runs the updated model
 * through the scenario engine to produce three valuation scenarios.
 *
 * Never throws to the client — bad LLM JSON falls back to a zero-delta
 * response so the UI degrades gracefully.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { applyEventMutation, type AssumptionDeltas, type CurrentModel } from '@/lib/applyEventMutation';
import { computeValuation, type BaseAssumptions } from '@/lib/frameEngine';
import { getOpenAIKey } from '@/lib/openaiKey';

export const dynamic = 'force-dynamic';

// ─── Prompt ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a financial modeling mutation engine.

Your job is to UPDATE a financial model based on a headline.
You must output STRICT JSON only.

You are NOT explaining the news.
You are MODIFYING MODEL ASSUMPTIONS.`;

function buildUserPrompt(
  company: string,
  ticker: string,
  headline: string,
  context: string | undefined,
  currentModel: CurrentModel
): string {
  return `Company: ${company}
Ticker: ${ticker}
Headline: ${headline}
Context: ${context ?? 'None'}

Current Model:
${JSON.stringify(currentModel, null, 2)}

OUTPUT:

{
  "assumption_deltas": {
    "revenue_growth_delta": 0.0,
    "ebitda_margin_delta_bps": 0,
    "wacc_delta_bps": 0,
    "terminal_growth_delta": 0.0,
    "capex_delta_pct_revenue": 0.0
  },

  "updated_model": {
    "revenue_growth": 0.0,
    "ebitda_margin": 0.0,
    "wacc": 0.0,
    "terminal_growth": 0.0,
    "capex_pct_revenue": 0.0
  },

  "scenarios": {
    "base": { "valuation_delta_pct": 0.0 },
    "upside": { "valuation_delta_pct": 0.0 },
    "downside": { "valuation_delta_pct": 0.0 }
  },

  "impact_summary": {
    "primary_driver": "",
    "direction": "positive | negative | mixed",
    "magnitude": "low | medium | high"
  },

  "mechanism": [
    "short causal step",
    "short causal step"
  ]
}

RULES:
- updated_model MUST equal current_model + deltas
- margins must convert bps correctly (bps / 10000)
- no text outside JSON
- no vague language
- use realistic magnitudes
- always fill all fields
- mechanism = short causal bullets only`;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const currentModelSchema = z.object({
  revenue_growth:    z.number(),
  ebitda_margin:     z.number(),
  wacc:              z.number(),
  terminal_growth:   z.number(),
  capex_pct_revenue: z.number(),
});

const requestSchema = z.object({
  company:       z.string().min(1),
  ticker:        z.string().min(1),
  headline:      z.string().min(1),
  context:       z.string().optional(),
  current_model: currentModelSchema,
});

const llmResponseSchema = z.object({
  assumption_deltas: z.object({
    revenue_growth_delta:    z.number(),
    ebitda_margin_delta_bps: z.number(),
    wacc_delta_bps:          z.number(),
    terminal_growth_delta:   z.number(),
    capex_delta_pct_revenue: z.number(),
  }),
  updated_model: currentModelSchema,
  scenarios: z.object({
    base:     z.object({ valuation_delta_pct: z.number() }),
    upside:   z.object({ valuation_delta_pct: z.number() }),
    downside: z.object({ valuation_delta_pct: z.number() }),
  }),
  impact_summary: z.object({
    primary_driver: z.string(),
    direction:      z.enum(['positive', 'negative', 'mixed']),
    magnitude:      z.enum(['low', 'medium', 'high']),
  }),
  mechanism: z.array(z.string()),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function toBaseAssumptions(model: CurrentModel): BaseAssumptions {
  // Derive exit multiple from terminal growth via Gordon Growth approximation,
  // clamped to a realistic [5x, 30x] range.
  const spread = model.wacc - model.terminal_growth;
  const exitMultiple = spread > 0.001
    ? Math.min(30, Math.max(5, Math.round(1 / spread)))
    : 12;

  return {
    revenue:         1_000,   // normalised — only pct deltas matter
    revenueGrowth:   model.revenue_growth,
    ebitdaMargin:    model.ebitda_margin,
    taxRate:         0.21,
    capexPct:        model.capex_pct_revenue,
    nwcPct:          0.02,
    discountRate:    model.wacc,
    exitMultiple,
    projectionYears: 5,
  };
}

/** For upside: keep only positive-impact deltas at 1.5×. For downside: keep only negative-impact deltas at 1.5×. */
function buildScenarioModel(
  base: CurrentModel,
  deltas: AssumptionDeltas,
  direction: 'upside' | 'downside'
): CurrentModel {
  // "Positive impact" semantics per field:
  //   revenue_growth_delta  > 0 → good
  //   ebitda_margin_delta_bps > 0 → good
  //   wacc_delta_bps < 0        → good  (lower discount rate)
  //   terminal_growth_delta > 0 → good
  //   capex_delta_pct_revenue < 0 → good (lower capex = higher FCF)
  const isGood = (field: keyof AssumptionDeltas, val: number): boolean => {
    if (field === 'wacc_delta_bps')          return val < 0;
    if (field === 'capex_delta_pct_revenue') return val < 0;
    return val > 0;
  };

  const scale = (field: keyof AssumptionDeltas, val: number): number => {
    const good = isGood(field, val);
    if (direction === 'upside'   && good)  return val * 1.5;
    if (direction === 'downside' && !good) return val * 1.5;
    return 0; // zero out the other side
  };

  const scenarioDeltas: AssumptionDeltas = {
    revenue_growth_delta:    scale('revenue_growth_delta',    deltas.revenue_growth_delta),
    ebitda_margin_delta_bps: scale('ebitda_margin_delta_bps', deltas.ebitda_margin_delta_bps),
    wacc_delta_bps:          scale('wacc_delta_bps',          deltas.wacc_delta_bps),
    terminal_growth_delta:   scale('terminal_growth_delta',   deltas.terminal_growth_delta),
    capex_delta_pct_revenue: scale('capex_delta_pct_revenue', deltas.capex_delta_pct_revenue),
  };

  return applyEventMutation(base, scenarioDeltas);
}

function valuationDeltaPct(baseEv: number, scenarioModel: CurrentModel): number {
  if (baseEv === 0) return 0;
  const scenarioEv = computeValuation(toBaseAssumptions(scenarioModel)).enterpriseValue;
  return ((scenarioEv - baseEv) / Math.abs(baseEv)) * 100;
}

function zeroDeltas(): AssumptionDeltas {
  return {
    revenue_growth_delta:    0,
    ebitda_margin_delta_bps: 0,
    wacc_delta_bps:          0,
    terminal_growth_delta:   0,
    capex_delta_pct_revenue: 0,
  };
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Parse + validate request
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { company, ticker, headline, context, current_model } = parsed.data;

  // ── Call LLM ──────────────────────────────────────────────────────────────
  const apiKey = getOpenAIKey('service');
  if (!apiKey) {
    return NextResponse.json(
      { error: 'LLM API key not configured (set OPENAI_SERVICE_API_KEY or OPENAI_API_KEY)' },
      { status: 503 }
    );
  }

  const client = new OpenAI({ apiKey });

  let rawContent = '';
  try {
    const completion = await client.chat.completions.create({
      model:       process.env.OPENAI_MODEL ?? 'gpt-4o',
      temperature: 0,           // deterministic — this is a mutation engine
      max_tokens:  1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt(company, ticker, headline, context, current_model),
        },
      ],
    });
    rawContent = completion.choices[0]?.message?.content ?? '';
  } catch (llmError) {
    console.error('[event-impact] LLM call failed:', llmError);
    return NextResponse.json(
      { error: 'LLM call failed', details: String(llmError) },
      { status: 502 }
    );
  }

  // ── Parse LLM response ────────────────────────────────────────────────────
  let llmData: z.infer<typeof llmResponseSchema>;
  try {
    const jsonParsed = JSON.parse(rawContent);
    const validated  = llmResponseSchema.safeParse(jsonParsed);
    if (!validated.success) {
      console.warn('[event-impact] LLM JSON schema mismatch — falling back to zero mutation', validated.error.flatten());
      llmData = {
        assumption_deltas: zeroDeltas(),
        updated_model:     current_model,
        scenarios: {
          base:     { valuation_delta_pct: 0 },
          upside:   { valuation_delta_pct: 0 },
          downside: { valuation_delta_pct: 0 },
        },
        impact_summary: {
          primary_driver: 'Unable to parse LLM response',
          direction:      'mixed',
          magnitude:      'low',
        },
        mechanism: ['LLM response could not be validated — no mutation applied'],
      };
    } else {
      llmData = validated.data;
    }
  } catch (parseError) {
    console.error('[event-impact] JSON parse failed:', parseError, '\nRaw:', rawContent.slice(0, 300));
    llmData = {
      assumption_deltas: zeroDeltas(),
      updated_model:     current_model,
      scenarios: {
        base:     { valuation_delta_pct: 0 },
        upside:   { valuation_delta_pct: 0 },
        downside: { valuation_delta_pct: 0 },
      },
      impact_summary: {
        primary_driver: 'LLM parse error',
        direction:      'mixed',
        magnitude:      'low',
      },
      mechanism: ['JSON parse failed — no mutation applied'],
    };
  }

  // ── Apply mutation & run scenario engine ──────────────────────────────────
  const updatedModel = applyEventMutation(current_model, llmData.assumption_deltas);

  const baseEv        = computeValuation(toBaseAssumptions(current_model)).enterpriseValue;
  const updatedEv     = computeValuation(toBaseAssumptions(updatedModel)).enterpriseValue;
  const upsideModel   = buildScenarioModel(current_model, llmData.assumption_deltas, 'upside');
  const downsideModel = buildScenarioModel(current_model, llmData.assumption_deltas, 'downside');

  const engineScenarios = {
    base:     { valuation_delta_pct: valuationDeltaPct(baseEv, updatedModel) },
    upside:   { valuation_delta_pct: valuationDeltaPct(baseEv, upsideModel)  },
    downside: { valuation_delta_pct: valuationDeltaPct(baseEv, downsideModel) },
  };

  return NextResponse.json({
    company,
    ticker,
    headline,
    current_model,
    assumption_deltas: llmData.assumption_deltas,
    updated_model:     updatedModel,
    scenarios:         engineScenarios,
    impact_summary:    llmData.impact_summary,
    mechanism:         llmData.mechanism,
    // Debug metadata
    _meta: {
      base_ev_normalized:    Math.round(baseEv),
      updated_ev_normalized: Math.round(updatedEv),
    },
  });
}
