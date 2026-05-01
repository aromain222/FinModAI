import type { Position } from '@/lib/trading/positions';

export type ThesisStatus = 'Holding' | 'Strengthening' | 'Breaking';

export type ThesisData = {
  currentPrice?: number | null;
  ratesDeltaBps?: number | null;
  currentGrowth?: number | null;
  forecastGrowth?: number | null;
};

export function evaluateThesis(position: Position, currentData: ThesisData): string {
  if (position.status === 'CLOSED') return 'Holding';

  if (currentData.ratesDeltaBps != null && Math.abs(currentData.ratesDeltaBps) >= 50) {
    const rateText = `rates ${currentData.ratesDeltaBps > 0 ? 'rising' : 'declining'} ${Math.abs(currentData.ratesDeltaBps).toFixed(0)}bps`;
    if (position.direction === 'LONG' && currentData.ratesDeltaBps > 0) return `Breaking (${rateText} vs model)`;
    if (position.direction === 'LONG' && currentData.ratesDeltaBps < 0) return `Strengthening (${rateText} as expected)`;
    if (position.direction === 'SHORT' && currentData.ratesDeltaBps > 0) return `Strengthening (${rateText} as expected)`;
  }

  if (
    currentData.currentGrowth != null &&
    currentData.forecastGrowth != null &&
    Number.isFinite(currentData.currentGrowth) &&
    Number.isFinite(currentData.forecastGrowth)
  ) {
    const gap = currentData.currentGrowth - currentData.forecastGrowth;
    if (gap <= -0.03) return 'Breaking (growth below forecast)';
    if (gap >= 0.03) return 'Strengthening (growth above forecast)';
  }

  const currentPrice = currentData.currentPrice;
  if (currentPrice == null || !Number.isFinite(currentPrice)) return 'Holding';

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

  if (moveFromEntry <= -0.05) return 'Breaking (price action against thesis)';
  if (moveFromEntry >= 0.05) return 'Strengthening (price action confirms thesis)';
  return 'Holding';
}

export function buildTradeUpdate(position: Position, currentData: ThesisData): string {
  const thesis = evaluateThesis(position, currentData);
  if (currentData.ratesDeltaBps != null && Math.abs(currentData.ratesDeltaBps) >= 50) {
    return `Trade Update: Rates have moved ${currentData.ratesDeltaBps > 0 ? '+' : ''}${currentData.ratesDeltaBps.toFixed(0)}bps vs model, ${thesis.startsWith('Breaking') ? 'weakening' : thesis.startsWith('Strengthening') ? 'supporting' : 'not changing'} thesis.`;
  }
  if (
    currentData.currentGrowth != null &&
    currentData.forecastGrowth != null &&
    Number.isFinite(currentData.currentGrowth) &&
    Number.isFinite(currentData.forecastGrowth)
  ) {
    const gap = currentData.currentGrowth - currentData.forecastGrowth;
    return `Trade Update: Growth is ${(gap * 100).toFixed(1)} pts vs original forecast, ${gap < 0 ? 'weakening' : gap > 0 ? 'supporting' : 'leaving'} thesis.`;
  }
  if (thesis.startsWith('Breaking')) return `Trade Update: Price action is moving against the entry thesis; review before adding risk.`;
  if (thesis.startsWith('Strengthening')) return `Trade Update: Price action is confirming the thesis; position remains on track.`;
  return `Trade Update: Thesis is holding; no automatic action recommended.`;
}
