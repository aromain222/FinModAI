import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type TrackEventPayload = {
  user_id: string | null;
  event_name: string;
  metadata: Record<string, any> | null;
};

function normalizePayload(body: unknown): TrackEventPayload | null {
  if (!body || typeof body !== 'object') return null;

  const raw = body as {
    user_id?: unknown;
    event_name?: unknown;
    metadata?: unknown;
  };

  if (typeof raw.event_name !== 'string') return null;
  const eventName = raw.event_name.trim();
  if (!eventName) return null;

  const userId =
    typeof raw.user_id === 'string' && raw.user_id.trim().length > 0
      ? raw.user_id.trim()
      : null;

  const metadata =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, any>)
      : null;

  return {
    user_id: userId,
    event_name: eventName,
    metadata,
  };
}

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const payload = normalizePayload(rawBody);

    if (!payload) {
      console.warn('[track-event] Invalid payload received');
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    if (!supabase) {
      console.error('[track-event] Missing Supabase env vars');
      return NextResponse.json({ success: false, error: 'Server misconfigured' }, { status: 500 });
    }

    const { error } = await supabase.from('user_events').insert(payload);
    if (error) {
      console.error('[track-event] Supabase insert failed', {
        event_name: payload.event_name,
        user_id: payload.user_id,
        error,
      });
      return NextResponse.json({ success: false, error: 'Failed to track event' }, { status: 500 });
    }

    console.log('[track-event] Event tracked', {
      event_name: payload.event_name,
      user_id: payload.user_id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[track-event] Unexpected error', error);
    return NextResponse.json({ success: false, error: 'Unexpected server error' }, { status: 500 });
  }
}
