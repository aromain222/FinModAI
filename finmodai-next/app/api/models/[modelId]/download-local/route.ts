import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const LOCAL_EXPORT_DIR = '.local-model-exports';

export async function GET(req: Request, { params }: { params: { modelId: string } }) {
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
      { error: 'UNAUTHORIZED', details: sessionError?.message || 'Auth required', traceId },
      { status: 401 }
    );
  }

  const rawUserId = session?.user?.id;
  const effectiveUserId = devBypass
    ? '00000000-0000-0000-0000-000000000000'
    : typeof rawUserId === 'string' && rawUserId.length >= 32 && rawUserId !== 'undefined'
      ? rawUserId
      : null;

  if (!effectiveUserId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', details: 'Auth required', traceId },
      { status: 401 }
    );
  }

  const { data: model, error } = await supabase
    .from('models')
    .select('id, user_id, file_name, ticker, model_type, results')
    .eq('id', modelId)
    .eq('user_id', effectiveUserId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: 'DATABASE_ERROR', details: error.message, traceId },
      { status: 500 }
    );
  }

  if (!model) {
    return NextResponse.json(
      { error: 'MODEL_NOT_FOUND', details: 'Model not found', traceId },
      { status: 404 }
    );
  }

  let results: any = model.results;
  if (typeof results === 'string') {
    try {
      results = JSON.parse(results);
    } catch {
      results = null;
    }
  }

  const localPathRaw =
    typeof results?.local_path === 'string'
      ? results.local_path
      : typeof results?.localPath === 'string'
      ? results.localPath
      : null;

  if (!localPathRaw || localPathRaw.trim().length === 0) {
    return NextResponse.json(
      { error: 'FILE_NOT_READY', details: 'Local export not available yet', traceId },
      { status: 409 }
    );
  }

  const baseDir = path.resolve(process.cwd(), LOCAL_EXPORT_DIR);
  const resolvedPath = path.resolve(localPathRaw);
  const withinBase = resolvedPath.startsWith(baseDir + path.sep);
  if (!withinBase) {
    return NextResponse.json(
      { error: 'INVALID_FILE_POINTER', details: 'Invalid local file pointer', traceId },
      { status: 400 }
    );
  }

  let buf: Buffer;
  try {
    buf = await readFile(resolvedPath);
  } catch (e: any) {
    return NextResponse.json(
      { error: 'FILE_READ_FAILED', details: e?.message || 'Failed to read local export', traceId },
      { status: 500 }
    );
  }

  const filename =
    model.file_name ||
    results?.filename ||
    `${model.ticker || 'CapitalBase'}-${model.model_type || 'model'}.xlsx`;

  return new Response(buf, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Trace-Id': traceId,
    },
  });
}

