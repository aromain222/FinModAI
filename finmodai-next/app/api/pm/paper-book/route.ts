import { NextResponse } from 'next/server';
import {
  computePaperPnL,
  derivePaperPositions,
  listPaperOrders,
} from '@/lib/pm/paper/paperBook';
import { listPositions } from '@/lib/pm/portfolio/positionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET() {
  const [orders, positions] = await Promise.all([
    listPaperOrders({ limit: 500 }),
    listPositions({ limit: 500 }),
  ]);

  const priceByTicker = new Map<string, number>();
  for (const p of positions) {
    if (p.currentPrice != null && p.currentPrice > 0) {
      priceByTicker.set(p.ticker.toUpperCase(), p.currentPrice);
    }
  }

  const paperPositions = derivePaperPositions(orders).map(pos => {
    const price = priceByTicker.get(pos.ticker) ?? null;
    const marketValue = price != null ? pos.shares * price : null;
    const unrealizedUSD = marketValue != null ? marketValue - pos.costBasis : null;
    return { ...pos, currentPrice: price, marketValue, unrealizedUSD };
  });

  const pnl = computePaperPnL(orders, priceByTicker);
  const recentOrders = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 25);

  return NextResponse.json({
    pnl,
    paperPositions,
    recentOrders,
  });
}
