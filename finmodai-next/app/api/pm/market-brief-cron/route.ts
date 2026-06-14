/**
 * GET /api/pm/market-brief-cron
 *
 * Scheduled CapitalBase Market Intelligence routine. Triggered by Vercel cron 5x
 * per weekday (6/10/12/14/16 ET). Each run gathers signals, calls the LLM, and
 * persists a structured brief to pm_market_briefs.
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}. Open locally for dev.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listPMRecords, upsertPMRecord } from '@/lib/pm/persistence/store';
import { generateMarketBrief, runLabelForNow, type MarketBriefRecord } from '@/lib/pm/marketBrief/generator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const executionSecret = process.env.EXECUTION_CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (executionSecret && auth === `Bearer ${executionSecret}`) return true;
  return !process.env.VERCEL;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const origin = new URL(req.url).origin;
  const runLabel = runLabelForNow();

  const recent = await listPMRecords<MarketBriefRecord>('pm_market_briefs', { limit: 1 });
  const previousSummary = recent[0]?.summary ?? null;

  const result = await generateMarketBrief({ origin, runLabel, previousSummary });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, runLabel }, { status: 502 });
  }
  const saved = await upsertPMRecord('pm_market_briefs', result.record);
  return NextResponse.json({ ok: true, runLabel, briefId: saved.id, summary: result.record.summary });
}
