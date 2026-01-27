import { NextResponse } from 'next/server';
import { getMacroSnapshot } from '@/lib/data/macroService';
import { MacroSnapshotSchema } from '@/lib/schemas/macro';

export const runtime = 'nodejs';

export async function GET() {
  const traceId = crypto.randomUUID();
  try {
    const { data, meta } = await getMacroSnapshot({ traceId });
    const parsed = MacroSnapshotSchema.parse(data);
    return NextResponse.json({ ok: true, data: parsed, meta });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'PROVIDER_ERROR', message: error?.message || 'Macro overview unavailable' }, meta: { traceId } },
      { status: 502 }
    );
  }
}
