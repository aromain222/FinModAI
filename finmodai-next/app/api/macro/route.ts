import { NextResponse } from 'next/server';
import { getMacroSnapshot, getMacroEvents, getMacroSummary } from '@/lib/data/macroService';

export async function GET() {
  const traceId = crypto.randomUUID();
  try {
    const [snapshot, events] = await Promise.all([
      getMacroSnapshot({ traceId }),
      getMacroEvents({ traceId, limit: 10 }),
    ]);
    const summary = await getMacroSummary({
      traceId,
      snapshot: snapshot.data,
      sources: [{ name: 'FRED', url: 'https://fred.stlouisfed.org' }],
    });

    return NextResponse.json({
      ok: true,
      data: {
        snapshot: snapshot.data,
        events: events.data,
        summary: summary.data,
      },
      meta: { traceId, providerUsed: 'mixed', stale: snapshot.meta.stale || events.meta.stale },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'PROVIDER_ERROR', message: error?.message || 'Macro payload unavailable' }, meta: { traceId } },
      { status: 502 }
    );
  }
}
