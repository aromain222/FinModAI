import type { AgentView, InvestmentDecision, ThesisUpdateInput, WeeklyMemoSection } from '@/lib/pm/types';

type HedgeFundSignal = {
  key?: string;
  name?: string;
  signal?: 'bullish' | 'bearish' | 'neutral';
  confidence?: number;
  reasoning?: string;
  thesis?: string;
};

type HedgeFundOutput = {
  ticker?: string;
  decision?: { action?: string; confidence?: number; reasoning?: string; sizing?: string } | null;
  signals?: HedgeFundSignal[];
  consensus?: { bullish?: number; bearish?: number; neutral?: number };
  source?: string;
};

function normalizeAction(action: string | undefined): InvestmentDecision['action'] {
  const normalized = action?.toLowerCase();
  if (normalized === 'buy' || normalized === 'sell' || normalized === 'hold' || normalized === 'short' || normalized === 'cover') return normalized;
  if (normalized === 'trim') return 'trim';
  if (normalized === 'add') return 'add';
  return 'watch';
}

function stanceFromConsensus(output: HedgeFundOutput): AgentView['stance'] {
  const action = output.decision?.action?.toLowerCase();
  if (action === 'buy' || action === 'add' || action === 'cover') return 'bullish';
  if (action === 'sell' || action === 'short' || action === 'trim') return 'bearish';
  const bull = output.consensus?.bullish ?? 0;
  const bear = output.consensus?.bearish ?? 0;
  if (Math.abs(bull - bear) <= 2) return 'mixed';
  return bull > bear ? 'bullish' : 'bearish';
}

export function hedgeFundToAgentView(output: HedgeFundOutput, previous?: AgentView | null): AgentView {
  const ticker = (output.ticker ?? '').toUpperCase();
  const stance = stanceFromConsensus(output);
  const conviction = Math.max(0, Math.min(100, Math.round(output.decision?.confidence ?? 50)));
  const reasoning = output.decision?.reasoning
    ?? `Consensus ${output.consensus?.bullish ?? 0} bull / ${output.consensus?.bearish ?? 0} bear / ${output.consensus?.neutral ?? 0} neutral.`;

  return {
    id: crypto.randomUUID(),
    ticker,
    agentName: 'AI Hedge Fund',
    stance,
    conviction,
    reasoning,
    changedSinceLast: previous ? previous.stance !== stance || Math.abs(previous.conviction - conviction) >= 10 : false,
    evidence: (output.signals ?? []).slice(0, 8).map(signal => ({
      source: signal.name ?? signal.key ?? 'hedge_fund',
      summary: signal.reasoning ?? signal.thesis ?? 'Agent signal recorded.',
      impactDirection: signal.signal === 'bullish' ? 'bullish' : signal.signal === 'bearish' ? 'bearish' : 'neutral',
      confidence: signal.confidence,
    })),
    createdAt: new Date().toISOString(),
    source: 'hedge_fund',
    agentType: 'hedge_fund',
    runAt: new Date().toISOString(),
    signal: stance === 'mixed' ? 'neutral' : stance,
    confidence: conviction,
    summary: reasoning,
    recommendation: normalizeAction(output.decision?.action),
    action: normalizeAction(output.decision?.action),
    sizing: output.decision?.sizing,
    rawOutput: output as Record<string, unknown>,
  };
}

export function hedgeFundToDecision(output: HedgeFundOutput): InvestmentDecision | null {
  if (!output.ticker || !output.decision?.action) return null;
  const action = normalizeAction(output.decision.action);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ticker: output.ticker.toUpperCase(),
    action,
    recommendation: `${action.toUpperCase()} subject to PM approval`,
    approvalStatus: 'pending',
    approvedBy: null,
    rationale: output.decision.reasoning ?? 'AI Hedge Fund recommendation recorded for PM review.',
    evidence: [{
      source: 'AI Hedge Fund',
      summary: output.decision.reasoning ?? 'Decision evidence unavailable.',
      confidence: output.decision.confidence,
    }],
    linkedAlertId: null,
    confidence: Math.max(0, Math.min(100, Math.round(output.decision.confidence ?? 50))),
    createdAt: now,
    updatedAt: now,
    recommendedAction: action,
    recommendedSizing: output.decision.sizing,
  };
}

export function hedgeFundToThesisUpdateInput(output: HedgeFundOutput): ThesisUpdateInput | null {
  if (!output.ticker) return null;
  const decision = output.decision?.action ? `${output.decision.action.toUpperCase()} at ${output.decision.confidence ?? 50}% confidence.` : '';
  const strongest = (output.signals ?? [])
    .slice()
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 3)
    .map(signal => `${signal.name ?? signal.key ?? 'agent'}: ${signal.signal ?? 'neutral'} (${signal.confidence ?? 50}%). ${signal.reasoning ?? signal.thesis ?? ''}`)
    .join(' ');
  return {
    ticker: output.ticker.toUpperCase(),
    newEvidence: `AI Hedge Fund committee update. ${decision} ${output.decision?.reasoning ?? ''} ${strongest}`.trim(),
    newThesisSummary: output.decision?.reasoning ?? (strongest || undefined),
    convictionScore: Math.max(0, Math.min(100, Math.round(output.decision?.confidence ?? 50))),
    source: 'agent',
  };
}

export function hedgeFundToWeeklyMemoSection(output: HedgeFundOutput): WeeklyMemoSection | null {
  if (!output.ticker) return null;
  const action = normalizeAction(output.decision?.action);
  const bull = output.consensus?.bullish ?? 0;
  const bear = output.consensus?.bearish ?? 0;
  const neutral = output.consensus?.neutral ?? 0;
  return {
    title: `${output.ticker.toUpperCase()} AI Hedge Fund read`,
    body: `${action.toUpperCase()} bias with ${bull} bullish, ${bear} bearish, ${neutral} neutral perspectives. ${output.decision?.reasoning ?? 'No committee rationale recorded.'}`,
    tickers: [output.ticker.toUpperCase()],
  };
}
