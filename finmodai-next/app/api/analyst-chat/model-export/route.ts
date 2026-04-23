import { NextRequest, NextResponse } from 'next/server';
import {
  buildAnalystGeneratedModelExportSeed,
  buildAnalystGeneratedModelRecentRun,
  isAnalystGeneratedModelExportSeed,
  rebuildAnalystGeneratedModelPayloadFromSeed,
  type AnalystGeneratedModelPayload,
} from '@/lib/analyst/modelChat';
import { analystModelExportDeps } from '@/lib/analyst/analystModelExportDeps';
import { buildAnalystGeneratedFilename, buildAnalystGeneratedWorkbook } from '@/lib/analyst/modelExport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ExportRequest = {
  runId?: string;
  versionNumber?: number;
  openInGoogleSheets?: boolean;
  payload?: AnalystGeneratedModelPayload;
};

class ExportRouteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function requireAttachmentValidation(payload: AnalystGeneratedModelPayload): void {
  const needsAttachmentValidation =
    payload.provenanceSummary.sourceType === 'attachment_statement' &&
    (payload.modelType === 'DCF' || payload.modelType === 'THREE_STATEMENT' || payload.modelType === 'LBO');

  if (!needsAttachmentValidation) return;
  if (payload.unitValidationStatus === 'validated') return;

  throw new ExportRouteError(
    payload.unitValidationMessage ||
      'This attachment-driven model must be rerun because export validation is incomplete.',
    400,
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportRequest;
    const runId = String(body.runId ?? '').trim();
    let payload: AnalystGeneratedModelPayload;

    if (runId) {
      const persisted = await analystModelExportDeps.getPromptModelRunVersion({
        runId,
        versionNumber: typeof body.versionNumber === 'number' ? body.versionNumber : null,
        surface: 'analyst_chat',
      });
      if (!persisted) {
        throw new ExportRouteError('Saved Analyst Chat run was not found. Rerun the model before exporting.', 404);
      }

      if (!isAnalystGeneratedModelExportSeed(persisted.version.exportSeed)) {
        throw new ExportRouteError(
          'This saved Analyst Chat model does not have an exportable workbook seed. Rerun the model before exporting.',
          400,
        );
      }

      payload = rebuildAnalystGeneratedModelPayloadFromSeed(
        persisted.version.exportSeed,
        buildAnalystGeneratedModelRecentRun({
          runId: persisted.run.id,
          versionNumber: persisted.version.versionNumber,
          createdAt: persisted.version.createdAt,
          status: persisted.version.status,
        }),
      );
    } else if (body.payload) {
      const exportSeed = buildAnalystGeneratedModelExportSeed(body.payload);
      if (!isAnalystGeneratedModelExportSeed(exportSeed)) {
        throw new ExportRouteError(
          'This Analyst Chat model payload is not exportable. Regenerate the model before exporting.',
          400,
        );
      }
      payload = {
        ...body.payload,
        recentRun: body.payload.recentRun ?? null,
      };
    } else {
      throw new ExportRouteError('A saved Analyst Chat run or generated model payload is required for workbook export.', 400);
    }

    requireAttachmentValidation(payload);

    const workbook = await buildAnalystGeneratedWorkbook(payload);
    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const responseBody = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${buildAnalystGeneratedFilename(payload)}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof ExportRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export model workbook.' },
      { status: 500 },
    );
  }
}
