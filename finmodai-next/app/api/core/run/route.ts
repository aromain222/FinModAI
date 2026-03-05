import { NextRequest, NextResponse } from 'next/server';
import { runModel } from '@/src/core/engine/runModel';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const templateId = String(body?.templateId || '').trim();
    const dataSourceId = String(body?.dataSourceId || '').trim() as 'ticker' | 'manual';
    const params = body?.params || {};

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

    const result = await runModel({
      templateId,
      dataSourceId,
      params,
      scenario: body?.scenario,
      options: {
        asOfDate: body?.options?.asOfDate,
        scenarioId: body?.options?.scenarioId,
      },
    } as any);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: 'core_engine_validation_failed',
          message: result.issues.find((entry) => entry.severity === 'error')?.message || 'Validation failed.',
          issues: result.issues,
          warnings: result.warnings,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      outputs: result.outputs,
      warnings: result.warnings,
      issues: result.issues,
    });
  } catch (error: any) {
    console.error('[api/core/run] failed', {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        ok: false,
        code: 'core_engine_unhandled_error',
        message: error?.message || 'Unexpected error while running model.',
      },
      { status: 500 }
    );
  }
}
