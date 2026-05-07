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
import { buildValuationSignal } from '@/lib/valuation/signal';
import type { ScoreBreakdown, ValuationSignalSummary } from '@/lib/ranking/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Request schema ─────────────────────────────────────────────────────────

const breakdownSchema = z.object({
  forecastSignal:   z.number().min(0).max(10),
  catalystStrength: z.number().min(0).max(10),
  momentum:         z.number().min(0).max(10),
  earningsSetup:    z.number().min(0).max(10),
  valuationSignal:  z.number().min(0).max(10),
  riskAdjustment:   z.number().min(0).max(10),
});

const assumptionUpdateSchema = z.object({
  ticker:       z.string().min(1).max(10).regex(/^[A-Za-z.]{1,10}$/).toUpperCase(),
  baseScore:    z.number().min(1).max(10),
  breakdown:    breakdownSchema,
  assumption:   z.string().min(1).max(500).trim(),
  horizonWeeks: z.number().int().min(1).max(26).optional().default(6),
  forecastReturnPct: z.number().nullable().optional().default(null),
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
  financialImpact: {
    beforeValuation: ValuationSignalSummary;
    afterValuation: ValuationSignalSummary;
    valuationGapDelta: number | null;
    expectedMoveDeltaPct: number;
    riskScoreBefore: number;
    riskScoreAfter: number;
    riskRead: string;
  };
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function expectedMoveDeltaPct(before: ScoreBreakdown, after: ScoreBreakdown): number {
  const delta =
    (after.forecastSignal - before.forecastSignal) * 0.8 +
    (after.catalystStrength - before.catalystStrength) * 0.65 +
    (after.earningsSetup - before.earningsSetup) * 0.75 +
    (after.momentum - before.momentum) * 0.45 +
    (after.valuationSignal - before.valuationSignal) * 0.45 +
    (after.riskAdjustment - before.riskAdjustment) * 0.35;
  return round1(Math.max(-8, Math.min(8, delta)));
}

function riskRead(before: number, after: number): string {
  const delta = round1(after - before);
  if (delta >= 0.5) return `Risk improved: risk score ${before.toFixed(1)} → ${after.toFixed(1)}.`;
  if (delta <= -0.5) return `Risk worsened: risk score ${before.toFixed(1)} → ${after.toFixed(1)}.`;
  return `Risk mostly unchanged: risk score ${before.toFixed(1)} → ${after.toFixed(1)}.`;
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

  const parsed = assumptionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { ticker, baseScore, breakdown, assumption, horizonWeeks, forecastReturnPct } = parsed.data;

  const claim  = parseClaim(assumption);
  const result = applyAssumption({ ticker, baseScore, breakdown, assumption, horizonWeeks });

  const primaryFactor = claim.affectedFactors.find(f => f.weight === 'primary')?.factor ?? 'forecastSignal';

  const beforeValuation = buildValuationSignal({
    ticker,
    forecastReturnPct,
    factorBreakdown: breakdown,
  });
  const afterValuation = buildValuationSignal({
    ticker,
    forecastReturnPct,
    factorBreakdown: result.adjustedBreakdown,
  });
  const valuationGapDelta =
    beforeValuation.impliedUpside != null && afterValuation.impliedUpside != null
      ? round1(afterValuation.impliedUpside - beforeValuation.impliedUpside)
      : null;

  const response: AssumptionUpdateResponse = {
    result,
    parsedClaim: {
      direction:       claim.direction,
      magnitude:       claim.magnitude,
      parsedPct:       claim.parsedPct,
      primaryFactor,
      matchedKeywords: claim.matchedKeywords,
    },
    financialImpact: {
      beforeValuation,
      afterValuation,
      valuationGapDelta,
      expectedMoveDeltaPct: expectedMoveDeltaPct(breakdown, result.adjustedBreakdown),
      riskScoreBefore: breakdown.riskAdjustment,
      riskScoreAfter: result.adjustedBreakdown.riskAdjustment,
      riskRead: riskRead(breakdown.riskAdjustment, result.adjustedBreakdown.riskAdjustment),
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
