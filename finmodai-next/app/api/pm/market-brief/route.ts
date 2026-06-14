import { NextRequest, NextResponse } from 'next/server';
import { listPMRecords, upsertPMRecord } from '@/lib/pm/persistence/store';
import { generateMarketBrief, type MarketBriefRecord } from '@/lib/pm/marketBrief/generator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const latestOnly = url.searchParams.get('latest') === 'true';

  const records = await listPMRecords<MarketBriefRecord>('pm_market_briefs', {
    limit: Math.min(Math.max(limit, 1), 100),
  });

  if (latestOnly) {
    return NextResponse.json({ brief: records[0] ?? null });
  }
  return NextResponse.json({
    briefs: records,
    latest: records[0] ?? null,
  });
}

export async function POST(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const body = await req.json().catch(() => ({})) as { runLabel?: string };
  const recent = await listPMRecords<MarketBriefRecord>('pm_market_briefs', { limit: 1 });
  const previousSummary = recent[0]?.summary ?? null;

  const result = await generateMarketBrief({
    origin,
    runLabel: body.runLabel ?? 'manual',
    previousSummary,
  });
  if (!result.ok) {
    return NextResponse.json({ error: 'generation_failed', reason: result.reason }, { status: 502 });
  }
  const saved = await upsertPMRecord('pm_market_briefs', result.record);
  return NextResponse.json({ ok: true, brief: saved });
}
