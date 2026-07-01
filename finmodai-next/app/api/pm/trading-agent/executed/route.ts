/**
 * POST /api/pm/trading-agent/executed
 *
 * Write-back hook for external broker execution (e.g. a Robinhood MCP
 * client). The trading agent consults CapitalBase's resident agents and
 * persists a pending decision; when the caller executes that decision at an
 * outside broker, this route records the fill against the decision so the
 * PM approval trail and memory stay accurate. It never places orders itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDecisionForExecution } from '@/lib/execution/orders';
import { updateDecision } from '@/lib/pm/decisions/decisionStore';
import { recordOutcome } from '@/lib/pm/memory/recordOutcome';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
  decisionId: z.string().trim().min(1),
  broker: z.string().trim().min(1).max(40).default('robinhood'),
  status: z.enum(['filled', 'rejected', 'cancelled']).default('filled'),
  qty: z.number().positive().optional(),
  notional: z.number().positive().optional(),
  fillPrice: z.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

function describeFill(input: z.infer<typeof requestSchema>, ticker: string, action: string): string {
  const size = input.qty != null
    ? `${input.qty} shares`
    : input.notional != null
      ? `$${input.notional}`
      : 'unspecified size';
  const price = input.fillPrice != null ? ` at $${input.fillPrice}` : '';
  const note = input.note ? ` ${input.note}` : '';
  return `External ${input.broker} order ${input.status}: ${action.toUpperCase()} ${size} ${ticker}${price}.${note}`;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const decision = await getDecisionForExecution(parsed.data.decisionId);
    if (!decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }
    if (decision.executedAt) {
      return NextResponse.json(
        { error: `Decision was already executed at ${decision.executedAt}.` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const executionNote = describeFill(parsed.data, decision.ticker, decision.action);
    const filled = parsed.data.status === 'filled';

    const updated = await updateDecision(decision.id, {
      ...(filled && decision.approvalStatus === 'pending'
        ? { approvalStatus: 'approved' as const, approvedBy: `${parsed.data.broker}_mcp` }
        : {}),
      ...(filled ? { executedAt: now } : {}),
      executionNote,
      updatedAt: now,
    });

    try {
      await recordOutcome({
        memoryType: 'process_lesson',
        lesson: `${decision.ticker} trading-agent decision was ${parsed.data.status} at external broker ${parsed.data.broker}. ${executionNote}`,
        relatedTickers: [decision.ticker],
        relatedThemes: ['trading_agent', 'external_execution', parsed.data.broker],
        importance: filled ? 80 : 65,
      });
    } catch {
      // Write-back must not fail because PM memory persistence is unavailable.
    }

    return NextResponse.json(
      { decision: updated ?? decision, executionNote },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Execution write-back failed' },
      { status: 502 },
    );
  }
}
