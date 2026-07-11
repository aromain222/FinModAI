import { NextRequest, NextResponse } from 'next/server';
import {
  listAgentOutcomes,
  settleDueAgentOutcomes,
  summarizeCalibration,
} from '@/lib/pm/calibration/agentOutcomes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  // Vercel crons can only issue GETs; ?settle=1 routes them to the settle step.
  if (req.nextUrl.searchParams.get('settle') === '1') {
    if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await settleDueAgentOutcomes({ origin: new URL(req.url).origin });
    return NextResponse.json({ ok: true, ...result, settledAt: new Date().toISOString() });
  }
  const outcomes = await listAgentOutcomes({
    ticker: req.nextUrl.searchParams.get('ticker')?.toUpperCase(),
    limit: Math.min(1000, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 500))),
  });
  const names = [...new Set(outcomes.map(item => item.agentName))];
  return NextResponse.json({
    outcomes,
    calibration: names.map(name => summarizeCalibration(outcomes, name)),
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await settleDueAgentOutcomes({ origin: new URL(req.url).origin });
  return NextResponse.json({ ok: true, ...result, settledAt: new Date().toISOString() });
}
