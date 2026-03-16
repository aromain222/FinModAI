import { NextRequest, NextResponse } from 'next/server';
import { buildPdfExecutiveSummary } from '@/lib/reports/pdfSummary';
import { buildModelRunStructuredPayload } from '@/lib/reports/modelRunNarrative';
import { getModelRunReportContext } from '@/lib/reports/modelRunReport';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { runId: string } }) {
  try {
    const runId = String(params.runId || '').trim();
    if (!runId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_run_id',
          details: { message: 'runId is required' },
        },
        { status: 400 }
      );
    }

    const context = await getModelRunReportContext(runId);
    if (!context.ok) {
      const status = context.error === 'run_not_found' ? 404 : context.error === 'run_not_ready' ? 409 : 500;
      return NextResponse.json(
        {
          ok: false,
          error: context.error,
          details: context.details ?? {},
        },
        { status }
      );
    }

    const summary = await buildPdfExecutiveSummary(context.data);
    const payload = buildModelRunStructuredPayload(context.data);
    payload.summaryText = summary.paragraphs.join(' ');
    payload.generatedAt = context.data.generatedAt;
    return NextResponse.json({
      ok: true,
      data: {
        ...context.data,
        executiveSummary: {
          paragraphs: summary.paragraphs,
          source: summary.source,
        },
        reportPayload: payload,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json(
      {
        ok: false,
        error: 'report_generation_failed',
        details: { message },
      },
      { status: 500 }
    );
  }
}
