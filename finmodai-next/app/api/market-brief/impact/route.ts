import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cached } from '@/lib/cache';
import { callLLM } from '@/lib/ai/llm';
import { parseJSONResponse } from '@/lib/ai/llm';

export const runtime = 'nodejs';

const BodySchema = z.object({
  id: z.string().min(1),           // stable id from your headlines feed
  title: z.string().min(1),
  source: z.string().optional().default(''),
  url: z.string().optional(),
  publishedAt: z.string().optional().default(''),
  topics: z.array(z.string()).optional().default([]),

  // context from the UI state
  benchmark: z.string().optional().default('SPY'),
  range: z.string().optional().default('1M'),
  region: z.string().optional().default('global'),

  // optional: if you already have a short summary or excerpt, pass it
  excerpt: z.string().optional().default(''),
});

const OutputSchema = z.object({
  summary: z.string().min(40).max(320), // Exactly 2 dense sentences
});

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_request', details: parsed.error.flatten(), traceId },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // Cache per article + context to prevent "stagnant" but also avoid re-running constantly.
  // If you want summaries to be invariant to chart range/benchmark, remove those from the key.
  const cacheKey = `mb:impact:${body.id}:${body.region}:${body.benchmark}:${body.range}`;
  const ttlMs = 24 * 60 * 60 * 1000; // 24h

  try {
    const { value, stale } = await cached(cacheKey, ttlMs, async () => {
      const system = `
You are an institutional equity and macro analyst writing for CapitalBase.

STRICT RULES:
- Write EXACTLY 2 sentences.
- Each sentence must reference a concrete fact, actor, or mechanism from the article.
- NEVER use generic phrases like:
  "market sentiment"
  "near-term positioning"
  "price action monitored"
  "broader markets"
  "investors are watching"
- If the article involves:
  - litigation → discuss legal liability, settlement risk, valuation impact
  - earnings → margins, guidance, cash flow, multiples
  - policy → rates, fiscal impact, sector exposure
  - commodities → supply, demand, pricing pressure
- If no clear market impact exists, say WHY it is limited.

Your output should read like a sell-side analyst note, not a news summary.
      `.trim();

      const user = `
Article headline:
"${body.title}"

Source: ${body.source}
Published: ${body.publishedAt}
Topics: ${body.topics.join(', ') || 'n/a'}

Context:
- Benchmark: ${body.benchmark}
- Region: ${body.region}

Write EXACTLY 2 sentences explaining:
1) The specific economic or financial mechanism this article introduces
2) Which company, asset, or sector is most exposed and why

Be concrete. Name companies, risks, or transmission channels.
Do NOT summarize the article.
      `.trim();

      // IMPORTANT: low-ish temp but not zero, otherwise you'll get repetitive phrasing.
      const response = await callLLM({
        systemPrompt: system,
        userPrompt: user,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.4,
        maxTokens: 500,
        responseFormat: { type: 'json_object' },
        traceId,
      });

      const rawOutput = parseJSONResponse<unknown>(response.content, traceId);
      const validated = OutputSchema.safeParse(rawOutput);

      if (!validated.success) {
        throw new Error(`LLM output validation failed: ${validated.error.message}`);
      }

      return validated.data;
    });

    return NextResponse.json({
      ok: true,
      data: {
        summary: value.summary,
      },
      meta: {
        stale,
        traceId,
        cached: true,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: 'generation_failed',
        message: error?.message || 'Failed to generate impact summary',
        traceId,
      },
      { status: 500 }
    );
  }
}
