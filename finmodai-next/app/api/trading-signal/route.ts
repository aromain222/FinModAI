/**
 * POST /api/trading-signal
 *
 * Converts a stacked event timeline + model valuation shift into an
 * actionable trading signal with position sizing and risk parameters.
 *
 * Signal decay uses proper half-life semantics:
 *   λ = ln(2) / T½   →   weight = e^(-λ·hours_elapsed)
 *   At T½=6h: 6h→50%, 12h→25%, 24h→6.25%
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { getOpenAIKey } from '@/lib/openaiKey';
import {
  computeProbabilities,
  computeConfidence,
  probabilityToDirection,
  type ProbabilityInput,
} from '@/lib/probabilityModel';

export const dynamic = 'force-dynamic';

// ── Decay constants ────────────────────────────────────────────────────────────

const HALF_LIFE_HOURS = 6;
const LAMBDA = Math.log(2) / HALF_LIFE_HOURS; // ≈ 0.1155 per hour

function decayWeight(timestamp: number): number {
  const hoursElapsed = (Date.now() - timestamp) / 3_600_000;
  return Math.exp(-LAMBDA * hoursElapsed);
}

// ── Fallback signal ────────────────────────────────────────────────────────────
// Returned (as a 200) whenever the LLM output fails validation.

function buildFallback(
  ticker: string,
  currentPrice: number,
  baseVal: number,
  updatedVal: number,
  gapPct: number,
  activeCount: number,
  totalCount: number
) {
  return {
    ticker,
    current_price:     currentPrice,
    base_valuation:    baseVal,
    updated_valuation: updatedVal,
    valuation_gap_pct: gapPct,
    processed_events_count: activeCount,
    signal: {
      direction:    'neutral' as const,
      conviction:   0.20,
      time_horizon: 'short_term' as const,
    },
    edge: {
      valuation_gap_pct:  gapPct,
      market_mispricing:  'efficient' as const,
      catalyst_strength:  'low' as const,
    },
    position: {
      size_pct:        0.02,
      entry_zone:      { min: currentPrice * 0.98, max: currentPrice * 1.02 },
      stop_loss_pct:   0.05,
      take_profit_pct: 0.08,
    },
    risk: {
      primary_risk:           'Signal generation degraded — LLM output could not be validated.',
      scenario_skew:          'balanced' as const,
      volatility_expectation: 'medium' as const,
    },
    drivers: ['Model valuation shift detected', 'Manual review recommended'],
    _meta: {
      event_count:        totalCount,
      active_event_count: activeCount,
      half_life_hrs:      HALF_LIFE_HOURS,
      fallback:           true,
    },
  };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const eventSummarySchema = z.object({
  headline:                       z.string(),
  ticker:                         z.string(),
  timestamp:                      z.number(),
  marginal_valuation_delta_pct:   z.number(),
  cumulative_valuation_delta_pct: z.number(),
  impact_summary: z
    .object({
      primary_driver: z.string(),
      direction:      z.enum(['positive', 'negative', 'mixed']),
      magnitude:      z.enum(['low', 'medium', 'high']),
    })
    .optional(),
});

const requestSchema = z.object({
  ticker:            z.string().min(1),
  current_price:     z.number(),
  base_valuation:    z.number(),
  updated_valuation: z.number(),
  event_stack:       z.array(eventSummarySchema),
  scenarios: z.object({
    base:     z.object({ valuation_delta_pct: z.number() }),
    upside:   z.object({ valuation_delta_pct: z.number() }),
    downside: z.object({ valuation_delta_pct: z.number() }),
  }),
});

const signalResponseSchema = z
  .object({
    signal: z.object({
      direction:    z.enum(['long', 'short', 'neutral']),
      conviction:   z.number().min(0).max(1),
      time_horizon: z.enum(['intraday', 'short_term', 'medium_term']),
    }),
    edge: z.object({
      valuation_gap_pct: z.number(),
      market_mispricing: z.enum(['underreacting', 'overreacting', 'efficient']),
      catalyst_strength: z.enum(['low', 'medium', 'high']),
    }),
    position: z.object({
      size_pct:        z.number().min(0).max(0.10),
      entry_zone:      z.object({ min: z.number(), max: z.number() }),
      stop_loss_pct:   z.number().positive(),
      take_profit_pct: z.number().positive(),
    }),
    risk: z.object({
      primary_risk:           z.string().min(1),
      scenario_skew:          z.enum(['upside', 'downside', 'balanced']),
      volatility_expectation: z.enum(['low', 'medium', 'high']),
    }),
    drivers: z.array(z.string()).min(1),
  })
  // Enforce take_profit > stop_loss
  .refine(
    (d) => d.position.take_profit_pct > d.position.stop_loss_pct,
    { message: 'take_profit_pct must exceed stop_loss_pct', path: ['position'] }
  );

export type TradingSignalResponse = z.infer<typeof signalResponseSchema> & {
  ticker:                 string;
  current_price:          number;
  base_valuation:         number;
  updated_valuation:      number;
  valuation_gap_pct:      number;
  processed_events_count: number;
  probabilities: {
    bull: number;
    base: number;
    bear: number;
    confidence: number;
  };
  _meta: {
    event_count:        number;
    active_event_count: number;
    half_life_hrs:      number;
    prob_override:      boolean;
    fallback?:          boolean;
  };
};

// ── Prompt builder ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a hedge fund analyst generating trading signals.

You MUST produce a trade that reflects:
- valuation gap between current price and model-implied value
- event momentum weighted by recency (decay-adjusted)
- scenario skew (upside vs downside asymmetry)

Output STRICT JSON only. No text outside JSON.`;

type WeightedEvent = z.infer<typeof eventSummarySchema> & { weight: number };

function buildUserPrompt(
  ticker: string,
  currentPrice: number,
  valuationGapPct: number,
  events: WeightedEvent[],
  scenarios: z.infer<typeof requestSchema>['scenarios'],
  probs?: { bull: number; base: number; bear: number; confidence: number }
): string {
  const eventsText =
    events.length === 0
      ? 'None — no recent catalysts.'
      : events
          .map((e, i) => {
            const hoursAgo = ((Date.now() - e.timestamp) / 3_600_000).toFixed(1);
            const dir      = e.impact_summary?.direction ?? '—';
            const mag      = e.impact_summary?.magnitude ?? '—';
            const marg     = `${e.marginal_valuation_delta_pct >= 0 ? '+' : ''}${e.marginal_valuation_delta_pct.toFixed(2)}%`;
            return [
              `${i + 1}. [weight=${e.weight.toFixed(3)}, ${hoursAgo}h ago] "${e.headline}"`,
              `   ${dir} / ${mag} | Marginal ΔEV: ${marg}`,
            ].join('\n');
          })
          .join('\n');

  const s = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  const probsSection = probs
    ? `\nDeterministic Scenario Probabilities (pre-computed, do NOT override direction):
  Bull: ${(probs.bull * 100).toFixed(1)}%
  Base: ${(probs.base * 100).toFixed(1)}%
  Bear: ${(probs.bear * 100).toFixed(1)}%
  Confidence: ${(probs.confidence * 100).toFixed(1)}%`
    : '';

  return `Ticker: ${ticker}
Current Price: ${currentPrice.toFixed(4)}
Valuation Gap: ${s(valuationGapPct)}  (positive = model says stock is cheap)
${probsSection}
Events (decay-weighted, T½=${HALF_LIFE_HOURS}h, most recent first):
${eventsText}

Scenarios:
  Base:     ${s(scenarios.base.valuation_delta_pct)} EV delta
  Upside:   ${s(scenarios.upside.valuation_delta_pct)} EV delta
  Downside: ${s(scenarios.downside.valuation_delta_pct)} EV delta

OUTPUT (strict JSON — no extra keys, no markdown):
{
  "signal": {
    "direction": "long | short | neutral",
    "conviction": 0.0,
    "time_horizon": "intraday | short_term | medium_term"
  },
  "edge": {
    "valuation_gap_pct": 0.0,
    "market_mispricing": "underreacting | overreacting | efficient",
    "catalyst_strength": "low | medium | high"
  },
  "position": {
    "size_pct": 0.0,
    "entry_zone": { "min": 0.0, "max": 0.0 },
    "stop_loss_pct": 0.0,
    "take_profit_pct": 0.0
  },
  "risk": {
    "primary_risk": "concise sentence",
    "scenario_skew": "upside | downside | balanced",
    "volatility_expectation": "low | medium | high"
  },
  "drivers": ["reason 1", "reason 2"]
}

RULES:
- conviction ∈ [0,1]
- size_pct ∈ [0, 0.10]  (10% hard cap)
- stop_loss_pct > 0
- take_profit_pct > stop_loss_pct  (positive R:R required)
- entry_zone must bracket current_price ± reasonable band
- positive valuation_gap → model sees upside → lean long unless events say otherwise
- weight events by their decay weight; ignore weight < 0.05
- no vague language`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1 — Parse request body
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

  const { ticker, current_price, base_valuation, updated_valuation, event_stack, scenarios } =
    parsed.data;

  // 2 — Pre-LLM computation
  const valuationGapPct =
    current_price !== 0
      ? ((updated_valuation - current_price) / Math.abs(current_price)) * 100
      : 0;

  // 3 — Signal decay: apply proper half-life weighting, sort DESC, drop noise
  const weightedEvents: WeightedEvent[] = event_stack
    .map((e) => ({ ...e, weight: decayWeight(e.timestamp) }))
    .sort((a, b) => b.weight - a.weight)
    .filter((e) => e.weight >= 0.05);

  // 3b — Deterministic probability computation (pre-LLM, always runs)
  const event_scores   = weightedEvents.map((e) => e.marginal_valuation_delta_pct * e.weight);
  const scenario_skew  =
    (scenarios.upside.valuation_delta_pct - scenarios.downside.valuation_delta_pct) / 100;

  const probInput: ProbabilityInput = {
    valuation_gap:  valuationGapPct / 100,   // convert % back to decimal
    event_scores,
    scenario_skew,
    volatility: 0.5,
  };

  const probs          = computeProbabilities(probInput);
  const probConfidence = computeConfidence(probs);
  const probDirection  = probabilityToDirection(probs, 0.65);

  const probSummary = {
    bull:       probs.bull_prob,
    base:       probs.base_prob,
    bear:       probs.bear_prob,
    confidence: probConfidence,
  };

  // 4 — LLM call
  const apiKey = getOpenAIKey('service');
  if (!apiKey) {
    return NextResponse.json(
      buildFallback(ticker, current_price, base_valuation, updated_valuation,
        valuationGapPct, weightedEvents.length, event_stack.length)
    );
  }

  const client  = new OpenAI({ apiKey });
  let rawContent = '';

  try {
    const completion = await client.chat.completions.create({
      model:           process.env.OPENAI_MODEL ?? 'gpt-4o',
      temperature:     0,
      max_tokens:      1_024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt(ticker, current_price, valuationGapPct, weightedEvents, scenarios, probSummary),
        },
      ],
    });
    rawContent = completion.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.error('[trading-signal] LLM call failed:', err);
    // Degrade gracefully with fallback signal
    return NextResponse.json(
      buildFallback(ticker, current_price, base_valuation, updated_valuation,
        valuationGapPct, weightedEvents.length, event_stack.length)
    );
  }

  // 5 — Parse + strict Zod validation; fallback on any failure
  let signalData: z.infer<typeof signalResponseSchema>;
  try {
    const jsonParsed = JSON.parse(rawContent);
    const validated  = signalResponseSchema.safeParse(jsonParsed);
    if (!validated.success) {
      console.warn('[trading-signal] schema mismatch:', validated.error.flatten());
      return NextResponse.json(
        buildFallback(ticker, current_price, base_valuation, updated_valuation,
          valuationGapPct, weightedEvents.length, event_stack.length)
      );
    }
    signalData = validated.data;
  } catch (err) {
    console.error('[trading-signal] JSON parse failed:', err, rawContent.slice(0, 300));
    return NextResponse.json(
      buildFallback(ticker, current_price, base_valuation, updated_valuation,
        valuationGapPct, weightedEvents.length, event_stack.length)
    );
  }

  // 6 — Apply deterministic probability overrides
  //
  // If the prob model has strong conviction (> 0.65), override the LLM's
  // direction so the signal is always consistent with the deterministic model.
  // Position size is also capped by probability confidence × base size.
  const BASE_SIZE = 0.05;
  const prob_override = probDirection !== 'neutral' && probDirection !== signalData.signal.direction;

  const finalDirection = probDirection !== 'neutral' ? probDirection : signalData.signal.direction;
  const maxProb        = Math.max(probs.bull_prob, probs.bear_prob);
  const probSizeBoost  = Math.min(BASE_SIZE * probConfidence * maxProb * 10, 0.10);
  const finalSizePct   = Math.min(
    Math.max(probSizeBoost, signalData.position.size_pct),
    0.10
  );

  const result: TradingSignalResponse = {
    ticker,
    current_price,
    base_valuation,
    updated_valuation,
    valuation_gap_pct:      valuationGapPct,
    processed_events_count: weightedEvents.length,
    probabilities:          probSummary,
    ...signalData,
    // Apply overrides after spread so they take precedence
    signal: {
      ...signalData.signal,
      direction: finalDirection,
    },
    position: {
      ...signalData.position,
      size_pct: finalSizePct,
    },
    _meta: {
      event_count:        event_stack.length,
      active_event_count: weightedEvents.length,
      half_life_hrs:      HALF_LIFE_HOURS,
      prob_override,
    },
  };

  return NextResponse.json(result);
}
