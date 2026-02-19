import { NextRequest, NextResponse } from 'next/server';
import { generateRunForModelType } from '@/lib/modelRuns/generateByType';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const modelType = String(body?.modelType || '').trim();

    if (!modelType) {
      return NextResponse.json(
        {
          ok: false,
          status: 'failed',
          state: 'failed',
          code: 'missing_model_type',
          stage: 'validate',
          message: 'modelType is required for /api/models/generate compatibility endpoint.',
        },
        { status: 400 }
      );
    }

    return generateRunForModelType({
      req,
      modelTypeRaw: modelType,
      body,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        state: 'failed',
        code: 'request_parse_failed',
        stage: 'validate',
        error: error?.message || 'Unexpected error',
      },
      { status: 500 }
    );
  }
}
