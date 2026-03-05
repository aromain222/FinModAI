import { NextRequest, NextResponse } from 'next/server';
import { runSensitivity } from '@/src/core/engine/sensitivity';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const templateId = String(body?.templateId || '').trim();
    const dataSourceId = String(body?.dataSourceId || '').trim() as 'ticker' | 'manual';

    if (!templateId || !dataSourceId) {
      return NextResponse.json(
        {
          ok: false,
          code: 'template_or_datasource_missing',
          message: 'templateId and dataSourceId are required.',
        },
        { status: 400 }
      );
    }

    const result = await runSensitivity({
      templateId,
      dataSourceId,
      baseParams: body?.baseParams || {},
      variableA: body?.variableA,
      rangeA: body?.rangeA,
      variableB: body?.variableB,
      rangeB: body?.rangeB,
      scenario: body?.scenario,
      maxIterations: body?.maxIterations,
      metric: body?.metric,
    } as any);

    const status = result.ok ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (error: any) {
    console.error('[api/core/sensitivity] failed', {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        ok: false,
        code: 'core_sensitivity_unhandled_error',
        message: error?.message || 'Unexpected error while running sensitivity.',
      },
      { status: 500 }
    );
  }
}
