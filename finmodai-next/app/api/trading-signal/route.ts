/**
 * POST /api/trading-signal
 *
 * Converts a stacked event timeline + model valuation shift into an
 * actionable trading signal: direction, conviction, position sizing,
 * stop/target levels, and risk parameters.
 *
 * Signal decay: older events are down-weighted using exp(-Δt / 6h)
 * so fresh catalysts dominate the signal.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { getOpenAIKey } from '@/lib/openaiKey';

export const dynamic = 'force-dynamic';

// ── Constants ─────────────────────────────────────────────────────────────────

const DECAY_CONSTANT_MS = 6 * 60 * 60 * 1000; // 6-hour half-life

// ── Schemas ───────────────────────────────────────────────────────────────────

const eventSummarySchema = z.object({
  headline:                      z.string(),
  ticker:                        z.string(),
  timestamp:                     z.number(),
  marginal_valuation_delta_pct:  z.number(),
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

const signalResponseSchema = z.object({
  signal: z.object({
    direction:    z.enum(['long', 'short', 'neutral']),
    conviction:   z.number().min(0).max(1),
    time_horizon: z.enum(['intraday', 'short_term', 'medium_term']),
  }),
  edge: z.object({
    valuation_gap_pct:  z.number(),
    market_mispricing:  z.enum(['underreacting', 'overreacting', 'efficient']),
    catalyst_strength:  z.enum(['low', 'medium', 'high']),
  }),
  position: z.object({
    size_pct:       z.number().min(0).max(0.10),
    entry_zone:     z.object({ min: z.number(), max: z.number() }),
    stop_loss_pct:  z.number().min(0),
    take_profit_pct: z.number().min(0),
  }),
  risk: z.object({
    primary_risk:            z.string(),
    scenario_skew:           z.enum(['upside', 'downside', 'balanced']),
    volatility_expectation:  z.enum(['low', 'medium', 'high']),
  }),
  drivers: z.array(z.string()),
});

export type TradingSignalResponse = z.infer<typeof signalResponseSchema> & {
  ticker:            string;
  current_price:     number;
  base_valuation:    number;
  updated_valuation: number;
  valuation_gap_pct: number;
  _meta: {
    event_count:           number;
    active_event_count:    number;
    decay_constant_hrs:    number;
  };
};

// ── Decay ─────────────────────────────────────────────────────────────────────

function decayWeight(timestamp: number): number {
  return Math.exp(-(Date.now() - timestamp) / DECAY_CONSTANT_MS);
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a hedge fund analyst generating trading signals.

You must convert model outputs and recent events into:
- a clear directional trade
- confidence level
- time horizon
- risk assessment

Output STRICT JSON only. No text outside JSON.`;

function buildUserPrompt(
  ticker: string,
  currentPrice: number,
  baseValuation: number,
  updatedValuation: number,
  valuationGapPct: number,
  events: Array<z.infer<typeof eventSummarySchema> & { decay_weight: number }>,
  scenarios: z.infer<typeof requestSchema>['scenarios']
): string {
  const eventsText =
    events.length === 0
      ? 'No recent events.'
      : events
          .map((e, i) => {
            const ageMin = Math.round((Date.now() - e.timestamp) / 60_000);
            const margStr = `${e.marginal_valuation_delta_pct >= 0 ? '+' : ''}${e.marginal_valuation_delta_pct.toFixed(2)}%`;
            const cumStr  = `${e.cumulative_valuation_delta_pct >= 0 ? '+' : ''}${e.cumulative_valuation_delta_pct.toFixed(2)}%`;
            return [
              `${i + 1}. [weight=${e.decay_weight.toFixed(2)}, ${ageMin}m ago] "${e.headline}"`,
              `   Direction: ${e.impact_summary?.direction ?? '—'} | Magnitude: ${e.impact_summary?.magnitude ?? '—'}`,
              `   Marginal ΔEV: ${margStr} | Cumulative ΔEV: ${cumStr}`,
            ].join('\n');
          })
          .join('\n\n');

  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  return `Ticker: ${ticker}
Current Price: ${currentPrice.toFixed(4)} (normalized)
Base Valuation: ${baseValuation.toFixed(4)} (normalized)
Updated Valuation: ${updatedValuation.toFixed(4)} (normalized)
Valuation Gap: ${fmt(valuationGapPct)}

Recent Events (decay-weighted, 6h half-life):
${eventsText}

Scenarios:
  Base:     ${fmt(scenarios.base.valuation_delta_pct)} EV delta
  Upside:   ${fmt(scenarios.upside.valuation_delta_pct)} EV delta
  Downside: ${fmt(scenarios.downside.valuation_delta_pct)} EV delta

OUTPUT (strict JSON):
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
    "primary_risk": "",
    "scenario_skew": "upside | downside | balanced",
    "volatility_expectation": "low | medium | high"
  },
  "drivers": ["reason 1", "reason 2"]
}

RULES:
- conviction: 0–1 (0=no edge, 1=maximum conviction)
- size_pct: 0–0.10 (hard 10% portfolio cap)
- stop_loss_pct: % price can move against position before exit (e.g. 0.05 = 5% stop)
- take_profit_pct: % upside target from current price (e.g. 0.12 = 12% target)
- entry_zone min/max are absolute price levels around current_price
- weight recent events more; decay-weight < 0.20 means stale catalyst
- if events conflict, follow highest-weighted consensus
- no vague language, no text outside JSON`;
}

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

  const {
    ticker,
    current_price,
    base_valuation,
    updated_valuation,
    event_stack,
    scenarios,
  } = parsed.data;

  // Valuation gap: how far the updated model is from current price
  const valuationGapPct =
    current_price !== 0
      ? ((updated_valuation - current_price) / Math.abs(current_price)) * 100
      : 0;

  // Decay-weight every event and sort most-recent first
  const weightedEvents = event_stack
    .map((e) => ({ ...e, decay_weight: decayWeight(e.timestamp) }))
    .sort((a, b) => b.decay_weight - a.decay_weight);

  const activeEvents = weightedEvents.filter((e) => e.decay_weight > 0.05);

  // ── LLM ──────────────────────────────────────────────────────────────────
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
      model:           process.env.OPENAI_MODEL ?? 'gpt-4o',
      temperature:     0,
      max_tokens:      1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt(
            ticker,
            current_price,
            base_valuation,
            updated_valuation,
            valuationGapPct,
            weightedEvents,
            scenarios
          ),
        },
      ],
    });
    rawContent = completion.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.error('[trading-signal] LLM call failed:', err);
    return NextResponse.json(
      { error: 'LLM call failed', details: String(err) },
      { status: 502 }
    );
  }

  // ── Parse + validate ──────────────────────────────────────────────────────
  let signalData: z.infer<typeof signalResponseSchema>;
  try {
    const jsonParsed = JSON.parse(rawContent);
    const validated  = signalResponseSchema.safeParse(jsonParsed);
    if (!validated.success) {
      console.warn('[trading-signal] schema mismatch:', validated.error.flatten());
      return NextResponse.json(
        { error: 'Signal validation failed', details: validated.error.flatten() },
        { status: 502 }
      );
    }
    signalData = validated.data;
  } catch (err) {
    console.error('[trading-signal] JSON parse failed:', err, rawContent.slice(0, 300));
    return NextResponse.json({ error: 'Failed to parse LLM response' }, { status: 502 });
  }

  const result: TradingSignalResponse = {
    ticker,
    current_price,
    base_valuation,
    updated_valuation,
    valuation_gap_pct: valuationGapPct,
    ...signalData,
    _meta: {
      event_count:        event_stack.length,
      active_event_count: activeEvents.length,
      decay_constant_hrs: DECAY_CONSTANT_MS / 3_600_000,
    },
  };

  return NextResponse.json(result);
}
