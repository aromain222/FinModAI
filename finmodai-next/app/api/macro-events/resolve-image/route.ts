import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/events/store';
import { resolveMacroEventImageById } from '@/lib/macroEventImages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { event_id?: string } | null;
    const eventId = typeof body?.event_id === 'string' ? body.event_id.trim() : '';
    if (!eventId) {
      return NextResponse.json({ ok: false, error: 'event_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Supabase service role is not configured' }, { status: 500 });
    }

    const result = await resolveMacroEventImageById(supabase, eventId);
    return NextResponse.json(result, { status: result.ok ? 200 : result.mode === 'not_found' ? 404 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to resolve macro event image',
      },
      { status: 500 }
    );
  }
}
