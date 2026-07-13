import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, readJson } from '@/lib/pm/api/http';
import {
  escalatedEventsForTicker,
  runInvestmentCommittee,
} from '@/lib/pm/monitoring/committee';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Must exceed committee.ts's 150s internal fetch budget plus persistence.
export const maxDuration = 300;

const committeeRequestSchema = z.object({
  ticker: z.string().trim().min(1).max(16).transform(value => value.toUpperCase()),
  trigger: z.enum(['signal_event', 'review_date', 'user_request', 'portfolio_rebalance']),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const input = committeeRequestSchema.parse(await readJson(req));
    const signalEvents = input.trigger === 'signal_event'
      ? await escalatedEventsForTicker(input.ticker)
      : [];
    if (input.trigger === 'signal_event' && signalEvents.length === 0) {
      return NextResponse.json({ error: 'No unreviewed escalated signal events for ticker.' }, { status: 409 });
    }
    const result = await runInvestmentCommittee({
      ...input,
      origin: new URL(req.url).origin,
      signalEvents,
      requestHeaders: req.headers,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error, 'Could not run investment committee');
  }
}
