import { NextRequest, NextResponse } from 'next/server';
import type { ModelOutputs } from '@/src/core/contracts/modelOutputs';
import { buildPdfFromModelOutputs } from '@/src/core/export/pdf';
import type { ScenarioComparison } from '@/src/core/engine/compare';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const templateId = String(body?.templateId || '').trim();
    const companyName = String(body?.companyName || 'Company').trim() || 'Company';
    const modelOutputs = body?.modelOutputs as ModelOutputs | undefined;
    const scenarioComparison = body?.scenarioComparison as ScenarioComparison | undefined;
    const sensitivity = body?.sensitivity as
      | {
          rows?: number[];
          cols?: number[];
          values?: Array<Array<number | null>>;
          base?: {
            wacc?: number;
            terminalGrowth?: number;
            pricePerShare?: number | null;
          };
        }
      | undefined;

    if (!templateId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'template_id_required',
          message: 'templateId is required.',
        },
        { status: 400 }
      );
    }

    if (!modelOutputs || typeof modelOutputs !== 'object' || !modelOutputs.summary) {
      return NextResponse.json(
        {
          ok: false,
          error: 'model_outputs_required',
          message: 'modelOutputs is required for PDF export.',
        },
        { status: 400 }
      );
    }

    const pdfBytes = await buildPdfFromModelOutputs({
      templateId,
      modelOutputs,
      companyName,
      scenarioComparison,
      sensitivity,
    });

    const safeName = companyName.replace(/[^A-Za-z0-9_-]/g, '_');
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="CapitalBase_Report_${safeName}.pdf"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error: any) {
    console.error('[api/export/pdf] failed', {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'pdf_export_failed',
        message: error?.message || 'Failed to export PDF.',
      },
      { status: 500 }
    );
  }
}
