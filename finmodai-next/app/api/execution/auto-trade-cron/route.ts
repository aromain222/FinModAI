/**
 * GET /api/execution/auto-trade-cron
 * v2
 *
 * Full auto-trade loop:
 *   1. Score the watchlist via the ranking engine
 *   2. Feed buy/sell candidates into PM Brain as agent views → decisions
 *   3. Auto-approve qualifying decisions (confidence ≥ threshold)
 *   4. Execute approved decisions via Alpaca paper
 *   5. Sync Alpaca positions back to PM portfolio store
 *
 * Runs Mon–Fri at 10:00 AM ET (14:00 UTC) via Vercel Cron.
 * Protected by Authorization: Bearer ${CRON_SECRET}.
 *
 * Required env vars:
 *   ALPACA_API_KEY_ID, ALPACA_SECRET_KEY
 *   ALPACA_AUTO_PAPER_ENABLED=true
 *   PM_AGENT_AUTO_APPROVAL_ENABLED=true
 *   CRON_SECRET
 *
 * Optional tuning:
 *   AUTO_TRADE_NOTIONAL (default 500 — dollars per order)
 *   AUTO_TRADE_MAX_ORDERS (default 5)
 *   AUTO_TRADE_MIN_CONFIDENCE (default 70)
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildPortfolio } from '@/lib/execution/portfolioBuilder';
import { syncAlpacaPositions } from '@/lib/execution/positionSync';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.EXECUTION_CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function appUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun  = req.nextUrl.searchParams.get('dryRun') !== 'false';
  const origin  = appUrl(req);
  const notional    = envNum('AUTO_TRADE_NOTIONAL', 500);
  const maxOrders   = envNum('AUTO_TRADE_MAX_ORDERS', 20);
  const minConf     = envNum('AUTO_TRADE_MIN_CONFIDENCE', 60);

  // Step 1–4: Rank → Decide → Approve → Execute
  const build = await buildPortfolio({ dryRun, notional, maxOrders, minConfidence: minConf, origin });

  // Step 5: Sync Alpaca positions back to PM store
  const sync = await syncAlpacaPositions();

  return NextResponse.json({
    ok: true,
    dryRun,
    pipeline: build,
    positionSync: sync,
    timestamp: new Date().toISOString(),
  });
}
