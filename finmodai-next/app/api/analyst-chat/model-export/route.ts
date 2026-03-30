import { NextRequest, NextResponse } from 'next/server';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';
import { buildAnalystGeneratedFilename, buildAnalystGeneratedWorkbook } from '@/lib/analyst/modelExport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ExportRequest = {
  payload?: AnalystGeneratedModelPayload;
};

function isAnalystGeneratedModelPayload(value: unknown): value is AnalystGeneratedModelPayload {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    (
      row.modelType === 'DCF' ||
      row.modelType === 'THREE_STATEMENT' ||
      row.modelType === 'CAP_TABLE' ||
      row.modelType === 'SAAS_OPERATING_MODEL' ||
      row.modelType === 'COMPS' ||
      row.modelType === 'PRECEDENTS' ||
      row.modelType === 'LBO' ||
      row.modelType === 'FOOTBALL_FIELD' ||
      row.modelType === 'MERGER' ||
      row.modelType === 'DEBT_CAPACITY_LITE'
    ) &&
    typeof row.prompt === 'string' &&
    typeof row.title === 'string' &&
    Array.isArray(row.tabs) &&
    Array.isArray(row.keyOutputs) &&
    row.extractedInputs !== null &&
    typeof row.extractedInputs === 'object' &&
    row.defaultsUsed !== null &&
    typeof row.defaultsUsed === 'object' &&
    row.provenanceSummary !== null &&
    typeof row.provenanceSummary === 'object' &&
    Array.isArray(row.narrativeBlocks)
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportRequest;
    if (!isAnalystGeneratedModelPayload(body.payload)) {
      return NextResponse.json({ error: 'Valid model export payload is required.' }, { status: 400 });
    }

    const workbook = await buildAnalystGeneratedWorkbook(body.payload);
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
        'Content-Disposition': `attachment; filename="${buildAnalystGeneratedFilename(body.payload)}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export model workbook.' },
      { status: 500 }
    );
  }
}
