/**
 * POST /api/assumption-update
 *
 * Applies a free-text user assumption to an opportunity score and returns
 * the adjusted score, delta, plausibility, and explanation.
 *
 * Fully synchronous — no LLM calls, response in < 5 ms.
 *
 * Body: AssumptionUpdateRequest
 * Response: { result: AssumptionResult; parsedClaim: ParsedClaimSummary }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyAssumption,
  parseClaim,
  type AssumptionResult,
} from '@/lib/assumptions/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Request schema ─────────────────────────────────────────────────────────

const breakdownSchema = z.object({
  forecastSignal:   z.number().min(0).max(10),
  catalystStrength: z.number().min(0).max(10),
  momentum:         z.number().min(0).max(10),
  earningsSetup:    z.number().min(0).max(10),
  riskAdjustment:   z.number().min(0).max(10),
});

const assumptionUpdateSchema = z.object({
  ticker:       z.string().min(1).max(10).regex(/^[A-Za-z.]{1,10}$/).toUpperCase(),
  baseScore:    z.number().min(1).max(10),
  breakdown:    breakdownSchema,
  assumption:   z.string().min(1).max(500).trim(),
  horizonWeeks: z.number().int().min(1).max(26).optional().default(6),
});

// ── Response shape ─────────────────────────────────────────────────────────

type ParsedClaimSummary = {
  direction:       'positive' | 'negative';
  magnitude:       number;
  parsedPct:       number | null;
  primaryFactor:   string;
  matchedKeywords: string[];
};

type AssumptionUpdateResponse = {
  result:      AssumptionResult;
  parsedClaim: ParsedClaimSummary;
};

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = assumptionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { ticker, baseScore, breakdown, assumption, horizonWeeks } = parsed.data;

  const claim  = parseClaim(assumption);
  const result = applyAssumption({ ticker, baseScore, breakdown, assumption, horizonWeeks });

  const primaryFactor = claim.affectedFactors.find(f => f.weight === 'primary')?.factor ?? 'forecastSignal';

  const response: AssumptionUpdateResponse = {
    result,
    parsedClaim: {
      direction:       claim.direction,
      magnitude:       claim.magnitude,
      parsedPct:       claim.parsedPct,
      primaryFactor,
      matchedKeywords: claim.matchedKeywords,
    },
  };

  return NextResponse.json(response, {
    headers: {
      'X-Plausibility':    result.plausibility,
      'X-Score-Delta':     result.delta.toFixed(1),
      'X-Has-Pushback':    result.pushback !== null ? 'true' : 'false',
    },
  });
}
