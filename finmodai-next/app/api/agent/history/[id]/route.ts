import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { supabaseRouteClient } from '@/lib/supabase/server';
import { AgentOutputSchema, OutputTypeSchema } from '@/lib/ai/schemas';
import { toErrorText } from '@/lib/providers/utils';
import { ensureRenderBlocks } from '@/lib/ai/renderBlocks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

const AgentArtifactRowSchema = z
  .object({
    id: z.string().uuid(),
    created_at: z.string(),
    type: OutputTypeSchema,
    title: z.string(),
    summary: z.string(),
    prompt: z.string(),
    followup_answers: z.record(z.string()).optional(),
    artifact_json: z.unknown(),
  })
  .strict();

export async function GET(_req: NextRequest, context: { params: { id: string } }) {
  const traceId = crypto.randomUUID();
  try {
    const paramsParsed = ParamsSchema.safeParse(context.params);
    if (!paramsParsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_id', traceId }, { status: 400 });
    }

    const supabase = supabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized', traceId }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('agent_artifacts')
      .select('id, created_at, type, title, summary, prompt, followup_answers, artifact_json')
      .eq('user_id', user.id)
      .eq('id', paramsParsed.data.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: 'db_error', message: error.message, traceId }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: 'not_found', traceId }, { status: 404 });
    }

    const row = AgentArtifactRowSchema.parse(data);
    const output = AgentOutputSchema.parse(row.artifact_json);

    const normalizedOutput = ensureRenderBlocks(
      AgentOutputSchema.parse({
        ...output,
        id: row.id,
        type: row.type,
        title: row.title,
        summary: row.summary,
      })
    );

    return NextResponse.json({
      ok: true,
      item: {
        id: row.id,
        created_at: row.created_at,
        type: row.type,
        title: row.title,
        summary: row.summary,
        prompt: row.prompt,
        followup_answers: row.followup_answers ?? {},
        output: normalizedOutput,
      },
      traceId,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'unknown', message: toErrorText(error), traceId }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: { id: string } }) {
  const traceId = crypto.randomUUID();
  try {
    const paramsParsed = ParamsSchema.safeParse(context.params);
    if (!paramsParsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_id', traceId }, { status: 400 });
    }

    const supabase = supabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized', traceId }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('agent_artifacts')
      .delete()
      .eq('user_id', user.id)
      .eq('id', paramsParsed.data.id)
      .select('id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: 'db_error', message: error.message, traceId }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: 'not_found', traceId }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: data.id, traceId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'unknown', message: toErrorText(error), traceId }, { status: 500 });
  }
}
