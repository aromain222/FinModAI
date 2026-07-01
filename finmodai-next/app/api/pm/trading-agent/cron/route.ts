/**
 * GET /api/pm/trading-agent/cron
 *
 * Fully autonomous trading loop. Scheduled hourly through the US session via
 * vercel.json; the agent sources its own candidates, consults the resident
 * agents, sizes each pick against portfolio equity, and executes — no human
 * input per trade. TRADING_AGENT_MAX_ORDERS_PER_DAY (default 6) caps how many
 * orders the loop may submit per UTC day; once spent, runs return early.
 *
 * Still paper-only and still env-gated: without
 * TRADING_AGENT_EXECUTION_ENABLED=true every run ends at pending decisions +
 * risk-checked previews. Protected by Authorization: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listDecisions } from '@/lib/pm/decisions/decisionStore';
import { runTradingAgentScan } from '@/lib/pm/tradingAgent/scanUniverse';
import { executedByAgentToday, tradingAgentEnvNumber } from '@/lib/pm/tradingAgent/runTradingAgent';

const DEFAULT_MAX_ORDERS_PER_DAY = 6;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const executionSecret = process.env.EXECUTION_CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (executionSecret && auth === `Bearer ${executionSecret}`) return true;
  // Locally (no VERCEL env) allow, so dev runs work without ceremony.
  return !process.env.VERCEL;
}

function appOrigin(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

function boundedIntParam(req: NextRequest, name: string, min: number, max: number): number | undefined {
  const raw = req.nextUrl.searchParams.get(name);
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : undefined;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const maxPerDay = tradingAgentEnvNumber('TRADING_AGENT_MAX_ORDERS_PER_DAY', DEFAULT_MAX_ORDERS_PER_DAY);
    const executedToday = executedByAgentToday(await listDecisions({ limit: 300 }).catch(() => []));
    const remainingBudget = Math.max(0, maxPerDay - executedToday);
    const executeRequested = req.nextUrl.searchParams.get('execute') !== 'false';

    if (executeRequested && remainingBudget === 0) {
      return NextResponse.json({
        ranAt: new Date().toISOString(),
        skipped: true,
        reason: `Daily order budget spent (${executedToday}/${maxPerDay} orders executed today); next run resumes tomorrow.`,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const requestedPicks = boundedIntParam(req, 'maxPicks', 1, 3);
    const run = await runTradingAgentScan({
      origin: appOrigin(req),
      requestHeaders: req.headers,
      maxCandidates: boundedIntParam(req, 'maxCandidates', 1, 8),
      // Cap picks by what's left of today's order budget without overriding
      // the personality default when the budget isn't the constraint.
      maxPicks: executeRequested && remainingBudget < 3
        ? Math.min(requestedPicks ?? remainingBudget, remainingBudget)
        : requestedPicks,
      execute: executeRequested,
      // Personality comes from TRADING_AGENT_PERSONALITY (default operator).
    });

    return NextResponse.json({
      ranAt: run.ranAt,
      personality: run.personality,
      universeSource: run.universeSource,
      scanned: run.scanned.map(analysis => analysis.candidate.ticker),
      picks: run.picks.map(pick => ({
        ticker: pick.ticker,
        selectionScore: pick.selectionScore,
        notional: pick.sizing.notional,
        allocationPct: pick.sizing.allocationPct,
        executionStatus: pick.execution.status,
      })),
      bookActions: run.bookActions.map(action => ({
        ticker: action.ticker,
        action: action.consensus.action,
        notional: action.sizing.notional,
        executionStatus: action.execution.status,
      })),
      trackRecord: run.trackRecord,
      orderBudget: {
        maxPerDay,
        executedToday,
        remainingBefore: remainingBudget,
      },
      story: run.story,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trading agent cron failed' },
      { status: 502 },
    );
  }
}
