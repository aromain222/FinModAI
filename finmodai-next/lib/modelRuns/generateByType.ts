import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createRun, findRunByHash, updateRun } from '@/lib/modelRunStore';
import { isObjectStoreConfigured, objectExists, uploadBufferAndSign } from '@/lib/storage/objectStore';
import { POST as generateModelPost } from '@/app/api/generateModel/route';
import { isDemoMode, isDemoModeFromRequest } from '@/lib/demo/isDemoMode';
import { runWithDemoMode } from '@/lib/demo/demoContext';
import { isDemoTickerAvailable } from '@/lib/data/providers/demoProvider';

type GeneratedPayload = {
  preview?: unknown;
  modelDocument?: unknown;
  dcfSummary?: unknown;
  lboSummary?: unknown;
  scorecardSummary?: unknown;
  assumptions?: unknown;
  diagnostics?: unknown;
  warnings?: unknown;
  appliedDefaults?: unknown;
};

const SUPPORTED_MODEL_TYPES = new Set(['dcf', 'three-statement', 'lbo', 'comps', 'scorecard']);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
  return `{${entries.join(',')}}`;
}

function hashInputs(payload: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function parseDataUriToBuffer(dataUri: string): Buffer {
  const base64Part = dataUri.split(',')[1] || '';
  return Buffer.from(base64Part, 'base64');
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  stage: 'validate' | 'generate' | 'upload' | 'unknown'
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      stage,
      status: 'failed',
      state: 'failed',
    },
    { status }
  );
}

