import { calculatePnL, closedPnL } from '@/lib/trading/pnl';
import type { Position } from '@/lib/trading/positions';

export type PortfolioMetrics = {
  totalExposure: number;
  netExposure: number;
  longExposure: number;
  shortExposure: number;
  openPositions: number;
  totalPnL: number;
};

export type PortfolioWarning = {
  type: 'total_exposure' | 'single_position';
  message: string;
};

export type RiskTag = 'High concentration' | 'High volatility' | 'Low confidence';

const ACTIVE_STATUSES: Array<Position['status']> = ['PENDING', 'OPEN'];

function isActive(position: Position): boolean {
  return ACTIVE_STATUSES.includes(position.status);
}

export function computePortfolioMetrics(
  positions: Position[],
  currentPrices: Record<string, number> = {},
): PortfolioMetrics {
  const active = positions.filter(isActive);
  const longExposure = active
    .filter((position) => position.direction === 'LONG')
    .reduce((sum, position) => sum + position.sizePct, 0);
  const shortExposure = active
    .filter((position) => position.direction === 'SHORT')
    .reduce((sum, position) => sum + position.sizePct, 0);
  const openPositions = positions.filter((position) => position.status === 'OPEN').length;

  const openPnL = positions.reduce((sum, position) => {
    if (position.status !== 'OPEN') return sum;
    const currentPrice = currentPrices[position.ticker.toUpperCase()];
    if (currentPrice == null) return sum;
    return sum + calculatePnL(position, currentPrice).unrealizedPnL;
  }, 0);

  const closedPnLSum = positions.reduce((sum, position) => {
    const pnl = closedPnL(position);
    return sum + (pnl?.unrealizedPnL ?? 0);
  }, 0);

  return {
    totalExposure: longExposure + shortExposure,
    netExposure: longExposure - shortExposure,
    longExposure,
    shortExposure,
    openPositions,
    totalPnL: openPnL + closedPnLSum,
  };
}

export function getPortfolioWarnings(
  positions: Position[],
  candidate?: Pick<Position, 'sizePct'>,
): PortfolioWarning[] {
  const activeExposure = positions
    .filter(isActive)
    .reduce((sum, position) => sum + position.sizePct, 0);
  const projectedExposure = activeExposure + (candidate?.sizePct ?? 0);
  const warnings: PortfolioWarning[] = [];

  if (projectedExposure > 100) {
    warnings.push({
      type: 'total_exposure',
      message: `Projected total exposure is ${projectedExposure.toFixed(1)}%, above the 100% portfolio limit.`,
    });
  }

  if (candidate && candidate.sizePct > 10) {
    warnings.push({
      type: 'single_position',
      message: `Suggested position is ${candidate.sizePct.toFixed(1)}%, above the 10% single-position limit.`,
    });
  }

  return warnings;
}

export function getPositionRiskTags(position: Position, positions: Position[]): RiskTag[] {
  const tags: RiskTag[] = [];
  const activeExposure = positions
    .filter(isActive)
    .reduce((sum, candidate) => sum + candidate.sizePct, 0);
  const concentration = activeExposure > 0 ? position.sizePct / activeExposure : 0;

  if (position.sizePct >= 10 || concentration >= 0.35) tags.push('High concentration');
  if (position.confidence < 0.45) tags.push('Low confidence');
  if (position.stopLoss != null) {
    const stopMove = Math.abs(position.entryPrice - position.stopLoss) / position.entryPrice;
    if (stopMove > 0.18) tags.push('High volatility');
  }

  return tags;
}
