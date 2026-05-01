import type { Position } from '@/lib/trading/positions';

export type PnLResult = {
  unrealizedPnL: number;
  percentReturn: number;
  isProfit: boolean;
  hitTarget: boolean;
  hitStop: boolean;
};

export function calculatePnL(position: Position, currentPrice: number): PnLResult {
  const { entryPrice, direction, targetPrice, stopLoss } = position;

  const rawReturn =
    direction === 'LONG'
      ? (currentPrice - entryPrice) / entryPrice
      : (entryPrice - currentPrice) / entryPrice;

  const percentReturn = rawReturn * 100;
  const unrealizedPnL =
    direction === 'LONG'
      ? currentPrice - entryPrice
      : entryPrice - currentPrice;

  const hitTarget =
    targetPrice != null &&
    (direction === 'LONG' ? currentPrice >= targetPrice : currentPrice <= targetPrice);

  const hitStop =
    stopLoss != null &&
    (direction === 'LONG' ? currentPrice <= stopLoss : currentPrice >= stopLoss);

  return { unrealizedPnL, percentReturn, isProfit: rawReturn > 0, hitTarget, hitStop };
}

export function formatPnL(pnl: PnLResult): string {
  const sign = pnl.percentReturn >= 0 ? '+' : '';
  return `${sign}${pnl.percentReturn.toFixed(2)}%`;
}

export function closedPnL(position: Position): PnLResult | null {
  if (position.status !== 'closed' || position.exitPrice == null) return null;
  return calculatePnL(position, position.exitPrice);
}

export function positionSummary(positions: Position[]): {
  totalOpen: number;
  totalClosed: number;
  winRate: number | null;
  avgReturn: number | null;
} {
  const open = positions.filter((p) => p.status === 'open');
  const closed = positions.filter((p) => p.status === 'closed' && p.exitPrice != null);
  const closedPnls = closed
    .map((p) => closedPnL(p))
    .filter((r): r is PnLResult => r !== null);

  const wins = closedPnls.filter((r) => r.isProfit).length;
  const winRate = closed.length > 0 ? wins / closed.length : null;
  const avgReturn =
    closedPnls.length > 0
      ? closedPnls.reduce((sum, r) => sum + r.percentReturn, 0) / closedPnls.length
      : null;

  return { totalOpen: open.length, totalClosed: closed.length, winRate, avgReturn };
}
