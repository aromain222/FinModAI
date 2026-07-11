import { hedgeFundToAgentView } from '@/lib/pm/adapters/hedgeFund';
import { ingestAgentView } from '@/lib/pm/decisions/pmBrain';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import {
  listQuantSignalEvents,
  updateQuantSignalEvent,
} from '@/lib/pm/monitoring/store';
import type { CommitteeTrigger, QuantSignalEvent } from '@/lib/pm/monitoring/types';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { recordPaperFill, type PaperTriggerSource } from '@/lib/pm/paper/paperBook';
import {
  buildResearchPacket,
  DEFAULT_RESEARCH_HORIZON_DAYS,
} from '@/lib/pm/research/researchPacket';
import type { MarketStatePacket } from '@/lib/pm/marketState/marketStateContract';
import type { ResearchPacket } from '@/lib/pm/research/researchPacketContract';
import {
  calibratedConfidence,
  scheduleAgentOutcome,
} from '@/lib/pm/calibration/agentOutcomes';

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
  triggerSource?: PaperTriggerSource;
  researchPacket?: ResearchPacket;
  marketState?: MarketStatePacket | null;
}): Promise<InvestmentCommitteeRun> {
  const ticker = params.ticker.toUpperCase();
  const signalEvents = params.signalEvents ?? [];
  const researchPacket = params.researchPacket ?? await buildResearchPacket({
    ticker,
    origin: params.origin,
    horizonDays: DEFAULT_RESEARCH_HORIZON_DAYS,
    marketState: params.marketState,
  });
  const response = await fetch(`${params.origin}/api/hedge-fund`, {
    method: 'POST',
    headers: internalRequestHeaders(params.requestHeaders),
    body: JSON.stringify({
      ticker,
      mode: 'committee',
      trigger: params.trigger,
      signalEvents,
      horizonDays: researchPacket.horizon.days,
      researchPacket,
    }),
    cache: 'no-store',
    // Committee depth is three bounded parallel stages (memos, cross-exams,
    // adjudication). Their worst-case provider windows can legitimately exceed
    // 59 seconds even though the hedge-fund route remains inside its 120s cap.
    signal: AbortSignal.timeout(90_000),
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
  const calibration = await calibratedConfidence(view.agentName, view.conviction);
  view.conviction = calibration.value;
  view.confidence = calibration.value;
  view.summary = `${params.trigger.replace(/_/g, ' ')} review: ${view.summary ?? view.reasoning}`;
  view.reasoning = view.summary;
  view.rawOutput = {
    ...output,
    committeeRunId: committeeId,
    trigger: params.trigger,
    signalEventIds: signalEvents.map(event => event.id),
    researchPacketCoverage: researchPacket.quality.coveragePct,
    calibration: calibration.summary,
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
  await scheduleAgentOutcome({
    view: result.agentView,
    referencePrice: researchPacket.market.price.value,
    horizonDays: researchPacket.horizon.days,
  });
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
      triggerSource: params.triggerSource ?? 'committee_escalation',
      minConfidence: params.triggerSource === 'committee_cycle' ? 40 : 50,
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
