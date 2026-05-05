/**
 * POST /api/pitch
 *
 * Generates a structured investment pitch for a ranked stock: bull thesis,
 * bear case, key catalysts, and positioning guidance.
 *
 * Body: PitchRequest
 * Response: application/json  { pitch: PitchOutput }  — non-streaming
 *
 * Uses the same ranked stock shape as /api/rank output, so the UI can pass
 * a row straight from the watchlist without transformation.
 *
 * Falls back to a static pitch when OpenAI is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';

export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const maxDuration = 30;

// ── Types ──────────────────────────────────────────────────────────────────

export type PitchOutput = {
  ticker:        string;
  headline:      string;
  bullThesis:    string[];
  bearCase:      string[];
  catalysts:     string[];
  positioning:   string;
  horizonWeeks:  number;
  generatedAt:   string;
  dataSource:    'ai' | 'fallback';
};

// ── Request schema ─────────────────────────────────────────────────────────

const breakdownSchema = z.object({
  forecastSignal:   z.number(),
  catalystStrength: z.number(),
  momentum:         z.number(),
  earningsSetup:    z.number(),
  riskAdjustment:   z.number(),
});

const pitchRequestSchema = z.object({
  ticker:        z.string().min(1).max(10).regex(/^[A-Za-z.]{1,10}$/),
  score:         z.number().min(1).max(10),
  signal:        z.enum(['green', 'yellow', 'red']),
  horizonWeeks:  z.number().int().min(1).max(26).default(6),
  breakdown:     breakdownSchema,
  primaryReason: z.string().optional(),
  mainRisk:      z.string().optional(),
  meta: z.object({
    forecastReturnPct: z.number().nullable().optional(),
    catalystCount:     z.number().optional(),
    dataSource:        z.enum(['live', 'mock']).optional(),
  }).optional(),
});

type PitchRequest = z.infer<typeof pitchRequestSchema>;

// ── Prompt builder ─────────────────────────────────────────────────────────

function buildPitchPrompt(req: PitchRequest): string {
  const { ticker, score, signal, horizonWeeks, breakdown, primaryReason, mainRisk, meta } = req;

  const signalLabel = signal === 'green' ? 'BUY' : signal === 'yellow' ? 'HOLD/WATCH' : 'AVOID';
  const returnLine  = meta?.forecastReturnPct != null
    ? `Quantitative model projects ${meta.forecastReturnPct >= 0 ? '+' : ''}${meta.forecastReturnPct.toFixed(1)}% over the ${horizonWeeks}-week horizon.`
    : 'No live return forecast available.';

  return `You are a buy-side equity analyst writing a structured investment pitch.

Stock: ${ticker}
Signal: ${signalLabel}  |  Score: ${score.toFixed(1)}/10  |  Horizon: ${horizonWeeks} weeks
${returnLine}

Score components (each 0–10):
- Forecast Signal: ${breakdown.forecastSignal.toFixed(1)}
- Catalyst Strength: ${breakdown.catalystStrength.toFixed(1)}
- Momentum: ${breakdown.momentum.toFixed(1)}
- Earnings Setup: ${breakdown.earningsSetup.toFixed(1)}
- Risk Adjustment: ${breakdown.riskAdjustment.toFixed(1)}

${primaryReason ? `Primary driver: ${primaryReason}` : ''}
${mainRisk       ? `Primary risk: ${mainRisk}`      : ''}

Respond ONLY with valid JSON matching this exact shape:
{
  "headline":    "<one punchy sentence — the core investment thesis>",
  "bullThesis":  ["<point 1>", "<point 2>", "<point 3>"],
  "bearCase":    ["<risk 1>", "<risk 2>"],
  "catalysts":   ["<catalyst 1>", "<catalyst 2>"],
  "positioning": "<one sentence on sizing/entry for the ${horizonWeeks}-week window>"
}

Rules:
- Be specific and data-grounded — no generic statements
- bullThesis: exactly 3 items, each ≤ 20 words
- bearCase:   exactly 2 items, each ≤ 20 words
- catalysts:  1–3 upcoming events or triggers that could move the stock
- positioning: one sentence, actionable (e.g. "Build a 3–5% position before next earnings; use a 7% stop.")
- Do NOT wrap in markdown fences`;
}

// ── Static fallback ────────────────────────────────────────────────────────

function staticPitch(req: PitchRequest): PitchOutput {
  const { ticker, score, signal, horizonWeeks, primaryReason, mainRisk } = req;
  const signalLabel = signal === 'green' ? 'BUY' : signal === 'yellow' ? 'HOLD' : 'AVOID';

  return {
    ticker,
    headline:   `${ticker} scores ${score.toFixed(1)}/10 — ${signalLabel} signal over ${horizonWeeks} weeks`,
    bullThesis: [
      primaryReason ?? 'Quantitative model scores above threshold',
      'Momentum and catalyst signals in aggregate positive',
      'Risk-adjusted return profile favourable at current levels',
    ],
    bearCase: [
      mainRisk ?? 'Insufficient live data — model relies on estimates',
      'Score near threshold; sentiment shift could reverse signal quickly',
    ],
    catalysts:  ['Next earnings release', 'Sector rotation or macro catalyst'],
    positioning: `Size proportionally to the ${score.toFixed(1)}/10 conviction score; reassess after next catalyst.`,
    horizonWeeks,
    generatedAt: new Date().toISOString(),
    dataSource:  'fallback',
  };
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = pitchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // ── Static fallback when no AI key is configured ───────────────────────
  const apiKey = getOpenAIKey('user') || getOpenAIKey('service');
  if (!apiKey) {
    return NextResponse.json({ pitch: staticPitch(data) });
  }

  // ── Call OpenAI ────────────────────────────────────────────────────────
  const prompt = buildPitchPrompt(data);
  const openai  = new OpenAI({ apiKey });
  const models  = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-4o', 'gpt-4o-mini');

  let content: string | null = null;
  let lastErr: unknown;

  for (const model of models) {
    try {
      const res = await openai.chat.completions.create({
        model,
        temperature:     0.3,
        max_tokens:      500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a senior buy-side equity analyst. Return only valid JSON.' },
          { role: 'user',   content: prompt },
        ],
      });
      content = res.choices[0]?.message?.content ?? null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!content) {
    console.error('[pitch] OpenAI unavailable:', lastErr);
    return NextResponse.json({ pitch: staticPitch(data) });
  }

  // ── Parse and validate JSON from model ────────────────────────────────
  let parsed2: {
    headline?:   string;
    bullThesis?: unknown;
    bearCase?:   unknown;
    catalysts?:  unknown;
    positioning?: string;
  };

  try {
    parsed2 = JSON.parse(content);
  } catch {
    console.error('[pitch] model returned non-JSON:', content);
    return NextResponse.json({ pitch: staticPitch(data) });
  }

  const toStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const pitch: PitchOutput = {
    ticker:       data.ticker,
    headline:     typeof parsed2.headline   === 'string' ? parsed2.headline   : `${data.ticker} — ${data.signal.toUpperCase()} signal`,
    bullThesis:   toStringArray(parsed2.bullThesis),
    bearCase:     toStringArray(parsed2.bearCase),
    catalysts:    toStringArray(parsed2.catalysts),
    positioning:  typeof parsed2.positioning === 'string' ? parsed2.positioning : '',
    horizonWeeks: data.horizonWeeks,
    generatedAt:  new Date().toISOString(),
    dataSource:   'ai',
  };

  // Ensure minimum structure is present before returning
  if (pitch.bullThesis.length === 0 || pitch.bearCase.length === 0) {
    return NextResponse.json({ pitch: staticPitch(data) });
  }

  return NextResponse.json({ pitch });
}
