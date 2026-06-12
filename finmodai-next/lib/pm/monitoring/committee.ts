import { hedgeFundToAgentView } from '@/lib/pm/adapters/hedgeFund';
import { ingestAgentView } from '@/lib/pm/decisions/pmBrain';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import {
  listQuantSignalEvents,
  updateQuantSignalEvent,
} from '@/lib/pm/monitoring/store';
import type { CommitteeTrigger, QuantSignalEvent } from '@/lib/pm/monitoring/types';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { recordPaperFill } from '@/lib/pm/paper/paperBook';

type CommitteeOutput = {
  ticker: string;
  mode: 'committee';
  decision: {
    action: string;
    confidence: number;
    reasoning: string;
    sizing?: string;
  } | null;
  signals: Array<{
    key: string;
    name: string;
    signal: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    reasoning: string;
    thesis: string;
  }>;
  consensus: { bullish: number; bearish: number; neutral: number };
  degraded?: boolean;
  degradedReason?: string | null;
};

export type InvestmentCommitteeRun = {
  id: string;
  ticker: string;
  trigger: CommitteeTrigger;
  signalEventIds: string[];
  agentViewId: string;
  decisionId: string | null;
  createdAt: string;
};

export async function runInvestmentCommittee(params: {
  ticker: string;
  trigger: CommitteeTrigger;
  origin: string;
  signalEvents?: QuantSignalEvent[];
  requestHeaders?: Headers;
}): Promise<InvestmentCommitteeRun> {
  const ticker = params.ticker.toUpperCase();
  const signalEvents = params.signalEvents ?? [];
  const response = await fetch(`${params.origin}/api/hedge-fund`, {
    method: 'POST',
    headers: internalRequestHeaders(params.requestHeaders),
    body: JSON.stringify({
      ticker,
      mode: 'committee',
      trigger: params.trigger,
      signalEvents,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) {
    throw new Error(`Investment committee failed (${response.status}): ${await response.text()}`);
  }

  const output = await response.json() as CommitteeOutput;
  if (!output.decision) {
    throw new Error(output.degradedReason ?? 'Senior investment committee returned no recommendation.');
  }

  const committeeId = crypto.randomUUID();
  const view = hedgeFundToAgentView(output);
  view.agentName = 'Senior Investment Committee';
  view.summary = `${params.trigger.replace(/_/g, ' ')} review: ${view.summary ?? view.reasoning}`;
  view.reasoning = view.summary;
  view.rawOutput = {
    ...output,
    committeeRunId: committeeId,
    trigger: params.trigger,
    signalEventIds: signalEvents.map(event => event.id),
  };
  view.evidence = [
    ...signalEvents.map(event => ({
      source: event.analystName,
      title: event.summary,
      summary: event.reasoning,
      impactDirection: event.direction,
      confidence: Math.min(100, Math.max(0, Math.round(Math.abs(event.delta) * 3))),
    })),
    ...view.evidence,
  ].slice(0, 12);

  const result = await ingestAgentView(view);
  const reviewedAt = new Date().toISOString();
  await Promise.all(signalEvents.map(event => updateQuantSignalEvent({
    ...event,
    status: 'reviewed',
    committeeRunId: committeeId,
    reviewedAt,
  })));

  // Paper-trade hook: translate the committee's decision into a hypothetical fill.
  // Never touches a real broker. Skips silently when not actionable.
  try {
    const positions = await listPositions({ ticker, limit: 1 });
    const currentPrice = positions[0]?.currentPrice ?? null;
    await recordPaperFill({
      ticker,
      action: output.decision.action,
      confidence: output.decision.confidence,
      rationale: output.decision.reasoning,
      currentPrice,
      committeeRunId: committeeId,
      agentViewId: result.agentView.id,
    });
  } catch (err) {
    console.warn('paper-fill hook failed', { ticker, error: (err as Error).message });
  }

  return {
    id: committeeId,
    ticker,
    trigger: params.trigger,
    signalEventIds: signalEvents.map(event => event.id),
    agentViewId: result.agentView.id,
    decisionId: result.decision?.id ?? null,
    createdAt: reviewedAt,
  };
}

export async function escalatedEventsForTicker(ticker: string): Promise<QuantSignalEvent[]> {
  const events = await listQuantSignalEvents({ ticker, status: 'escalated', limit: 50 });
  return events.filter(event => event.shouldEscalate && !event.committeeRunId);
}
