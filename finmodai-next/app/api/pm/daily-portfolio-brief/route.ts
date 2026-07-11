import { NextRequest, NextResponse } from 'next/server';
import { generateDailyPortfolioBrief, type DailyPortfolioBrief } from '@/lib/pm/dailyBrief/generator';
import { listPMRecords, upsertPMRecord } from '@/lib/pm/persistence/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const scheduled = req.nextUrl.searchParams.get('scheduled') === 'true';
  if (!scheduled) {
    const records = await listPMRecords<DailyPortfolioBrief>('pm_daily_portfolio_briefs', { limit: 30 });
    return NextResponse.json({ briefs: records, latest: records[0] ?? null });
  }
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const record = await generateDailyPortfolioBrief({ origin: req.nextUrl.origin, runLabel: 'post_close', requestHeaders: req.headers });
    const saved = await upsertPMRecord('pm_daily_portfolio_briefs', record);
    return NextResponse.json({ ok: true, brief: saved });
  } catch (error) {
    return NextResponse.json({ error: 'daily_portfolio_brief_failed', reason: error instanceof Error ? error.message : 'unknown' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const record = await generateDailyPortfolioBrief({ origin: req.nextUrl.origin, runLabel: 'manual', requestHeaders: req.headers });
    const saved = await upsertPMRecord('pm_daily_portfolio_briefs', record);
    return NextResponse.json({ ok: true, brief: saved });
  } catch (error) {
    return NextResponse.json({ error: 'daily_portfolio_brief_failed', reason: error instanceof Error ? error.message : 'unknown' }, { status: 502 });
  }
}
