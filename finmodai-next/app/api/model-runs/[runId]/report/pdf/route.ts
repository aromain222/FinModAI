import { NextRequest, NextResponse } from 'next/server';
import { buildPdfExecutiveSummary } from '@/lib/reports/pdfSummary';
import { getModelRunReportContext } from '@/lib/reports/modelRunReport';
import { createReportPdf } from '@/lib/reportPdf';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { runId: string } }) {
  try {
    const runId = String(params.runId || '').trim();
    if (!runId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_run_id',
          message: 'runId is required',
        },
        { status: 400 }
      );
    }

    const context = await getModelRunReportContext(runId);
    if (!context.ok) {
      const status = context.error === 'run_not_found' ? 404 : context.error === 'run_not_ready' ? 409 : 500;
      console.error('[report/pdf] context lookup failed', {
        runId,
        error: context.error,
        details: context.details ?? {},
      });
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
    const content = [
      `${context.data.companyName} (${context.data.ticker})`,
      `Model: ${context.data.modelType}`,
      `As of: ${context.data.asOfDate}`,
      '',
      ...summary.paragraphs,
    ]
      .filter(Boolean)
      .join('\n');

    const pdf = await createReportPdf(content);
    const companySafe = context.data.companyName
      ? context.data.companyName.replace(/[^A-Za-z0-9_-]/g, '_')
      : context.data.ticker;
    const filename = `CapitalBase_Report_${companySafe}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[report/pdf] generation failed', { message, error });
    return NextResponse.json(
      {
        ok: false,
        error: 'report_pdf_generation_failed',
        message,
      },
      { status: 500 }
    );
  }
}
