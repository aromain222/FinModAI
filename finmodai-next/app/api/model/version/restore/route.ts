import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { toSafeText } from '@/lib/utils/toSafeText';

export const runtime = 'nodejs';

const RestoreVersionSchema = z.object({
  version_id: z.string().uuid(),
  artifact_id: z.string().uuid(),
});

/**
 * POST /api/model/version/restore
 * Restore a version's inputs/scenarios/formulas to the current artifact
 * Returns the restored inputs for applying to the editor state
 */
export async function POST(req: NextRequest) {
  const traceId = randomUUID();

  try {
    const supabase = supabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = RestoreVersionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
          traceId,
        },
        { status: 400 }
      );
    }

    const { version_id, artifact_id } = parsed.data;

    // Verify user owns both version and artifact
    const { data: version, error: versionError } = await supabase
      .from('model_versions')
      .select('id, artifact_id, base_inputs, scenario_overrides, formula_overrides')
      .eq('id', version_id)
      .eq('user_id', user.id)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { error: 'Version not found', traceId },
        { status: 404 }
      );
    }

    if (version.artifact_id !== artifact_id) {
      return NextResponse.json(
        { error: 'Version does not belong to specified artifact', traceId },
        { status: 400 }
      );
    }

    const { data: artifact, error: artifactError } = await supabase
      .from('agent_artifacts')
      .select('id, user_id, artifact_json')
      .eq('id', artifact_id)
      .eq('user_id', user.id)
      .single();

    if (artifactError || !artifact) {
      return NextResponse.json(
        { error: 'Artifact not found', traceId },
        { status: 404 }
      );
    }

    // Return the restored data for the client to apply
    return NextResponse.json(
      {
        ok: true,
        data: {
          base_inputs: version.base_inputs,
          scenario_overrides: version.scenario_overrides,
          formula_overrides: version.formula_overrides,
        },
        traceId,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[model/version/restore] POST error', { traceId, error: toSafeText(error) });
    return NextResponse.json(
      { error: 'Internal server error', details: toSafeText(error), traceId },
      { status: 500 }
    );
  }
}

