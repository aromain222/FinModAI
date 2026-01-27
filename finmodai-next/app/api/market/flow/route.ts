import { NextResponse } from 'next/server';
import { getFlowMetrics } from '@/lib/market/databento';
import { resolveMarketSymbol } from '@/lib/marketSymbols';

export async function GET(req: Request) {
  const traceId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols') || '';
    const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean);
    const resolved = symbols.length ? symbols.map(resolveMarketSymbol) : ['SPY', 'QQQ', 'DIA'];

    const flow = await getFlowMetrics(resolved);
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
