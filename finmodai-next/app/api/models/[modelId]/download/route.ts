import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { randomUUID } from 'node:crypto';
import { getSignedDownloadUrl } from '@/lib/r2';
import { getFilePointer, getFileKey } from '@/lib/fileContracts';
import { reconcileFilePointer } from '@/lib/reconcileFile';

export async function GET(
  req: Request,
  { params }: { params: { modelId: string } }
) {
  const traceId = randomUUID();
  const modelId = params?.modelId;
  const isValidModelId =
    typeof modelId === 'string' && modelId.length >= 32 && modelId !== 'undefined';
  if (!isValidModelId) {
    return NextResponse.json(
      { error: 'MODEL_ID_REQUIRED', details: 'modelId is required', traceId },
      { status: 400 }
    );
  }

  const supabase = createRouteHandlerClient({ cookies });
  const devBypass =
    process.env.NODE_ENV !== 'production' &&
    (process.env.BYPASS_AUTH === '1' ||
      process.env.DEMO_BYPASS_AUTH === '1' ||
      process.env.DEMO_MODE === '1');

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (!devBypass && (sessionError || !session?.user?.id)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', details: sessionError?.message || 'Auth required' },
      { status: 401 }
    );
  }

  const rawUserId = session?.user?.id;
  const isValidUuid =
    typeof rawUserId === 'string' &&
    rawUserId.length >= 32 &&
    rawUserId !== 'undefined';

  const effectiveUserId = devBypass
    ? '00000000-0000-0000-0000-000000000000'
    : isValidUuid
      ? rawUserId
      : null;

  if (!effectiveUserId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', details: 'Auth required', traceId },
      { status: 401 }
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[DOWNLOAD_MODEL][AUTH]', { devBypass, effectiveUserId, modelId });
  }

  const query = supabase
    .from('models')
    .select('id, user_id, status, r2_key, file_name, ticker, model_type, scenario, scenario_adjustment_notes, scenario_summary_notes, assumptions, company_name, results')
    .eq('id', modelId)
    .eq('user_id', effectiveUserId);

  const { data: model, error } = await query.maybeSingle();

  if (error) {
    console.error('[downloadModel] DB error', { modelId, userId: effectiveUserId, error });
    return NextResponse.json(
      { error: 'DATABASE_ERROR', details: error.message, traceId },
      { status: 500 }
    );
  }

  if (!model) {
    return NextResponse.json({ error: 'MODEL_NOT_FOUND', details: 'Model not found', traceId }, { status: 404 });
  }

  let results = model.results;
  if (typeof results === 'string') {
    try {
      results = JSON.parse(results);
    } catch {
      results = null;
    }
  }

  let pointer = getFilePointer({ ...model, results });
  if (!pointer) {
    const reconciled = await reconcileFilePointer({ supabase, modelId, userId: effectiveUserId });
    pointer = reconciled.pointer;
    results = reconciled.model?.results ?? results;
  }

  if (!pointer) {
    return NextResponse.json(
      { error: 'FILE_NOT_READY', details: 'Workbook file not available yet. Generate the model first or retry.', traceId },
      { status: 409 }
    );
  }

  if (pointer.kind === 'url') {
    return NextResponse.json({
      url: pointer.value,
      filename:
        model.file_name ||
        results?.fileName ||
        `${model.ticker || 'CapitalBase'}-${model.model_type || 'model'}.xlsx`,
      traceId,
    });
  }

  const key = pointer.kind === 'key' ? pointer.value : getFileKey({ ...model, results });
  const filename =
    model.file_name ||
    results?.fileName ||
    `${model.ticker || 'CapitalBase'}-${model.model_type || 'model'}.xlsx`;

  let url: string | null = null;
  try {
    url = await getSignedDownloadUrl({
      key: key!,
      filename,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SIGNING_FAILED', details: error?.message || 'Failed to sign download URL', traceId },
      { status: 500 }
    );
  }

  console.log('[downloadModel] Signed URL generated', {
    modelId,
    userId: effectiveUserId,
    hasUrl: Boolean(url),
  });

  if (!url) {
    return NextResponse.json(
      { error: 'FILE_NOT_READY', details: 'Workbook file not available yet. Generate the model first or retry.', traceId },
      { status: 404 }
    );
  }

  return NextResponse.json({ url, filename, traceId });
}
