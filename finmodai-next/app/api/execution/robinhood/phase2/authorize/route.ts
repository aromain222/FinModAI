import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDecisionForExecution } from '@/lib/execution/orders';
import { authorizeRobinhoodPhase2Add, issueRobinhoodPhase2Authorization } from '@/lib/execution/robinhoodPhase2';
import { listDecisions } from '@/lib/pm/decisions/decisionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  decisionId: z.string().min(1),
  requestedNotional: z.number().positive().max(50),
  snapshot: z.object({
    portfolioValue: z.number().positive(), buyingPower: z.number().nonnegative(), tradingBlocked: z.boolean(), marketOpen: z.boolean(),
    quote: z.object({ symbol: z.string(), last: z.number().positive(), bid: z.number().positive(), ask: z.number().positive(), observedAt: z.string(), tradable: z.boolean(), assetType: z.enum(['stock', 'etf']) }),
    positions: z.array(z.object({ ticker: z.string(), marketValue: z.number().nonnegative() })).max(500),
    openOrderTickers: z.array(z.string()).max(500),
    todayOrderTickers: z.array(z.string()).max(500),
    todayOrderCount: z.number().int().nonnegative().max(500),
    todayOrderNotional: z.number().nonnegative().max(10_000_000),
  }),
});

function executionSecret(): string | null {
  return process.env.EXECUTION_CRON_SECRET || process.env.CRON_SECRET || null;
}

export async function POST(req: NextRequest) {
  const secret = executionSecret();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  const decision = await getDecisionForExecution(parsed.data.decisionId);
  if (!decision) return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
  const recentDecisions = await listDecisions({ limit: 500 });
  const authorization = authorizeRobinhoodPhase2Add({
    enabled: process.env.ROBINHOOD_PHASE2_ENABLED === 'true',
    decision,
    requestedNotional: parsed.data.requestedNotional,
    snapshot: parsed.data.snapshot,
    recentDecisions,
  });
  const authorizationId = authorization.authorized && authorization.order
    ? issueRobinhoodPhase2Authorization({
        secret,
        decisionId: decision.id,
        ticker: decision.ticker,
        maxNotional: Number(authorization.order.dollarAmount),
      })
    : null;
  return NextResponse.json({ decisionId: decision.id, ticker: decision.ticker, authorization, authorizationId }, {
    status: authorization.authorized ? 200 : 409,
    headers: { 'Cache-Control': 'no-store' },
  });
}
