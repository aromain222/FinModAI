/**
 * GET /api/pm/trade-loop-cron
 *
 * Server-side "constantly trading" loop. Scheduled every 5 min via vercel.json.
 * Iterates every active position, runs full quant monitoring (6 scouts + scout
 * consensus paper triggers + committee_cycle fire-and-forget). Designed to keep
 * paper trading firing whether the browser is open or not.
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runQuantMonitoring } from '@/lib/pm/monitoring/runQuantMonitoring';
import { listPositions } from '@/lib/pm/portfolio/positionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  // Close-by-default in production: if neither secret is set on a deployed env, refuse.
  // Locally (no VERCEL env), allow so dev/test still works without ceremony.
  const cronSecret = process.env.CRON_SECRET ?? '';
  const executionSecret = process.env.EXECUTION_CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (executionSecret && auth === `Bearer ${executionSecret}`) return true;
  // No matching secret. If on Vercel, refuse. Locally (no VERCEL), allow.
  return !process.env.VERCEL;
}

function appOrigin(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const origin = appOrigin(req);
  const positions = await listPositions({ limit: 200 });
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch');

  const tickers = [...new Set(active.map(p => p.ticker.toUpperCase()))];
  const results: Array<{ ticker: string; ok: boolean; events?: number; reason?: string }> = [];

  // Sequential to stay under the 300s budget and avoid hammering the hedge-fund route.
  for (const ticker of tickers) {
    try {
      const run = await runQuantMonitoring({
        ticker,
        origin,
        autoEscalate: true,
        requestHeaders: req.headers,
      });
      results.push({ ticker, ok: true, events: run.events.length });
    } catch (err) {
      results.push({ ticker, ok: false, reason: (err as Error).message });
    }
  }

  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    total: tickers.length,
    scanned: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  });
}
