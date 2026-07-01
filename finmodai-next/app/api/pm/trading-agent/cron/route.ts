/**
 * GET /api/pm/trading-agent/cron
 *
 * Fully autonomous trading loop. Scheduled via vercel.json on weekdays; the
 * agent sources its own candidates, consults the resident agents, sizes each
 * pick against portfolio equity, and executes — no human input per trade.
 *
 * Still paper-only and still env-gated: without
 * TRADING_AGENT_EXECUTION_ENABLED=true every run ends at pending decisions +
 * risk-checked previews. Protected by Authorization: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runTradingAgentScan } from '@/lib/pm/tradingAgent/scanUniverse';

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
    const run = await runTradingAgentScan({
      origin: appOrigin(req),
      requestHeaders: req.headers,
      maxCandidates: boundedIntParam(req, 'maxCandidates', 1, 8),
      maxPicks: boundedIntParam(req, 'maxPicks', 1, 3),
      execute: req.nextUrl.searchParams.get('execute') !== 'false',
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
      trackRecord: run.trackRecord,
      story: run.story,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trading agent cron failed' },
      { status: 502 },
    );
  }
}
