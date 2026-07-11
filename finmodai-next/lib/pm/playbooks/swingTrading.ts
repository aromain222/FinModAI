/**
 * Codified swing-trading playbooks distilled from the canonical frameworks:
 * Minervini (trend template, VCP), O'Neil/CAN SLIM, Elder (Triple Screen),
 * Weinstein (stage analysis), and standard R-multiple risk discipline.
 *
 * These are prompt blocks, not scoring code: each desk/agent receives only the
 * checklist relevant to its mandate and must grade items from supplied evidence,
 * marking anything it cannot verify as UNKNOWN rather than assuming it passes.
 * Phase 2 (book RAG) can append retrieved passages alongside these blocks.
 */

import type { QuantAnalystKey } from '@/lib/pm/monitoring/types';

const EVIDENCE_RULE =
  'Grade each checklist item ONLY from the evidence supplied in this prompt; mark items you cannot verify as UNKNOWN — an UNKNOWN item never counts in favor of the trade.';

export const SETUP_TAXONOMY =
  'Recognized swing setups: stage-2 breakout from a sound base (Weinstein/O\'Neil), volatility-contraction pattern pivot (Minervini VCP), pullback-to-rising-MA continuation, high-tight flag, mean-reversion off oversold in an uptrend (Elder). If the idea matches none of these, say "no defined setup" — that is itself a finding.';

const TECHNICAL_PLAYBOOK = `SWING PLAYBOOK — TREND & SETUP (Minervini trend template, Weinstein stages, Elder Triple Screen):
- Stage check: is price in a Weinstein stage-2 uptrend (above a rising long-term MA) rather than stage-1 base, stage-3 top, or stage-4 decline?
- Trend template: price above shorter- and longer-term MAs with the long MA rising; within striking distance of the 52-week high, well off the 52-week low; relative strength vs the market positive.
- Entry quality: momentum confirming (higher timeframe trend up, shorter timeframe not overextended — Elder's screens); note if price is extended far above its MA (chase risk).
- Volume: accumulation on up moves, contraction on pullbacks (VCP behavior); distribution days are a red flag.
${EVIDENCE_RULE}`;

const EARNINGS_CATALYST_PLAYBOOK = `SWING PLAYBOOK — EARNINGS & CATALYST (CAN SLIM C/A/N):
- Current earnings: material EPS/revenue acceleration in the latest quarter, not just meeting estimates.
- Annual trend: multi-year growth with improving margins; deceleration is a sell-side point.
- New factor: a dated, mechanistic catalyst (product, guidance change, estimate revisions) inside the trade horizon — "story" without a date is not a catalyst.
- Timing: earnings dates inside the horizon are binary risk; flag them explicitly.
${EVIDENCE_RULE}`;

const FUNDAMENTAL_QUALITY_PLAYBOOK = `SWING PLAYBOOK — FUNDAMENTAL QUALITY (CAN SLIM + balance-sheet discipline):
- Earnings quality: cash conversion supporting reported earnings; margin trajectory.
- Leverage: unmeasurable or elevated leverage caps conviction — a swing trade cannot wait out a balance-sheet problem.
- Supply/demand of shares: float, dilution, buybacks (O'Neil's S).
${EVIDENCE_RULE}`;

const POSITIONING_PLAYBOOK = `SWING PLAYBOOK — POSITIONING & CROWDING (O'Neil M/I, sentiment discipline):
- Market direction first: most swing setups fail in a downtrending or risk-off tape regardless of stock quality.
- Institutional sponsorship: increasing fund ownership supports continuation; crowded consensus longs raise unwind risk.
- Short interest: high short interest is fuel in an uptrend but confirmation of trouble in a downtrend — direction of the trend decides which.
${EVIDENCE_RULE}`;

const RED_TEAM_PLAYBOOK = `SWING PLAYBOOK — FAILURE PATTERNS (red-team checklist):
- Late-stage base or climax run after an extended advance (Weinstein stage-3 signature).
- Extended far above rising MAs — favorable thesis, poor entry.
- Breakout on weak volume, or distribution days clustering in the market averages.
- Binary event (earnings, ruling) inside the horizon without the evidence to price it.
- No definable stop: if invalidation cannot be placed at a logical level, the trade is unsizeable.
${EVIDENCE_RULE}`;

export const RISK_PLAYBOOK = `SWING RISK DISCIPLINE (R-multiple framework, O'Neil loss rule):
- Every actionable call must define the stop BEFORE the entry: a logical invalidation level, not a percentage picked afterward.
- Reward-to-risk at least 2R to the realistic target; below that the setup is a pass regardless of conviction.
- Hard loss discipline: cut at the stop without exception (O'Neil's 7-8% rule as outer bound); never average down a losing swing position.
- Position size follows stop distance — a wide stop means a small position, never a bigger risk.
- Time stop: a swing trade that goes nowhere inside its stated horizon is a capital-efficiency failure; recommend exit or downgrade.`;

/** Playbook block for a committee desk, keyed by its analyst key. */
export function playbookForDesk(key: QuantAnalystKey): string | null {
  switch (key) {
    case 'technicals':     return TECHNICAL_PLAYBOOK;
    case 'growth':         return EARNINGS_CATALYST_PLAYBOOK;
    case 'fundamentals':   return FUNDAMENTAL_QUALITY_PLAYBOOK;
    case 'news_sentiment': return POSITIONING_PLAYBOOK;
    case 'sentiment':      return RED_TEAM_PLAYBOOK;
    default:               return null;
  }
}

/** Playbook block for a tradingagents analyst, keyed by report field. */
export function playbookForAnalyst(key: 'market' | 'fundamentals' | 'sentiment' | 'news'): string {
  switch (key) {
    case 'market':       return TECHNICAL_PLAYBOOK;
    case 'fundamentals': return FUNDAMENTAL_QUALITY_PLAYBOOK;
    case 'sentiment':    return POSITIONING_PLAYBOOK;
    case 'news':         return EARNINGS_CATALYST_PLAYBOOK;
  }
}

/** Researcher-stage guidance: bulls must name the setup, bears must hunt failure patterns. */
export function playbookForResearcher(side: 'bull' | 'bear'): string {
  return side === 'bull'
    ? `${SETUP_TAXONOMY}\nYour case must name which setup this trade is and where its logical invalidation level sits; "no defined setup" caps your confidence at 45.`
    : `${RED_TEAM_PLAYBOOK}\nName every failure pattern that applies; a single decisive failure pattern outweighs several soft positives.`;
}
