import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { toSafeText } from '@/lib/utils/toSafeText';

export const runtime = 'nodejs';

const CreateVersionSchema = z.object({
  artifact_id: z.string().uuid(),
  label: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const ListVersionsSchema = z.object({
  artifact_id: z.string().uuid(),
});

/**
 * POST /api/model/version
 * Create a new version snapshot of a MODEL_AND_VIZ artifact
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
    const parsed = CreateVersionSchema.safeParse(body);

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

    const { artifact_id, label, notes } = parsed.data;

    // Fetch the artifact to extract version data
    const { data: artifact, error: fetchError } = await supabase
      .from('agent_artifacts')
      .select('id, user_id, type, artifact_json')
      .eq('id', artifact_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !artifact) {
      return NextResponse.json(
        { error: 'Artifact not found', traceId },
        { status: 404 }
      );
    }

    if (artifact.type !== 'MODEL_AND_VIZ') {
      return NextResponse.json(
        { error: 'Versioning only supported for MODEL_AND_VIZ artifacts', traceId },
        { status: 400 }
      );
    }

    const artifactData = artifact.artifact_json as any;
    const modelArtifact: ModelAndVizArtifact = artifactData.artifact;

    if (!modelArtifact || !modelArtifact.model) {
      return NextResponse.json(
        { error: 'Invalid artifact structure', traceId },
        { status: 400 }
      );
    }

    // Extract base inputs
    const base_inputs = modelArtifact.model.inputs || [];

    // Extract scenario overrides (if any) - for now, we'll store empty, but structure is there
    const scenario_overrides = null; // Could be populated from artifact metadata in future

    // Extract formula overrides (if any) - equations that were modified
    const formula_overrides = modelArtifact.model.equations || null;

    // Extract key outputs from summary for quick comparison
    const derived_key_outputs: Record<string, any> = {};
    if (modelArtifact.evaluation?.summary) {
      for (const item of modelArtifact.evaluation.summary) {
        derived_key_outputs[item.key] = {
          label: item.label,
          value: item.value,
          unit: item.unit,
        };
      }
    }

    // If no summary, extract from first/last rows as fallback
    if (Object.keys(derived_key_outputs).length === 0 && modelArtifact.evaluation?.rows?.length > 0) {
      const firstRow = modelArtifact.evaluation.rows[0];
      const lastRow = modelArtifact.evaluation.rows[modelArtifact.evaluation.rows.length - 1];
      if (firstRow && lastRow) {
        // Store period values
        derived_key_outputs._first_period = firstRow.period;
        derived_key_outputs._last_period = lastRow.period;
        // Store primary output values if available
        const outputs = modelArtifact.model.outputs || [];
        if (outputs.length > 0) {
          const primaryKey = outputs[0].key;
          if (firstRow[primaryKey] !== undefined) {
            derived_key_outputs[`${primaryKey}_first`] = firstRow[primaryKey];
          }
          if (lastRow[primaryKey] !== undefined) {
            derived_key_outputs[`${primaryKey}_last`] = lastRow[primaryKey];
          }
        }
      }
    }

    // Insert version
    const { data: version, error: insertError } = await supabase
      .from('model_versions')
      .insert({
        artifact_id,
        user_id: user.id,
        label: label || null,
        notes: notes || null,
        base_inputs,
        scenario_overrides,
        formula_overrides,
        derived_key_outputs,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[model/version] Insert failed', { traceId, error: insertError });
      return NextResponse.json(
        { error: 'Failed to create version', details: toSafeText(insertError), traceId },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: version, traceId }, { status: 201 });
  } catch (error: any) {
    console.error('[model/version] POST error', { traceId, error: toSafeText(error) });
    return NextResponse.json(
      { error: 'Internal server error', details: toSafeText(error), traceId },
      { status: 500 }
    );
  }
}

/**
 * GET /api/model/version?artifact_id=...
 * List all versions for an artifact
 */
export async function GET(req: NextRequest) {
  const traceId = randomUUID();

  try {
    const supabase = supabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const artifact_id = searchParams.get('artifact_id');

    if (!artifact_id) {
      return NextResponse.json(
        { error: 'Missing artifact_id query parameter', traceId },
        { status: 400 }
      );
    }

    const parsed = ListVersionsSchema.safeParse({ artifact_id });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid artifact_id', traceId },
        { status: 400 }
      );
    }

    // Verify user owns the artifact
    const { data: artifact, error: artifactError } = await supabase
      .from('agent_artifacts')
      .select('id, user_id')
      .eq('id', artifact_id)
      .eq('user_id', user.id)
      .single();

    if (artifactError || !artifact) {
      return NextResponse.json(
        { error: 'Artifact not found', traceId },
        { status: 404 }
      );
    }

    // Fetch versions
    const { data: versions, error: versionsError } = await supabase
      .from('model_versions')
      .select('id, artifact_id, created_at, label, notes, base_inputs, scenario_overrides, formula_overrides, derived_key_outputs')
      .eq('artifact_id', artifact_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (versionsError) {
      console.error('[model/version] List failed', { traceId, error: versionsError });
      return NextResponse.json(
        { error: 'Failed to list versions', details: toSafeText(versionsError), traceId },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: versions || [], traceId }, { status: 200 });
  } catch (error: any) {
    console.error('[model/version] GET error', { traceId, error: toSafeText(error) });
    return NextResponse.json(
      { error: 'Internal server error', details: toSafeText(error), traceId },
      { status: 500 }
    );
  }
}

