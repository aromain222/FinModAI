import type { AgentView, ConvictionDriftSummary, InvestmentDecision, PMAlert } from '@/lib/pm/types';
import { saveAlert } from '@/lib/pm/alerts/alertStore';
import { saveDecision } from '@/lib/pm/decisions/decisionStore';
import { convictionDriftToAlert, evaluateConvictionDrift } from '@/lib/pm/memory/convictionDrift';
import { getLatestAgentView, listAgentViews, saveAgentView } from '@/lib/pm/memory/agentViewStore';
import { getLatestThesis } from '@/lib/pm/thesis/thesisStore';
import { updateThesis } from '@/lib/pm/thesis/updateThesis';
import { notifyAlert, notifyApprovalNeeded, notifySignalFlip } from '@/lib/pm/notifications/notifier';

export type PMBrainIngestResult = {
  agentView: AgentView;
  thesisUpdate: Awaited<ReturnType<typeof updateThesis>>;
  convictionDrift: ConvictionDriftSummary;
  driftAlert: PMAlert | null;
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
  const [recentViews, latestThesis] = await Promise.all([
    listAgentViews({ ticker: view.ticker, limit: 12 }),
    getLatestThesis(view.ticker),
  ]);
  const viewWithDrift: AgentView = {
    ...view,
    changedSinceLast: previous ? previous.stance !== view.stance || Math.abs(previous.conviction - view.conviction) >= 10 : view.changedSinceLast,
  };
  const convictionDrift = evaluateConvictionDrift({
    ticker: view.ticker,
    currentView: viewWithDrift,
    previousView: previous,
    recentViews,
    thesis: latestThesis,
  });
  const agentView = await saveAgentView(viewWithDrift);
  const driftAlertPayload = convictionDriftToAlert(convictionDrift, latestThesis);
  const driftAlert = driftAlertPayload ? await saveAlert(driftAlertPayload) : null;
  const thesisUpdate = await updateThesis({
    ticker: agentView.ticker,
    newEvidence: `${agentView.agentName}: ${agentView.reasoning}\nPM drift check: ${convictionDrift.reason}`,
    convictionScore: agentView.conviction,
    agentViews: [agentView, ...recentViews].slice(0, 8),
    evidence: agentView.evidence,
    source: 'agent',
  });
  const decisionPayload = decisionFromView(agentView);
  const decision = decisionPayload ? await saveDecision(decisionPayload) : null;
  const approvalAlert = decision ? await saveAlert(approvalAlertFromDecision(decision)) : null;

  // Fire-and-forget Discord notifications (never block ingest)
  const notifications: Promise<void>[] = [];
  if (driftAlert && (driftAlert.severity === 'high' || driftAlert.severity === 'critical')) {
    notifications.push(notifyAlert(driftAlert, convictionDrift.reason));
  }
  if (approvalAlert && decision) {
    notifications.push(notifyApprovalNeeded(decision));
  }
  if (previous && previous.stance !== agentView.stance) {
    notifications.push(notifySignalFlip({
      ticker: agentView.ticker,
      agentName: agentView.agentName,
      fromStance: previous.stance,
      toStance: agentView.stance,
      conviction: agentView.conviction,
      reasoning: agentView.reasoning,
    }));
  }
  await Promise.allSettled(notifications);

  return { agentView, thesisUpdate, convictionDrift, driftAlert, decision, approvalAlert };
}
