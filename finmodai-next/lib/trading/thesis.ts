import type { Position } from '@/lib/trading/positions';

export type ThesisStatus = 'Holding' | 'Strengthening' | 'Breaking';

export type ThesisData = {
  currentPrice?: number | null;
};

export function evaluateThesis(position: Position, currentData: ThesisData): ThesisStatus {
  const currentPrice = currentData.currentPrice;
  if (currentPrice == null || !Number.isFinite(currentPrice)) return 'Holding';
  if (position.status === 'CLOSED') return 'Holding';

  if (position.status === 'PENDING') {
    const distanceToEntry =
      position.direction === 'LONG'
        ? (currentPrice - position.entryPrice) / position.entryPrice
        : (position.entryPrice - currentPrice) / position.entryPrice;
    if (distanceToEntry > 0.08) return 'Breaking';
    return 'Holding';
  }

  const moveFromEntry =
    position.direction === 'LONG'
      ? (currentPrice - position.entryPrice) / position.entryPrice
      : (position.entryPrice - currentPrice) / position.entryPrice;

  if (position.stopLoss != null) {
    const stopDistance =
      position.direction === 'LONG'
        ? (currentPrice - position.stopLoss) / position.entryPrice
        : (position.stopLoss - currentPrice) / position.entryPrice;
    if (stopDistance <= 0.02) return 'Breaking';
  }

  if (position.targetPrice != null) {
    const targetDistance =
      position.direction === 'LONG'
        ? (position.targetPrice - position.entryPrice) / position.entryPrice
        : (position.entryPrice - position.targetPrice) / position.entryPrice;
    if (targetDistance > 0 && moveFromEntry >= targetDistance * 0.5) return 'Strengthening';
  }

  if (moveFromEntry <= -0.05) return 'Breaking';
  if (moveFromEntry >= 0.05) return 'Strengthening';
  return 'Holding';
}
