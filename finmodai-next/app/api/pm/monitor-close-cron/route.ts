import { NextRequest, NextResponse } from 'next/server';
import { GET as runPortfolioMonitor } from '@/app/api/pm/monitor-cron/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  return runPortfolioMonitor(req);
}
