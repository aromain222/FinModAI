import { NextRequest, NextResponse } from 'next/server';
import { getRecentPromptModelRuns } from '@/lib/model-generator/runHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const limit = Number(req.nextUrl.searchParams.get('limit') || '8');
  const runs = await getRecentPromptModelRuns({
    surface: 'model_generator',
    sessionId: sessionId || null,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 20) : 8,
  });

  return NextResponse.json({ runs });
}
