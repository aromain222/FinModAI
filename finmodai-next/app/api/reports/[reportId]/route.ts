import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(_: Request, { params }: { params: { reportId: string } }) {
  const { reportId } = params;
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();

  if (sessionErr || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: report } = await supabase
    .from('model_reports')
    .select('id, status, report_json, model_id, created_at, updated_at')
    .eq('id', reportId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  return NextResponse.json({
    reportId: report.id,
    status: report.status,
    report: report.report_json,
    modelId: report.model_id,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
  });
}
