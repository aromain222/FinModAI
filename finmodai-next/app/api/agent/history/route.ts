import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { supabaseRouteClient } from '@/lib/supabase/server';
import { OutputTypeSchema } from '@/lib/ai/schemas';
import { toErrorText } from '@/lib/providers/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const AgentArtifactSummarySchema = z
  .object({
    id: z.string().uuid(),
    created_at: z.string(),
    type: OutputTypeSchema,
    title: z.string(),
    summary: z.string(),
    prompt: z.string(),
  })
  .strict();

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();
  try {
    const supabase = supabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized', traceId }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsedQuery = QuerySchema.safeParse({ limit: searchParams.get('limit') ?? undefined });
    const limit = parsedQuery.success ? parsedQuery.data.limit : 20;

    const { data, error } = await supabase
      .from('agent_artifacts')
      .select('id, created_at, type, title, summary, prompt')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: 'db_error', message: error.message, traceId }, { status: 500 });
    }

    const itemsParsed = z.array(AgentArtifactSummarySchema).safeParse(data ?? []);
    if (!itemsParsed.success) {
      return NextResponse.json(
        { ok: false, error: 'invalid_rows', message: itemsParsed.error.message, traceId },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, items: itemsParsed.data, traceId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'unknown', message: toErrorText(error), traceId }, { status: 500 });
  }
}

