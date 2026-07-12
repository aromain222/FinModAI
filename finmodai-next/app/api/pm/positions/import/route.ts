import { NextRequest, NextResponse } from 'next/server';
import { holdingsImportSchema, buildHoldingsImportPlan } from '@/lib/pm/portfolio/importPositions';
import { listPositions, savePosition, updatePosition } from '@/lib/pm/portfolio/positionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = holdingsImportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid holdings snapshot', details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await listPositions({ limit: 500 });
  const plan = buildHoldingsImportPlan({ existing, holdings: parsed.data });
  const upserted = await Promise.all(plan.upserts.map(position => savePosition(position)));
  const closed = await Promise.all(plan.closes.map(async item => {
    const position = await updatePosition(item.id, { status: 'closed' });
    return position ? item.ticker : null;
  }));

  return NextResponse.json({
    ok: true,
    received: parsed.data.length,
    created: plan.created,
    updated: plan.updated,
    closed: closed.filter((ticker): ticker is string => ticker !== null),
    positions: upserted,
  });
}
