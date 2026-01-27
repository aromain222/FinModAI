import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { toSafeText } from '@/lib/utils/toSafeText';

export const runtime = 'nodejs';

/**
 * GET /api/model/version/:id
 * Read a specific version by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const traceId = randomUUID();
  const { id } = params;

  try {
    const supabase = supabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 });
    }

    const { data: version, error: fetchError } = await supabase
      .from('model_versions')
      .select('id, artifact_id, user_id, created_at, label, notes, base_inputs, scenario_overrides, formula_overrides, derived_key_outputs')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !version) {
      return NextResponse.json(
        { error: 'Version not found', traceId },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: version, traceId }, { status: 200 });
  } catch (error: any) {
    console.error('[model/version/:id] GET error', { traceId, error: toSafeText(error) });
    return NextResponse.json(
      { error: 'Internal server error', details: toSafeText(error), traceId },
      { status: 500 }
    );
  }
}

