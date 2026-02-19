import { NextResponse } from 'next/server';
import { isDemoModeFromRequest } from '@/lib/demo/isDemoMode';
import { getDemoLastUpdated } from '@/lib/data/providers/demoProvider';

export async function GET(req: Request) {
  const demoMode = isDemoModeFromRequest(req);
  if (!demoMode) {
    return NextResponse.json({ lastUpdated: null, demoMode: false });
  }

  const lastUpdated = await getDemoLastUpdated();
  const res = NextResponse.json({ lastUpdated, demoMode: true });
  res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res;
}
