import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(_: Request, { params }: { params: { modelId: string } }) {
  const { modelId } = params;
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();

  if (sessionErr || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: reports } = await supabase
    .from('model_reports')
    .select('id, status, scenario_hash, created_at')
    .eq('model_id', modelId)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ ok: true, reports: reports ?? [] });
}