export async function generateRunForModelType({
  req,
  modelTypeRaw,
  body,
}: {
  req: NextRequest;
  modelTypeRaw: string;
  body: any;
}) {
  const demoEnabled = isDemoModeFromRequest(req) || isDemoMode();
  if (!demoEnabled) {
    return errorResponse(400, 'demo_mode_required', 'Demo mode is required for model generation.', 'validate');
  }

  return runWithDemoMode(true, async () => {
    try {
  const modelType = String(modelTypeRaw || '').toLowerCase();
  if (!SUPPORTED_MODEL_TYPES.has(modelType)) {
    return errorResponse(400, 'unsupported_model_type', `Unsupported model type: ${modelType}`, 'validate');
  }

  const ticker = String(body?.ticker || '').trim().toUpperCase();
  const asOfDate = String(body?.asOfDate || new Date().toISOString().slice(0, 10));

  if (!ticker) {
    return NextResponse.json(
      {
        ok: true,
        status: 'assumptions_required',
        state: 'assumptions_required',
        missingInputs: ['ticker'],
        message: 'Ticker is required.',
      },
      { status: 200 }
    );
  }

  if (isDemoMode()) {
    const demoAllowed = await isDemoTickerAvailable(ticker);
    if (!demoAllowed) {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        state: 'failed',
        code: 'DEMO_NOT_FOUND',
        message: 'This demo ticker is not in the curated demo set. Choose a demo company.',
      },
      { status: 400 }
    );
    }
  }

  const payloadForHash = {
    modelType,
    ticker,
    asOfDate,
    inputs: body,
  };
  const inputsHash = hashInputs(payloadForHash);

  const existing = findRunByHash(inputsHash);
  if (existing?.status === 'generated' && (existing.storageKey || existing.dataUrl)) {
    const generatedResult = (existing.result || {}) as GeneratedPayload;
    return NextResponse.json({
      ok: true,
      status: 'generated',
      state: 'generated',
      runId: existing.id,
      storageKey: existing.storageKey,
      downloadUrl: null,
      ...generatedResult,
    });
  }
  if (existing?.status === 'generating') {
    return NextResponse.json({ ok: true, status: 'generating', state: 'generating', runId: existing.id });
  }

  const run = createRun({
    userId: null,
    modelType,
    ticker,
    asOfDate,
    inputsHash,
    status: 'generating',
  });
  console.log('[model-run] status transition', { runId: run.id, from: 'new', to: 'generating', ticker, modelType });

  try {
    const internalReq = new NextRequest(`${req.nextUrl.origin}/api/generateModel?format=json`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-capitalbase-inline-download': '1',
      },
      body: JSON.stringify({
        ...body,
        ticker,
        modelType,
      }),
    });

    const generationResponse = await generateModelPost(internalReq);
    const generationJson = await generationResponse.json();

    if (!generationResponse.ok) {
      updateRun(run.id, {
        status: 'failed',
        errorMessage: generationJson?.message || generationJson?.error || 'generateModel failed',
      });
      return errorResponse(
        generationResponse.status,
        generationJson?.code || 'generate_model_failed',
        generationJson?.message || generationJson?.error || 'Model generation failed',
        'generate'
      );
    }

    if (generationJson?.state === 'assumptions_required') {
      updateRun(run.id, {
        status: 'assumptions_required',
        result: {
          missingInputs: generationJson?.missing || [],
          requiredInputs: generationJson?.requiredInputs || [],
          estimatedInputs: generationJson?.estimated || [],
        },
      });
      console.log('[model-run] status transition', { runId: run.id, from: 'generating', to: 'assumptions_required' });
      return NextResponse.json({
        ok: true,
        status: 'assumptions_required',
        state: 'assumptions_required',
        runId: run.id,
        missingInputs: generationJson?.missing || [],
        requiredInputs: generationJson?.requiredInputs || [],
        estimatedInputs: generationJson?.estimated || [],
        message: generationJson?.message || 'Required assumptions are missing.',
      });
    }

    const dataUri = generationJson?.downloadUrl;
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
      updateRun(run.id, { status: 'failed', errorMessage: 'Missing inline workbook data in generation response' });
      return errorResponse(500, 'missing_download_data', 'Generation response did not include workbook data', 'generate');
    }

    const workbookBuffer = parseDataUriToBuffer(dataUri);
    let storageKey: string | undefined;
    let dataUrl: string | undefined;

    if (isObjectStoreConfigured()) {
      storageKey = `models/${run.id}.xlsx`;
      await uploadBufferAndSign({
        key: storageKey,
        buffer: workbookBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        expiresInSeconds: 900,
      });

      const exists = await objectExists(storageKey);
      console.log('[model-run] upload confirmation', { runId: run.id, storageKey, exists });
      if (!exists) {
        updateRun(run.id, { status: 'failed', errorMessage: 'Workbook upload verification failed' });
        return errorResponse(500, 'upload_verification_failed', 'Workbook upload verification failed', 'upload');
      }
    } else {
      dataUrl = dataUri;
    }

    const generatedResult: GeneratedPayload = {
      preview: generationJson?.preview,
      modelDocument: generationJson?.modelDocument,
      dcfSummary: generationJson?.dcfSummary,
      lboSummary: generationJson?.lboSummary,
      scorecardSummary: generationJson?.scorecardSummary,
      assumptions: generationJson?.assumptions,
      diagnostics: generationJson?.diagnostics,
      warnings: generationJson?.warnings,
      appliedDefaults: generationJson?.appliedDefaults,
    };

    updateRun(run.id, {
      status: 'generated',
      storageKey,
      dataUrl,
      fileSize: workbookBuffer.length,
      result: generatedResult as Record<string, unknown>,
    });
    console.log('[model-run] status transition', {
      runId: run.id,
      from: 'generating',
      to: 'generated',
      storageKey: storageKey || null,
    });

    return NextResponse.json({
      ok: true,
      status: 'generated',
      state: 'generated',
      runId: run.id,
      storageKey,
      downloadUrl: null,
      ...generatedResult,
    });
  } catch (error: any) {
    updateRun(run.id, {
      status: 'failed',
      errorMessage: error?.message || 'Generation failed',
    });
    console.log('[model-run] status transition', {
      runId: run.id,
      from: 'generating',
      to: 'failed',
      error: error?.message || 'Generation failed',
    });
    return errorResponse(500, 'run_generation_failed', error?.message || 'Failed to generate model run', 'unknown');
  }
    } catch (error: any) {
      console.error('[model-run] unhandled error', error);
      return errorResponse(500, 'run_unhandled_error', error?.message || 'Unexpected error', 'unknown');
    }
  });
}
