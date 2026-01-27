import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { buildReportForModel } from '@/lib/reports/adapters';
import { ReportV1Schema } from '@/types/reportContracts';
import { NextRequest } from 'next/server';

export async function GET(_: NextRequest, { params }: { params: { modelId: string } }) {
  const { modelId } = params;
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();
  if (sessionErr || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    data: model,
    error: fetchError,
  } = await supabase
    .from('models')
    .select('id, user_id, model_type, type, ticker, company_name, scenario, assumptions, results, preview, r2_key, file_name')
    .eq('id', modelId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: 'Database error', details: fetchError.message }, { status: 500 });
  if (!model) return NextResponse.json({ report: null, status: 'missing' }, { status: 200 });

  let results = model.results;
  try {
    if (typeof results === 'string') results = JSON.parse(results);
  } catch {
    results = {};
  }

  if (results?.report) {
    return NextResponse.json({ report: results.report, status: 'ready' }, { status: 200 });
  }

  return NextResponse.json({ report: null, status: 'missing' }, { status: 200 });
}

export async function POST(_: Request, { params }: { params: { modelId: string } }) {
  const { modelId } = params;
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();
  if (sessionErr || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: model, error: fetchError } = await supabase
    .from('models')
    .select('id, user_id, model_type, type, ticker, company_name, scenario, assumptions, results, preview, r2_key, file_name')
    .eq('id', modelId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: 'Database error', details: fetchError.message }, { status: 500 });
  if (!model) return NextResponse.json({ error: 'Model not found' }, { status: 404 });

  let results = model.results;
  try {
    if (typeof results === 'string') results = JSON.parse(results);
  } catch {
    results = {};
  }
  let preview = model.preview;
  try {
    if (typeof preview === 'string') preview = JSON.parse(preview);
  } catch {
    preview = null;
  }

  try {
    const report = buildReportForModel({
      modelId,
      modelType: model.model_type ?? model.type ?? 'other',
      ticker: model.ticker,
      companyName: model.company_name,
      scenario: model.scenario,
      results,
      preview,
    });

    const validated = ReportV1Schema.parse(report);

    const nextResults = {
      ...(results || {}),
      report: validated,
      reportGeneratedAt: new Date().toISOString(),
      reportVersion: (results?.reportVersion || 0) + 1,
    };

    const { error: updateError } = await supabase
      .from('models')
      .update({ results: nextResults, updated_at: new Date().toISOString() })
      .eq('id', modelId)
      .eq('user_id', session.user.id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to store report', details: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ reportId: modelId, status: 'ready', report: validated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to generate report' }, { status: 500 });
  }
}
