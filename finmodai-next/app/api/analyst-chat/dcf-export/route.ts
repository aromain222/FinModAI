import { NextRequest, NextResponse } from 'next/server';
import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import { buildAnalystDcfDemoWorkbook, buildAnalystDcfFilename } from '@/lib/analyst/dcfExport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isAnalystDcfPayload(value: unknown): value is AnalystDcfDemoPayload {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const baseMetrics = row.baseMetrics as Record<string, unknown> | undefined;
  const assumptions = row.assumptions as Record<string, unknown> | undefined;
  return (
    typeof row.prompt === 'string' &&
    typeof row.ticker === 'string' &&
    typeof row.companyName === 'string' &&
    typeof row.years === 'number' &&
    typeof row.source === 'string' &&
    typeof row.baseMetrics === 'object' &&
    typeof row.assumptions === 'object' &&
    Array.isArray(row.forecast) &&
    typeof row.scenarios === 'object' &&
    typeof baseMetrics?.revenueLtm === 'number' &&
    Number.isFinite(baseMetrics.revenueLtm) &&
    baseMetrics.revenueLtm > 0 &&
    Array.isArray(assumptions?.revenueGrowth) &&
    Array.isArray(assumptions?.ebitMargin)
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = body?.payload;

    if (!isAnalystDcfPayload(payload)) {
      return NextResponse.json({ error: 'Valid DCF demo payload is required.' }, { status: 400 });
    }

    const workbook = await buildAnalystDcfDemoWorkbook(payload);
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
        'Content-Disposition': `attachment; filename="${buildAnalystDcfFilename(payload)}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export DCF workbook.' },
      { status: 500 }
    );
  }
}
