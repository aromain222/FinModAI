import { NextRequest, NextResponse } from 'next/server';
import { generateRunForModelType } from '@/lib/modelRuns/generateByType';

export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  try {
    const body = await req.json();
    return generateRunForModelType({
      req,
      modelTypeRaw: params.type,
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
