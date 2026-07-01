import { alpacaPaperCredentials, getAlpacaPaperAccount } from '@/lib/execution/alpacaPaper';
import type { TradingPersonality } from '@/lib/pm/tradingAgent/personality';
import type { TradeConsensus } from '@/lib/pm/tradingAgent/types';

const DEFAULT_PORTFOLIO_USD = 10_000;
/** Orders below this are noise — skip rather than submit. */
const MIN_ORDER_NOTIONAL = 25;

export type PortfolioEquity = {
  equity: number;
  source: 'alpaca_paper' | 'env_default';
};

export type PositionSize = {
  /** % of portfolio equity this trade allocates (0 when the sizer says skip). */
  allocationPct: number;
  /** Dollar notional to order; 0 means do not trade. */
  notional: number;
  reasoning: string;
};

/**
 * Portfolio equity the sizer allocates against: live Alpaca paper account
 * value when configured, otherwise TRADING_AGENT_PORTFOLIO_USD (default 10k).
 */
export async function getPortfolioEquity(): Promise<PortfolioEquity> {
  const fallback = Number(process.env.TRADING_AGENT_PORTFOLIO_USD);
  const envEquity = Number.isFinite(fallback) && fallback > 0 ? fallback : DEFAULT_PORTFOLIO_USD;

  if (alpacaPaperCredentials().configured) {
    try {
      const account = await getAlpacaPaperAccount();
      const value = Number(account.portfolio_value);
      if (Number.isFinite(value) && value > 0) {
        return { equity: value, source: 'alpaca_paper' };
      }
    } catch {
      // Account fetch failure falls back to the env-configured book size.
    }
  }
  return { equity: envEquity, source: 'env_default' };
}

/**
 * Conviction-weighted position sizing. The personality sets the risk budget;
 * consensus strength scales it; valuation tilts it; existing exposure caps it.
 *
 *   allocation = basePositionPct
 *              × (confidence / 100)             — conviction scaling
 *              × 1.2 unanimous / 0.85 majority  — agreement scaling
 *              × 1.25 undervalued / overvalued personality multiplier
 *   clamped to [0, maxPositionPct], minus what the book already holds.
 */
export function sizePosition(params: {
  equity: number;
  consensus: TradeConsensus;
  personality: TradingPersonality;
  valuationSignal?: 'undervalued' | 'fair' | 'overvalued' | null;
  /** Current dollar exposure to this name, when the book already holds it. */
  currentExposureUsd?: number | null;
}): PositionSize {
  const { equity, consensus, personality } = params;

  if (consensus.stance !== 'bullish' || equity <= 0) {
    return { allocationPct: 0, notional: 0, reasoning: 'No bullish consensus to size against.' };
  }

  const conviction = Math.max(0, Math.min(1, consensus.confidence / 100));
  const agreementMult = consensus.agreement === 'unanimous' ? 1.2
    : consensus.agreement === 'majority' ? 0.85
    : 0;
  const valuationMult = params.valuationSignal === 'undervalued' ? 1.25
    : params.valuationSignal === 'overvalued' ? personality.overvaluedSizingMult
    : 1;

  const rawPct = personality.basePositionPct * conviction * agreementMult * valuationMult;
  const targetPct = Math.min(personality.maxPositionPct, Math.round(rawPct * 100) / 100);

  const capUsd = (personality.maxPositionPct / 100) * equity;
  const currentExposure = Math.max(0, params.currentExposureUsd ?? 0);
  const headroomUsd = Math.max(0, capUsd - currentExposure);
  const targetUsd = (targetPct / 100) * equity;
  const notional = Math.round(Math.min(targetUsd, headroomUsd));

  const parts = [
    `${personality.name} sized ${targetPct.toFixed(2)}% of $${Math.round(equity).toLocaleString()} equity`,
    `(base ${personality.basePositionPct}% × conviction ${consensus.confidence}/100 × ${consensus.agreement} × valuation ${params.valuationSignal ?? 'unknown'})`,
  ];
  if (currentExposure > 0) {
    parts.push(`existing $${Math.round(currentExposure).toLocaleString()} exposure leaves $${Math.round(headroomUsd).toLocaleString()} headroom under the ${personality.maxPositionPct}% cap`);
  }

  if (notional < MIN_ORDER_NOTIONAL) {
    return {
      allocationPct: 0,
      notional: 0,
      reasoning: `${parts.join('; ')} — resulting order under $${MIN_ORDER_NOTIONAL}, skipping.`,
    };
  }

  return {
    allocationPct: Math.round((notional / equity) * 10_000) / 100,
    notional,
    reasoning: `${parts.join('; ')} → $${notional.toLocaleString()} order.`,
  };
}
