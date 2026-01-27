import { NextRequest, NextResponse } from 'next/server';

import { AgentInputSchema, AgentOutputSchema } from '@/lib/ai/schemas';
import { runOutputAgent } from '@/lib/ai/agent';
import { toErrorText } from '@/lib/providers/utils';
import { supabaseRouteClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = AgentInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          message: 'Request body failed validation',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.') || '<root>',
            message: i.message,
          })),
          traceId,
        },
        { status: 400 }
      );
    }

    const supabase = supabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Unauthorized', traceId }, { status: 401 });
    }

    const output = AgentOutputSchema.parse(await runOutputAgent(parsed.data));

    const { error: insertError } = await supabase
      .from('agent_artifacts')
      .upsert(
        {
          id: output.id,
          user_id: user.id,
          type: output.type,
          title: output.title,
          summary: output.summary,
          artifact_json: output,
          prompt: parsed.data.prompt,
          followup_answers: parsed.data.followup_answers ?? {},
        },
        { onConflict: 'id' }
      );

    if (insertError) {
      console.error('[agent] failed to persist artifact', {
        traceId,
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
      });
      const withWarning = AgentOutputSchema.parse({
        ...output,
        warnings: Array.from(new Set([...(output.warnings ?? []), 'persistence_failed'])),
      });
      return NextResponse.json(withWarning);
    }

    return NextResponse.json(output);
  } catch (error) {
    return NextResponse.json(
      { error: 'agent_error', message: toErrorText(error), traceId },
      { status: 500 }
    );
  }
}
