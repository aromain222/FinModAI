/**
 * POST /api/predict
 *
 * Hybrid prediction endpoint:
 *   - Scenario probabilities: 100% deterministic (no LLM, reproducible)
 *   - Explanation + next catalyst: optional LLM (only if include_explanation=true)
 *
 * The LLM CANNOT change the probabilities — it only explains them.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import {
  computeProbabilities,
  computeConfidence,
  dominantScenario,
  probabilityToDirection,
  type ProbabilityInput,
} from '@/lib/probabilityModel';
import { getOpenAIKey } from '@/lib/openaiKey';

export const dynamic = 'force-dynamic';

// ── Schemas ───────────────────────────────────────────────────────────────────

const eventInputSchema = z.object({
  marginal_valuation_delta_pct:   z.number(),
  cumulative_valuation_delta_pct: z.number(),
  timestamp:                      z.number(),
  decay_weight:                   z.number().min(0).max(1).optional().default(1),
});

const requestSchema = z.object({
  ticker:              z.string().min(1),
  // (updated_valuation - current_price) / |current_price|  — decimal
  valuation_gap:       z.number(),
  event_stack:         z.array(eventInputSchema),
  scenarios: z.object({
    base:     z.object({ valuation_delta_pct: z.number() }),
    upside:   z.object({ valuation_delta_pct: z.number() }),
    downside: z.object({ valuation_delta_pct: z.number() }),
  }),
  volatility:          z.number().min(0).max(1).optional().default(0.5),
  include_explanation: z.boolean().optional().default(false),
});

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const { ticker, valuation_gap, event_stack, scenarios, volatility, include_explanation } =
    parsed.data;

  // ── 1. Build event_scores: marginal_delta_pct × decay_weight ─────────────
  const event_scores = event_stack.map(
    (e) => e.marginal_valuation_delta_pct * (e.decay_weight ?? 1)
  );

  // ── 2. Scenario skew: positive = upside dominant ──────────────────────────
  const scenario_skew =
    (scenarios.upside.valuation_delta_pct - scenarios.downside.valuation_delta_pct) / 100;

  // ── 3. DETERMINISTIC probability computation (no LLM) ────────────────────
  const probInput: ProbabilityInput = {
    valuation_gap,
    event_scores,
    scenario_skew,
    volatility,
  };

  const probabilities = computeProbabilities(probInput);
  const confidence    = computeConfidence(probabilities);
  const dominant      = dominantScenario(probabilities);
  const direction     = probabilityToDirection(probabilities);

  // ── 4. Expected move per scenario (from scenario input) ───────────────────
  const expected_move = {
    bull: scenarios.upside.valuation_delta_pct / 100,
    base: scenarios.base.valuation_delta_pct / 100,
    bear: scenarios.downside.valuation_delta_pct / 100,
  };

  // ── 5. Optional LLM explanation — probabilities are NOT affected ──────────
  let explanation: string | null       = null;
  let next_likely_event: string | null = null;

  if (include_explanation) {
    const apiKey = getOpenAIKey('service');
    if (apiKey) {
      try {
        const client = new OpenAI({ apiKey });
        const completion = await client.chat.completions.create({
          model:           process.env.OPENAI_MODEL ?? 'gpt-4o',
          temperature:     0.3,
          max_tokens:      250,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a concise market analyst. ' +
                'Given pre-computed probabilities, explain WHY the distribution looks this way ' +
                'in 2–3 sentences. Then name the single most likely next catalyst in one sentence. ' +
                'Return: { "explanation": "...", "next_likely_event": "..." }. No extra keys.',
            },
            {
              role: 'user',
              content: [
                `Ticker: ${ticker}`,
                `Valuation gap: ${(valuation_gap * 100).toFixed(2)}%`,
                `Bull: ${(probabilities.bull_prob * 100).toFixed(1)}%`,
                `Base: ${(probabilities.base_prob * 100).toFixed(1)}%`,
                `Bear: ${(probabilities.bear_prob * 100).toFixed(1)}%`,
                `Dominant: ${dominant}`,
                `Confidence: ${(confidence * 100).toFixed(1)}%`,
                `Events in stack: ${event_stack.length}`,
              ].join('\n'),
            },
          ],
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';
        try {
          const obj = JSON.parse(raw) as Record<string, unknown>;
          if (typeof obj.explanation === 'string')       explanation       = obj.explanation;
          if (typeof obj.next_likely_event === 'string') next_likely_event = obj.next_likely_event;
        } catch {
          // explanation is optional — silently swallow parse failure
        }
      } catch {
        // LLM failure does not affect probabilities
      }
    }
  }

  return NextResponse.json({
    ticker,
    probabilities: {
      bull: probabilities.bull_prob,
      base: probabilities.base_prob,
      bear: probabilities.bear_prob,
    },
    expected_move,
    confidence,
    dominant_scenario: dominant,
    direction,
    explanation,
    next_likely_event,
    _meta: {
      model:          'deterministic-softmax-v1',
      event_count:    event_stack.length,
      scenario_skew,
      valuation_gap,
      volatility,
    },
  });
}
