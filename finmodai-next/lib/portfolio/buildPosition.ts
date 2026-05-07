import type { RankedStock } from '@/lib/ranking/types';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import type { ActivePosition } from './types';

function stanceFromSignal(signal: RankedStock['signal']): string {
  if (signal === 'green') return 'Build position';
  if (signal === 'red')   return 'Avoid';
  return 'Watch';
}

function computeStatus(score: number, daysSinceEntry: number): ActivePosition['status'] {
  if (daysSinceEntry < 3) return 'building';
  if (score < 4.0)        return 'broken';
  if (score >= 8.5)       return 'extended';
  return 'working';
}

export function buildPositionFromRankedStock(
  stock: RankedStock,
  entryPrice: number,
): ActivePosition {
  const brief = getCompanyBrief(stock.ticker);
  const now   = new Date();
  const id    = `${stock.ticker}-${now.getTime()}`;

  const topCatalyst  = stock.meta.catalysts?.[0];
  const nextCatalyst = topCatalyst
    ? `${topCatalyst.title} (${topCatalyst.direction})`
    : `Watch ${brief.watchItems[0] ?? 'upcoming catalyst'}`;

  return {
    id,
    ticker:        stock.ticker,
    entryDate:     now.toISOString(),
    entryPrice,
    currentPrice:  entryPrice,
    entryScore:    stock.score,
    currentScore:  stock.score,
    entrySignal:   stock.signal,
    currentSignal: stock.signal,
    status:        computeStatus(stock.score, 0),
    thesisDrift:   'stable',
    thesisSummary: stock.primaryReason,
    currentStance: stanceFromSignal(stock.signal),
    nextCatalyst,
    keyRisks:      stock.mainRisk,
    watchItems:    brief.watchItems.slice(0, 3),
    timeline: [
      {
        id:          `${id}-entry`,
        date:        now.toISOString(),
        description: `Position opened at $${entryPrice.toFixed(2)}. ${stock.primaryReason}`,
        kind:        'entry',
      },
    ],
    addedAt: now.toISOString(),
  };
}
