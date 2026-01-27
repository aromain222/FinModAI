import { NextResponse } from 'next/server';
import { getFlowMetrics } from '@/lib/market/databento';
import { resolveMarketSymbol } from '@/lib/marketSymbols';

const INDEX_PROXIES = ['ES', 'NQ', 'YM', 'SPY', 'QQQ', 'DIA'];

export async function GET() {
  const traceId = crypto.randomUUID();
  try {
    const symbols = INDEX_PROXIES.map(resolveMarketSymbol);
    const flow = await getFlowMetrics(symbols);

    return NextResponse.json({
      ok: true,
      data: flow,
      meta: { asOf: new Date().toISOString(), providerUsed: flow[0]?.meta?.sourceUsed ?? 'unknown', stale: false, traceId },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'NOT_SUPPORTED', message: 'Flow data unavailable' }, meta: { traceId } },
      { status: 503 }
    );
  }
}
