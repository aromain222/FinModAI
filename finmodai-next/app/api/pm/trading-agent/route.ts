/**
 * POST /api/pm/trading-agent
 *
 * CapitalBase trading agent. Consults the platform's resident agents — the
 * TradingAgents research debate and the hedge-fund Senior Investment
 * Committee — plus stored positions and quant scout scores, then synthesizes
 * a single trade consensus and persists it as a pending InvestmentDecision.
 *
 * Execution is paper-only and triple-gated: the request must set
 * `execute: true` with a valid cron/execution bearer secret, and
 * TRADING_AGENT_EXECUTION_ENABLED must be true. Anything less returns the
 * decision + risk-checked order preview for human approval.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runTradingAgent } from '@/lib/pm/tradingAgent/runTradingAgent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const requestSchema = z.object({
  ticker: z.string().trim().min(1).max(10),
  themes: z.array(z.string().trim().min(1)).max(8).optional(),
  notional: z.number().positive().max(100_000).optional(),
  execute: z.boolean().optional().default(false),
});

function isAuthorizedForExecution(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const executionSecret = process.env.EXECUTION_CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (executionSecret && auth === `Bearer ${executionSecret}`) return true;
  // Locally (no VERCEL env) allow, so dev paper tests work without ceremony.
  return !process.env.VERCEL;
}

function appOrigin(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (base) return base.startsWith('http') ? base : `https://${base}`;
  return new URL(req.url).origin;
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

  if (parsed.data.execute && !isAuthorizedForExecution(req)) {
    return NextResponse.json(
      { error: 'Execution requests require the cron/execution bearer secret.' },
      { status: 401 },
    );
  }

  try {
    const run = await runTradingAgent({
      ticker: parsed.data.ticker,
      themes: parsed.data.themes,
      notional: parsed.data.notional,
      execute: parsed.data.execute,
      origin: appOrigin(req),
      requestHeaders: req.headers,
    });

    return NextResponse.json(run, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trading agent run failed' },
      { status: 502 },
    );
  }
}
