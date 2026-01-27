import { NextResponse } from 'next/server';
import { getMarketPulse } from '@/lib/data/marketService';
import { MarketPulseSchema } from '@/lib/schemas/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const traceId = crypto.randomUUID();
  try {
    const { pulse, meta } = await getMarketPulse({ traceId });
    const data = MarketPulseSchema.parse(pulse);
    return NextResponse.json({ ok: true, data, meta });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'PROVIDER_ERROR', message: error?.message || 'Failed to fetch pulse' }, meta: { traceId } },
      { status: 502 }
    );
  }
}
