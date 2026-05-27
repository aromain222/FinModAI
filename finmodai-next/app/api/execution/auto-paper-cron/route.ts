/**
 * GET /api/execution/auto-paper-cron
 *
 * Server-side paper auto-trader entry point. This exists because Vercel Cron
 * invokes GET routes. It can auto-approve qualifying PM decisions and submit
 * Alpaca paper orders only when all paper-trading env flags are enabled.
 *
 * Protected by Authorization: Bearer ${EXECUTION_CRON_SECRET || CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAutoPaperTrader } from '@/lib/execution/autoPaperTrader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.EXECUTION_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runAutoPaperTrader({
    dryRun: false,
    autoApprove: req.nextUrl.searchParams.get('autoApprove') !== 'false',
    notional: parseNumber(req.nextUrl.searchParams.get('notional')),
    minConfidence: parseNumber(req.nextUrl.searchParams.get('minConfidence')),
    approvalMinConfidence: parseNumber(req.nextUrl.searchParams.get('approvalMinConfidence')),
    maxOrders: parseNumber(req.nextUrl.searchParams.get('maxOrders')),
  });

  return NextResponse.json({
    ...result,
    message: result.submitted > 0
      ? 'Cron submitted approved PM decisions to Alpaca paper trading.'
      : 'Cron ran; no paper orders submitted.',
  });
}
