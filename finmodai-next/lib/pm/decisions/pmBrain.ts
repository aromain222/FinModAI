import type { AgentView, InvestmentDecision, PMAlert } from '@/lib/pm/types';
import { saveAlert } from '@/lib/pm/alerts/alertStore';
import { saveDecision } from '@/lib/pm/decisions/decisionStore';
import { getLatestAgentView, saveAgentView } from '@/lib/pm/memory/agentViewStore';
import { updateThesis } from '@/lib/pm/thesis/updateThesis';

export type PMBrainIngestResult = {
  agentView: AgentView;
  thesisUpdate: Awaited<ReturnType<typeof updateThesis>>;
  decision: InvestmentDecision | null;
  approvalAlert: PMAlert | null;
};

function shouldCreateDecision(view: AgentView): boolean {
  return Boolean(view.recommendation && view.recommendation !== 'watch');
}

function decisionFromView(view: AgentView): InvestmentDecision | null {
  if (!view.recommendation || !shouldCreateDecision(view)) return null;
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ticker: view.ticker,
    action: view.recommendation,
    recommendation: `${view.recommendation.toUpperCase()} from ${view.agentName}; pending PM approval`,
    approvalStatus: 'pending',
    approvedBy: null,
    rationale: view.reasoning,
    evidence: view.evidence,
    linkedAlertId: null,
    confidence: view.conviction,
    createdAt: now,
    updatedAt: now,
    agentViewIds: [view.id],
    recommendedAction: view.recommendation,
  };
}

function approvalAlertFromDecision(decision: InvestmentDecision): PMAlert {
  return {
    id: crypto.randomUUID(),
    ticker: decision.ticker,
    alertType: 'approval_needed',
    severity: decision.confidence >= 75 ? 'high' : 'medium',
    title: `${decision.ticker} PM approval needed`,
    summary: `${decision.recommendation}. Rationale: ${decision.rationale}`,
    impactDirection:
      decision.action === 'buy' || decision.action === 'add' || decision.action === 'cover' ? 'bullish' :
      decision.action === 'sell' || decision.action === 'short' || decision.action === 'trim' || decision.action === 'exit' ? 'bearish' :
      'neutral',
    suggestedAction: 'approve',
    confidence: decision.confidence,
    affectedTheme: null,
    affectedThesis: null,
    shouldNotifyPM: true,
    evidence: decision.evidence,
    createdAt: decision.createdAt,
    resolvedAt: null,
    linkedDecisionId: decision.id,
  };
}

export async function ingestAgentView(view: AgentView): Promise<PMBrainIngestResult> {
  const previous = await getLatestAgentView(view.ticker);
  const viewWithDrift: AgentView = {
    ...view,
    changedSinceLast: previous ? previous.stance !== view.stance || Math.abs(previous.conviction - view.conviction) >= 10 : view.changedSinceLast,
  };
  const agentView = await saveAgentView(viewWithDrift);
  const thesisUpdate = await updateThesis({
    ticker: agentView.ticker,
    newEvidence: `${agentView.agentName}: ${agentView.reasoning}`,
    convictionScore: agentView.conviction,
    agentViews: [agentView],
    evidence: agentView.evidence,
    source: 'agent',
  });
  const decisionPayload = decisionFromView(agentView);
  const decision = decisionPayload ? await saveDecision(decisionPayload) : null;
  const approvalAlert = decision ? await saveAlert(approvalAlertFromDecision(decision)) : null;
  return { agentView, thesisUpdate, decision, approvalAlert };
}
