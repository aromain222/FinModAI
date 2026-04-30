import { NextRequest, NextResponse } from 'next/server';
import { getLiveCompanyFinancialSnapshot } from '@/lib/data/company/liveFinancialSnapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')?.trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ ok: false, error: 'ticker is required' }, { status: 400 });
  }

  const snapshot = await getLiveCompanyFinancialSnapshot(ticker);
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: `No live financial snapshot available for ${ticker}` }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, snapshot },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
