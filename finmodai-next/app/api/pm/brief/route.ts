/**
 * GET /api/pm/brief?type=daily|weekly|monthly
 *
 * Called by Vercel Cron on schedule. Fetches PM OS data and posts a
 * structured Discord brief.
 *
 * Schedules (in vercel.json):
 *   daily   — Mon–Fri 21:00 UTC (≈ 4–5 PM ET)
 *   weekly  — Friday  21:30 UTC
 *   monthly — 1st of month 22:00 UTC
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listPMRecords } from '@/lib/pm/persistence/store';
import type { PortfolioPosition, PMAlert, InvestmentDecision, PositionThesis } from '@/lib/pm/types';
import { sendDailyBrief, sendWeeklyBrief, sendMonthlyBrief } from '@/lib/pm/notifications/briefs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type BriefType = 'daily' | 'weekly' | 'monthly';

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow in dev when secret not set
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = (req.nextUrl.searchParams.get('type') ?? 'daily') as BriefType;
  if (!['daily', 'weekly', 'monthly'].includes(type)) {
    return NextResponse.json({ error: 'type must be daily, weekly, or monthly' }, { status: 400 });
  }

  const [positions, alerts, decisions, theses] = await Promise.all([
    listPMRecords<PortfolioPosition>('pm_positions', { limit: 200 }),
    listPMRecords<PMAlert>('pm_alerts', { limit: 500 }),
    listPMRecords<InvestmentDecision>('pm_investment_decisions', { limit: 200 }),
    listPMRecords<PositionThesis>('pm_position_theses', { limit: 200 }),
  ]);

  const data = { positions, alerts, decisions, theses };

  if (type === 'daily')   await sendDailyBrief(data);
  if (type === 'weekly')  await sendWeeklyBrief(data);
  if (type === 'monthly') await sendMonthlyBrief(data);

  return NextResponse.json({ ok: true, type, sent: new Date().toISOString() });
}
