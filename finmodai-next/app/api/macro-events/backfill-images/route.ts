import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/events/store';
import { backfillMacroEventImages } from '@/lib/macroEventImages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const token = process.env.MACRO_EVENTS_ADMIN_TOKEN;
  if (!token) {
    return process.env.NODE_ENV !== 'production';
  }
  return request.headers.get('x-admin-token') === token;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as { limit?: number } | null;
    const limit = typeof body?.limit === 'number' ? body.limit : Number(request.nextUrl.searchParams.get('limit') || 50);
    const supabase = getSupabaseServiceClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Supabase service role is not configured' }, { status: 500 });
    }

    const result = await backfillMacroEventImages(supabase, limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to backfill macro event images',
      },
      { status: 500 }
    );
  }
}
