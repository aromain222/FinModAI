import type { Signal } from './types';

export type AgentStance = 'bullish' | 'neutral' | 'bearish';
export type AgentAlignment = 'confirms' | 'mixed' | 'conflicts';

export type NormalizedAgentRead = {
  source: 'AI Hedge Fund' | 'TradingAgents';
  stance: AgentStance;
  action: string;
  readiness: 'Supports setup' | 'Needs confirmation' | 'Pushes against setup';
  confidence: number;
  pmRead: string;
};

export function stanceFromAction(action: string): AgentStance {
  const normalized = action.trim().toLowerCase();
  if (['buy', 'cover', 'overweight', 'build', 'add'].includes(normalized)) return 'bullish';
  if (['sell', 'short', 'underweight', 'trim', 'exit', 'avoid'].includes(normalized)) return 'bearish';
  return 'neutral';
}

export function stanceAlignment(stance: AgentStance, signal: Signal): AgentAlignment {
  const scoreStance: AgentStance = signal === 'green' ? 'bullish' : signal === 'red' ? 'bearish' : 'neutral';
  if (stance === 'neutral' || scoreStance === 'neutral') return 'mixed';
  return stance === scoreStance ? 'confirms' : 'conflicts';
}

export function readinessFromAlignment(alignment: AgentAlignment): NormalizedAgentRead['readiness'] {
  if (alignment === 'confirms') return 'Supports setup';
  if (alignment === 'conflicts') return 'Pushes against setup';
  return 'Needs confirmation';
}

export function confidenceFromHedgeFund(input: {
  confidence?: number | null;
  bullish: number;
  bearish: number;
  neutral: number;
}): number {
  const total = Math.max(1, input.bullish + input.bearish + input.neutral);
  const splitStrength = Math.abs(input.bullish - input.bearish) / total;
  const base = input.confidence ?? 55;
  return Math.round(Math.max(35, Math.min(92, base * 0.75 + splitStrength * 35)));
}

export function confidenceFromTradingAgents(decision: string, reportCount: number): number {
  const stance = stanceFromAction(decision);
  const directionalBase = stance === 'neutral' ? 52 : 62;
  const evidenceBonus = Math.min(12, Math.max(0, reportCount) * 3);
  return Math.round(Math.min(86, directionalBase + evidenceBonus));
}

export function hedgeFundRead(input: {
  action: string;
  confidence?: number | null;
  bullish: number;
  bearish: number;
  neutral: number;
  signal: Signal;
}): NormalizedAgentRead {
  const stance = stanceFromAction(input.action);
  const alignment = stanceAlignment(stance, input.signal);
  const confidence = confidenceFromHedgeFund(input);
  const total = Math.max(1, input.bullish + input.bearish + input.neutral);
  const bullPct = Math.round((input.bullish / total) * 100);
  const bearPct = Math.round((input.bearish / total) * 100);
  return {
    source: 'AI Hedge Fund',
    stance,
    action: input.action,
    readiness: readinessFromAlignment(alignment),
    confidence,
    pmRead: `Persona consensus is ${stance}; ${bullPct}% bull / ${bearPct}% bear. Use it as sentiment and style-risk confirmation, not the final trade call.`,
  };
}

export function tradingAgentsRead(input: {
  decision: string;
  signal: Signal;
  reportCount: number;
  source?: string;
  targetValidity?: 'valid' | 'invalid' | 'unavailable';
  targetWarning?: string | null;
}): NormalizedAgentRead {
  const stance = stanceFromAction(input.decision);
  const alignment = stanceAlignment(stance, input.signal);
  const targetInvalid = input.targetValidity === 'invalid';
  const confidence = Math.max(
    35,
    confidenceFromTradingAgents(input.decision, input.reportCount) - (targetInvalid ? 18 : 0),
  );
  const readiness = targetInvalid ? 'Needs confirmation' : readinessFromAlignment(alignment);
  return {
    source: 'TradingAgents',
    stance,
    action: input.decision,
    readiness,
    confidence,
    pmRead: targetInvalid
      ? `Debate pipeline is ${stance}, but the price target failed sanity checks. Ignore the target and use the stance only as catalyst/tape evidence until refreshed.`
      : `Debate pipeline is ${stance}; it checks market/news evidence before the PM verdict. Treat it as catalyst and tape confirmation against the score.`,
  };
}
