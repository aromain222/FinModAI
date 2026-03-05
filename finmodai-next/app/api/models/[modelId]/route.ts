import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getModel } from '@/lib/models/core/registry';
import { applyWorkbookTheme, parseWorkbookAccent } from '@/lib/models/core/workbookTheme';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'CapitalBase_Model.xlsx';
}

function normalizeCompanyName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 160);
}

function attachCompanyName<T>(input: T, companyName: string | null): T {
  if (!companyName || typeof input !== 'object' || input === null || Array.isArray(input)) {
    return input;
  }
  return { ...(input as Record<string, unknown>), companyName } as T;
}

function buildDownloadFilename(params: {
  modelFilename: string;
  modelId: string;
  companyName: string | null;
}): string {
  if (!params.companyName) {
    return sanitizeFilename(params.modelFilename);
  }
  const label = params.companyName.replace(/\s+/g, '_');
  return sanitizeFilename(`CapitalBase_${label}_${params.modelId}.xlsx`);
}

function flattenZodErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    if (!fieldErrors[path]) {
      fieldErrors[path] = issue.message;
    }
  }

  return fieldErrors;
}

type RouteContext = {
  params: {
    modelId: string;
  };
};

export async function POST(req: NextRequest, { params }: RouteContext) {
  let slug = 'unknown';
  try {
    slug = params.modelId;
    const model = getModel(slug);

    if (!model) {
      return NextResponse.json({ ok: false, error: `Unknown model slug: ${slug}` }, { status: 404 });
    }

    const body = await req.json();
    const companyName = normalizeCompanyName(body?.companyName);
    const validated = model.inputSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Input validation failed',
          fieldErrors: flattenZodErrors(validated.error),
        },
        { status: 400 },
      );
    }

    const modelInput = attachCompanyName(validated.data, companyName);
    const output = model.compute(modelInput);
    const workbook = await model.buildWorkbook(modelInput, output);
    const workbookAccent = parseWorkbookAccent(body);
    applyWorkbookTheme(workbook, workbookAccent);
    const workbookBuffer = await workbook.xlsx.writeBuffer();

    const filename = buildDownloadFilename({
      modelFilename: model.filename(modelInput),
      modelId: slug,
      companyName,
    });

    return new NextResponse(workbookBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[api/models/[modelId]] workbook generation failed', {
      modelId: slug,
      error,
      message: error instanceof Error ? error.message : String(error),
    });
    const message = error instanceof Error ? error.message : 'Failed to generate model workbook';
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
