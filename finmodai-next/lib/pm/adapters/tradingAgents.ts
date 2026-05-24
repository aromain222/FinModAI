import type { AgentView, InvestmentDecision } from '@/lib/pm/types';

type TradingAgentsOutput = {
  ticker?: string;
  decision?: string;
  summary?: string | null;
  thesis?: string | null;
  time_horizon?: string | null;
  target_validity?: string;
  target_warning?: string | null;
  reports?: Record<string, string | null>;
  source?: string;
};

function stanceFromDecision(decision: string | undefined): AgentView['stance'] {
  const value = decision?.toLowerCase() ?? '';
  if (/\b(buy|overweight|add)\b/.test(value)) return 'bullish';
  if (/\b(sell|underweight|short|exit)\b/.test(value)) return 'bearish';
  return 'neutral';
}

function actionFromDecision(decision: string | undefined): InvestmentDecision['action'] {
  const value = decision?.toLowerCase() ?? '';
  if (/\b(buy|overweight)\b/.test(value)) return 'buy';
  if (/\b(sell|underweight)\b/.test(value)) return 'sell';
  if (/\bshort\b/.test(value)) return 'short';
  return 'hold';
}

export function tradingAgentsToAgentView(output: TradingAgentsOutput, previous?: AgentView | null): AgentView {
  const stance = stanceFromDecision(output.decision);
  const conviction = output.target_validity === 'invalid' ? 45 : 60;
  const reasoning = [output.summary, output.thesis, output.target_warning].filter(Boolean).join(' ') || 'TradingAgents debate completed.';
  return {
    id: crypto.randomUUID(),
    ticker: (output.ticker ?? '').toUpperCase(),
    agentName: 'TradingAgents Debate',
    stance,
    conviction,
    reasoning,
    changedSinceLast: previous ? previous.stance !== stance || Math.abs(previous.conviction - conviction) >= 10 : false,
    evidence: Object.entries(output.reports ?? {}).flatMap(([source, summary]) => (
      summary ? [{ source, summary }] : []
    )),
    createdAt: new Date().toISOString(),
    source: 'tradingagents',
    agentType: 'tradingagents',
    runAt: new Date().toISOString(),
    signal: stance === 'mixed' ? 'neutral' : stance,
    confidence: conviction,
    summary: reasoning,
    recommendation: actionFromDecision(output.decision),
    action: actionFromDecision(output.decision),
    timeHorizon: output.time_horizon ?? undefined,
    rawOutput: output as Record<string, unknown>,
  };
}

export function tradingAgentsToDecision(output: TradingAgentsOutput): InvestmentDecision | null {
  if (!output.ticker || !output.decision) return null;
  const action = actionFromDecision(output.decision);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ticker: output.ticker.toUpperCase(),
    action,
    recommendation: `${action.toUpperCase()} from TradingAgents debate, pending PM approval`,
    approvalStatus: 'pending',
    approvedBy: null,
    rationale: [output.summary, output.thesis, output.target_warning].filter(Boolean).join(' ') || 'TradingAgents recommendation recorded for PM review.',
    evidence: Object.entries(output.reports ?? {}).flatMap(([source, summary]) => (
      summary ? [{ source, summary }] : []
    )),
    linkedAlertId: null,
    confidence: output.target_validity === 'invalid' ? 45 : 60,
    createdAt: now,
    updatedAt: now,
    recommendedAction: action,
  };
}
