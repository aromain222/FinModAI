import { NextResponse } from 'next/server';
import { isDemoModeFromRequest } from '@/lib/demo/isDemoMode';
import { getDemoLastUpdated, getDemoTickers } from '@/lib/data/providers/demoProvider';

export async function GET(req: Request) {
  const demoMode = isDemoModeFromRequest(req);
  if (!demoMode) {
    return NextResponse.json({ demoMode: false });
  }

  const [lastUpdated, tickers] = await Promise.all([
    getDemoLastUpdated(),
    getDemoTickers(),
  ]);
  return NextResponse.json({
    demoMode: true,
    lastUpdated,
    count: tickers.length,
  });
}
