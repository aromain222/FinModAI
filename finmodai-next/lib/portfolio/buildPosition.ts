import type { RankedStock } from '@/lib/ranking/types';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import type { ActivePosition } from './types';

function stanceFromSignal(signal: RankedStock['signal']): string {
  if (signal === 'green') return 'Ready to build';
  if (signal === 'red')   return 'Repair before adding';
  return 'Work up before sizing';
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
  notionalUsd?: number | null,
  sharesInput?: number | null,
): ActivePosition {
  const brief = getCompanyBrief(stock.ticker);
  const now   = new Date();
  const id    = `${stock.ticker}-${now.getTime()}`;

  const topCatalyst  = stock.meta.catalysts?.[0];
  const nextCatalyst = topCatalyst
    ? `${topCatalyst.title} (${topCatalyst.direction})`
    : `Watch ${brief.watchItems[0] ?? 'upcoming catalyst'}`;
  const shares = typeof sharesInput === 'number' && Number.isFinite(sharesInput) && sharesInput > 0
    ? sharesInput
    : typeof notionalUsd === 'number' && Number.isFinite(notionalUsd) && notionalUsd > 0 && entryPrice > 0
      ? notionalUsd / entryPrice
      : null;
  const costBasis = shares !== null
    ? shares * entryPrice
    : typeof notionalUsd === 'number' && Number.isFinite(notionalUsd) && notionalUsd > 0
      ? notionalUsd
      : null;

  return {
    id,
    ticker:        stock.ticker,
    entryDate:     now.toISOString(),
    entryPrice,
    currentPrice:  entryPrice,
    shares,
    costBasis,
    notionalUsd:   costBasis,
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
        description: `Position opened at $${entryPrice.toFixed(2)}${shares !== null ? ` for ${shares.toFixed(4)} shares` : ''}${costBasis !== null ? ` ($${Math.round(costBasis).toLocaleString('en-US')} cost basis)` : ''}. ${stock.primaryReason}`,
        kind:        'entry',
      },
    ],
    addedAt: now.toISOString(),
  };
}
