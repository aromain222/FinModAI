import type { ActivePosition } from '@/lib/portfolio/types';

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export type PositionEconomics = {
  shares: number | null;
  totalCostBasis: number | null;
  marketValue: number | null;
  pnlUsd: number | null;
  pnlPct: number;
};

export function positionShares(position: ActivePosition): number | null {
  const shares = positive(position.shares);
  if (shares !== null) return shares;
  const notional = positive(position.notionalUsd);
  const entryPrice = positive(position.entryPrice);
  return notional !== null && entryPrice !== null ? notional / entryPrice : null;
}

export function positionTotalCostBasis(position: ActivePosition): number | null {
  const shares = positionShares(position);
  const entryPrice = positive(position.entryPrice);
  const expectedBasis = shares !== null && entryPrice !== null ? shares * entryPrice : null;
  const storedBasis = positive(position.costBasis);
  const notional = positive(position.notionalUsd);

  if (expectedBasis !== null) {
    // Older records stored average entry price in costBasis. Shares x entry price
    // is the authoritative total basis for a share-based position.
    if (storedBasis === null || Math.abs(storedBasis - expectedBasis) / expectedBasis > 0.01) {
      return expectedBasis;
    }
    return storedBasis;
  }

  return notional ?? storedBasis;
}

export function positionEconomics(position: ActivePosition, livePrice: number): PositionEconomics {
  const shares = positionShares(position);
  const totalCostBasis = positionTotalCostBasis(position);
  const validLivePrice = positive(livePrice);
  const marketValue = shares !== null && validLivePrice !== null ? shares * validLivePrice : null;
  const pnlUsd = marketValue !== null && totalCostBasis !== null ? marketValue - totalCostBasis : null;
  const entryPrice = positive(position.entryPrice);
  const pnlPct = totalCostBasis !== null && pnlUsd !== null
    ? (pnlUsd / totalCostBasis) * 100
    : entryPrice !== null && validLivePrice !== null
      ? ((validLivePrice - entryPrice) / entryPrice) * 100
      : 0;

  return { shares, totalCostBasis, marketValue, pnlUsd, pnlPct };
}

export function normalizePositionEconomics(position: ActivePosition): ActivePosition {
  const shares = positionShares(position);
  const totalCostBasis = positionTotalCostBasis(position);
  return {
    ...position,
    shares,
    costBasis: totalCostBasis,
    notionalUsd: totalCostBasis,
  };
}
