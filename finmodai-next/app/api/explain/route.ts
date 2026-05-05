/**
 * POST /api/explain
 *
 * Streams a natural-language explanation of why a stock was ranked the way
 * it was — written as a concise analyst note.
 *
 * Body: ExplainRequest
 * Response: text/plain streaming (SSE-compatible raw text)
 *
 * Falls back to a static summary string if OpenAI is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { WEIGHTS } from '@/lib/ranking/score';

export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const maxDuration = 30;

// ── Request schema ─────────────────────────────────────────────────────────

const breakdownSchema = z.object({
  forecastSignal:   z.number(),
  catalystStrength: z.number(),
  momentum:         z.number(),
  earningsSetup:    z.number(),
  riskAdjustment:   z.number(),
});

const explainRequestSchema = z.object({
  ticker:       z.string().min(1).max(10).regex(/^[A-Za-z.]{1,10}$/),
  score:        z.number().min(1).max(10),
  signal:       z.enum(['green', 'yellow', 'red']),
  horizonWeeks: z.number().int().min(1).max(26).default(6),
  breakdown:    breakdownSchema,
  primaryReason: z.string().optional(),
  mainRisk:     z.string().optional(),
  meta: z.object({
    forecastReturnPct: z.number().nullable().optional(),
    catalystCount:     z.number().optional(),
    dataSource:        z.enum(['live', 'mock']).optional(),
  }).optional(),
});

type ExplainRequest = z.infer<typeof explainRequestSchema>;

// ── Prompt builder ─────────────────────────────────────────────────────────

function buildExplainPrompt(req: ExplainRequest): string {
  const { ticker, score, signal, horizonWeeks, breakdown, primaryReason, mainRisk, meta } = req;

  const signalLabel = signal === 'green' ? 'BUY' : signal === 'yellow' ? 'HOLD/WATCH' : 'AVOID';
  const horizon = `${horizonWeeks}-week`;

  const components = [
    `  • Forecast Signal      ${breakdown.forecastSignal.toFixed(1)}/10  (weight ${(WEIGHTS.forecastSignal * 100).toFixed(0)}%)`,
    `  • Catalyst Strength    ${breakdown.catalystStrength.toFixed(1)}/10  (weight ${(WEIGHTS.catalystStrength * 100).toFixed(0)}%)`,
    `  • Momentum             ${breakdown.momentum.toFixed(1)}/10  (weight ${(WEIGHTS.momentum * 100).toFixed(0)}%)`,
    `  • Earnings Setup       ${breakdown.earningsSetup.toFixed(1)}/10  (weight ${(WEIGHTS.earningsSetup * 100).toFixed(0)}%)`,
    `  • Risk Adjustment      ${breakdown.riskAdjustment.toFixed(1)}/10  (weight ${(WEIGHTS.riskAdjustment * 100).toFixed(0)}%)`,
  ].join('\n');

  const forecastLine = meta?.forecastReturnPct != null
    ? `TimesFM price forecast: ${meta.forecastReturnPct >= 0 ? '+' : ''}${meta.forecastReturnPct.toFixed(1)}% over the horizon.`
    : 'No live price forecast available.';

  const dataLine = meta?.dataSource === 'mock'
    ? 'Note: scoring used estimated/mock data (live feed unavailable).'
    : `Catalyst events considered: ${meta?.catalystCount ?? 0}.`;

  const priorContext = [
    primaryReason ? `Strongest factor: ${primaryReason}` : null,
    mainRisk       ? `Key risk: ${mainRisk}` : null,
  ].filter(Boolean).join('\n');

  return `You are a senior equity analyst writing a brief investment note.

Stock: ${ticker}
Composite score: ${score.toFixed(1)} / 10  →  Signal: ${signalLabel}
Investment horizon: ${horizon}

Score breakdown:
${components}

Context:
${forecastLine}
${dataLine}
${priorContext}

Write a concise analyst note (3–4 sentences) that:
1. States the overall stance (${signalLabel}) and composite score.
2. Explains the 1–2 dominant factors driving the score in plain language.
3. Names the single biggest risk an investor should watch.
4. Ends with a one-sentence positioning guidance for the ${horizon} horizon.

Tone: direct, analytical, no fluff. Do not restate the score breakdown numerically — synthesise it.`;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response | NextResponse> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = explainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const apiKey = getOpenAIKey('user') || getOpenAIKey('service');

  // ── Static fallback when no AI key is configured ───────────────────────
  if (!apiKey) {
    const signal = data.signal === 'green' ? 'BUY' : data.signal === 'yellow' ? 'HOLD' : 'AVOID';
    const fallback = [
      `${data.ticker} scores ${data.score.toFixed(1)}/10 — ${signal} over a ${data.horizonWeeks}-week horizon.`,
      data.primaryReason ?? 'No detailed reason available.',
      data.mainRisk      ? `Key risk: ${data.mainRisk}` : '',
    ].filter(Boolean).join(' ');

    return new Response(fallback, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // ── Stream from OpenAI ─────────────────────────────────────────────────
  const prompt = buildExplainPrompt(data);
  const openai  = new OpenAI({ apiKey });
  const models  = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-4o', 'gpt-4o-mini');

  let stream: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
  let lastErr: unknown;

  for (const model of models) {
    try {
      stream = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens:  300,
        stream:      true,
        messages: [
          { role: 'system', content: 'You are a senior equity analyst. Be direct and concise.' },
          { role: 'user',   content: prompt },
        ],
      });
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!stream) {
    console.error('[explain] OpenAI unavailable:', lastErr);
    return NextResponse.json({ error: 'AI provider unavailable' }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream!) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        console.error('[explain] stream error:', err);
        controller.enqueue(encoder.encode('\n[Analysis interrupted]'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
