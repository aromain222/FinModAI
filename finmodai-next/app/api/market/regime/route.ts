import { NextResponse } from 'next/server';
import { getMarketIndices } from '@/lib/data/marketService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const traceId = crypto.randomUUID();
  try {
    const { items, meta } = await getMarketIndices({ symbols: ['SPY', 'QQQ', 'DIA'], range: '1M', traceId });
    const changes = items.map((series) => {
      const first = series.points[0]?.v ?? 0;
      const last = series.points[series.points.length - 1]?.v ?? 0;
      return first ? ((last - first) / first) * 100 : 0;
    });
    const avgChange = changes.reduce((a, b) => a + b, 0) / Math.max(changes.length, 1);
    const risk = avgChange > 1 ? 'risk-on' : avgChange < -1 ? 'risk-off' : 'neutral';
    const summary =
      risk === 'risk-on'
        ? 'Risk appetite improving across major indices.'
        : risk === 'risk-off'
        ? 'Risk appetite deteriorating across major indices.'
        : 'Markets are consolidating with mixed signals.';

    return NextResponse.json({
      ok: true,
      data: {
        risk,
        volState: avgChange > 0 ? 'muted' : 'expanding',
        liquidity: avgChange < -1 ? 'tight' : 'normal',
        summary,
        evidence: [
          `Avg change ${avgChange.toFixed(2)}%`,
          `SPY/QQQ/DIA window 1M`,
        ],
      },
      meta,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'PROVIDER_ERROR', message: error?.message || 'Failed to compute regime' }, meta: { traceId } },
      { status: 502 }
    );
  }
}
