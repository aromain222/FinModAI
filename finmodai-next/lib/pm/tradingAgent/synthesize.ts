import type { TradeAction } from '@/lib/pm/types';
import type {
  AgentConsultation,
  AgentStance,
  ConsensusAgreement,
  TradeConsensus,
} from '@/lib/pm/tradingAgent/types';

/**
 * Directional stance → executable action, shaped by what the book already holds.
 * Bearish without a position stays 'hold': this agent never opens shorts, and
 * a naked paper sell on Alpaca would silently become one.
 */
export function actionForStance(stance: AgentStance, holdsPosition: boolean): TradeAction {
  if (stance === 'bullish') return holdsPosition ? 'add' : 'buy';
  if (stance === 'bearish') return holdsPosition ? 'trim' : 'hold';
  return holdsPosition ? 'hold' : 'watch';
}

function averageConfidence(consultations: AgentConsultation[]): number {
  if (consultations.length === 0) return 0;
  const total = consultations.reduce((sum, consultation) => sum + consultation.confidence, 0);
  return total / consultations.length;
}

function describeVotes(consultations: AgentConsultation[]): string {
  return consultations
    .map(consultation => `${consultation.agentName}: ${consultation.stance} (${consultation.confidence}/100)`)
    .join('; ');
}

/**
 * Combine agent consultations into a single trade consensus.
 *
 * Rules:
 * - No responding agents → no_signal, never tradeable.
 * - Bullish and bearish reads present → split → defensive hold, confidence halved.
 * - All responding agents share a directional stance → unanimous.
 * - Direction + neutrals, or a single responder → majority, confidence dampened.
 */
export function synthesizeConsensus(
  consultations: AgentConsultation[],
  holdsPosition: boolean,
): TradeConsensus {
  const responded = consultations.filter(consultation => consultation.ok);
  const failed = consultations.filter(consultation => !consultation.ok);
  const failureNote = failed.length > 0
    ? ` ${failed.length} agent(s) did not respond and were excluded.`
    : '';

  if (responded.length === 0) {
    return {
      stance: 'neutral',
      action: holdsPosition ? 'hold' : 'watch',
      confidence: 0,
      agreement: 'no_signal',
      rationale: 'No CapitalBase agent produced a usable read; the trading agent will not act without agent input.',
    };
  }

  const bullish = responded.filter(consultation => consultation.stance === 'bullish');
  const bearish = responded.filter(consultation => consultation.stance === 'bearish');
  const votes = describeVotes(responded);

  if (bullish.length > 0 && bearish.length > 0) {
    return {
      stance: 'neutral',
      action: 'hold',
      confidence: Math.round(averageConfidence(responded) * 0.5),
      agreement: 'split',
      rationale: `Agents disagree on direction, so no trade: ${votes}.${failureNote}`,
    };
  }

  const directional = bullish.length > 0 ? bullish : bearish;
  if (directional.length === 0) {
    return {
      stance: 'neutral',
      action: holdsPosition ? 'hold' : 'watch',
      confidence: Math.round(averageConfidence(responded) * 0.6),
      agreement: 'unanimous',
      rationale: `All responding agents are neutral: ${votes}.${failureNote}`,
    };
  }

  const stance: AgentStance = bullish.length > 0 ? 'bullish' : 'bearish';
  const fullPanel = responded.length === consultations.length && consultations.length > 1;
  const agreement: ConsensusAgreement =
    directional.length === responded.length && fullPanel ? 'unanimous' : 'majority';
  const dampener = agreement === 'unanimous' ? 1 : 0.8;

  return {
    stance,
    action: actionForStance(stance, holdsPosition),
    confidence: Math.round(averageConfidence(directional) * dampener),
    agreement,
    rationale: `${agreement === 'unanimous' ? 'Unanimous' : 'Majority'} ${stance} read from consulted agents: ${votes}.${failureNote}`,
  };
}
