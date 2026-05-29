/**
 * POST /api/assistant
 *
 * Investment assistant endpoint. Detects intent, routes to the correct
 * analysis mode, and streams the response.
 *
 * Body: AssistantRequest
 * Response: text/plain streaming
 *
 * The `mode` field is optional — if omitted, detectMode() classifies the
 * message automatically. Clients can override by passing an explicit mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import {
  detectMode,
  streamOrchestratorResponse,
  type InvestmentMode,
  type OrchestratorContext,
} from '@/lib/analyst/orchestrator';

export const dynamic    = 'force-dynamic';
export const runtime = 'edge';

// ── Request schema ─────────────────────────────────────────────────────────

const breakdownSchema = z.object({
  forecastSignal:   z.number(),
  catalystStrength: z.number(),
  momentum:         z.number(),
  earningsSetup:    z.number(),
  valuationSignal:  z.number().optional().default(5),
  riskAdjustment:   z.number(),
});

const eventItemSchema = z.object({
  title:     z.string().optional(),
  headline:  z.string().optional(),
  kind:      z.string().optional(),
  direction: z.string().optional(),
  magnitude: z.string().optional(),
});

const peerSchema = z.object({
  ticker:        z.string(),
  score:         z.number(),
  signal:        z.enum(['green', 'yellow', 'red']),
  primaryReason: z.string(),
  mainRisk:      z.string(),
  breakdown:     breakdownSchema,
});

const historySchema = z.object({
  role:    z.enum(['user', 'assistant']),
  content: z.string(),
});

const catalystItemSchema = z.object({
  title:     z.string(),
  channel:   z.string(),
  direction: z.string(),
  impactPct: z.number(),
  horizon:   z.string().default(''),
});

const assistantRequestSchema = z.object({
  message:      z.string().min(1).max(2000),
  mode:         z.enum(['explain', 'evaluate', 'challenge', 'compare', 'pitch']).optional(),
  context: z.object({
    primaryTicker:     z.string().min(1).max(10),
    score:             z.number().min(1).max(10),
    signal:            z.enum(['green', 'yellow', 'red']),
    horizonWeeks:      z.number().int().min(1).max(26).default(6),
    breakdown:         breakdownSchema,
    primaryReason:     z.string(),
    mainRisk:          z.string(),
    forecastReturnPct: z.number().nullable().optional(),
    catalystCount:     z.number().int().min(0).default(0),
    catalysts:         z.array(catalystItemSchema).default([]),
    companyName:       z.string().optional().default(''),
    sector:            z.string().optional().default(''),
    events:            z.array(eventItemSchema).default([]),
    recentPrices:      z.array(z.number()).default([]),
    peers:             z.array(peerSchema).default([]),
    history:           z.array(historySchema).default([]),
  }),
});

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response | NextResponse> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { message, context: rawCtx } = parsed.data;

  const ctx: OrchestratorContext = {
    ...rawCtx,
    forecastReturnPct: rawCtx.forecastReturnPct ?? null,
    catalysts:   rawCtx.catalysts,
    companyName: rawCtx.companyName,
    sector:      rawCtx.sector,
  };

  // Mode: explicit override > detection
  const detectionResult = detectMode(message, ctx);
  const mode: InvestmentMode = parsed.data.mode ?? detectionResult.mode;

  const apiKey = getOpenAIKey('user') || getOpenAIKey('service');
  if (!apiKey) {
    return NextResponse.json({ error: 'AI provider not configured' }, { status: 503 });
  }

  const openai  = new OpenAI({ apiKey });
  const models  = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-4o', 'gpt-4o-mini');

  // Surface the detected mode to the client via response header
  const response = await streamOrchestratorResponse({ message, mode, ctx, openai, models });

  const headers = new Headers(response.headers);
  headers.set('X-Assistant-Mode', mode);
  headers.set('X-Mode-Confidence', detectionResult.confidence);

  return new Response(response.body, {
    status:  response.status,
    headers,
  });
}
