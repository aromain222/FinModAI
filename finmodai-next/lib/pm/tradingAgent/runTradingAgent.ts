import { consultCapitalBaseAgents } from '@/lib/pm/tradingAgent/consultAgents';
import { synthesizeConsensus } from '@/lib/pm/tradingAgent/synthesize';
import { saveDecision, updateDecision } from '@/lib/pm/decisions/decisionStore';
import { recordOutcome } from '@/lib/pm/memory/recordOutcome';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { listQuantScores } from '@/lib/pm/monitoring/store';
import {
  isExecutableTradeAction,
  previewPaperExecution,
  submitApprovedPaperExecution,
} from '@/lib/execution/orders';
import { resolvePersonality, type TradingPersonality } from '@/lib/pm/tradingAgent/personality';
import { getPortfolioEquity, sizePosition, type PositionSize } from '@/lib/pm/tradingAgent/sizing';
import { reviewTrackRecord } from '@/lib/pm/tradingAgent/learning';
import type { EvidenceItem, InvestmentDecision } from '@/lib/pm/types';
import type {
  AgentConsultation,
  TradeConsensus,
  TradingAgentContext,
  TradingAgentExecutionOutcome,
  TradingAgentRun,
  TradingAgentRunInput,
} from '@/lib/pm/tradingAgent/types';

const DEFAULT_MIN_EXECUTION_CONFIDENCE = 70;
const DEFAULT_EXECUTION_NOTIONAL = 100;

export function tradingAgentExecutionEnabled(): boolean {
  return process.env.TRADING_AGENT_EXECUTION_ENABLED === 'true';
}

export function tradingAgentEnvNumber(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function tradingAgentDefaultNotional(): number {
  return tradingAgentEnvNumber('TRADING_AGENT_DEFAULT_NOTIONAL', DEFAULT_EXECUTION_NOTIONAL);
}

/**
 * Daily overtrading guard for the always-on loop. Counts orders this agent
 * already executed today (UTC) so an hourly cron cannot fire unbounded.
 */
export function executedByAgentToday(
  decisions: Pick<InvestmentDecision, 'executedAt' | 'approvedBy'>[],
  now: Date = new Date(),
): number {
  const today = now.toISOString().slice(0, 10);
  return decisions.filter(decision =>
    decision.approvedBy === 'capitalbase_trading_agent' &&
    typeof decision.executedAt === 'string' &&
    decision.executedAt.slice(0, 10) === today,
  ).length;
}

async function quantScoreSummary(ticker: string): Promise<string | null> {
  try {
    const scores = await listQuantScores({ ticker, limit: 12 });
    if (scores.length === 0) return null;
    const latestPerAnalyst = new Map<string, typeof scores[number]>();
    for (const score of scores) {
      if (!latestPerAnalyst.has(score.analystKey)) latestPerAnalyst.set(score.analystKey, score);
    }
    return [...latestPerAnalyst.values()]
      .map(score => `${score.analystName} ${score.score}/100 (${score.signal})`)
      .join('; ');
  } catch {
    return null;
  }
}

function decisionEvidence(
  consultations: AgentConsultation[],
  scoreSummary: string | null,
): EvidenceItem[] {
  const agentEvidence = consultations.filter(c => c.ok).flatMap(consultation => [
    {
      source: consultation.agentName,
      title: 'Agent verdict',
      summary: consultation.summary,
      impactDirection: consultation.stance,
      confidence: consultation.confidence,
    },
    ...consultation.evidence,
  ]);

  const scoutEvidence: EvidenceItem[] = scoreSummary
    ? [{
        source: 'CapitalBase Quant Scouts',
        title: 'Latest monitoring scores',
        summary: scoreSummary,
        impactDirection: 'neutral' as const,
      }]
    : [];

  return [...agentEvidence, ...scoutEvidence].slice(0, 12);
}

export async function persistConsensusDecision(params: {
  ticker: string;
  consensus: TradeConsensus;
  consultations: AgentConsultation[];
  scoreSummary: string | null;
  positionId: string | undefined;
}): Promise<InvestmentDecision> {
  const { ticker, consensus } = params;
  return saveDecision({
    ticker,
    positionId: params.positionId,
    action: consensus.action,
    recommendation: `Trading agent ${consensus.action.toUpperCase()} — ${consensus.agreement} agent consensus (${consensus.confidence}/100).`,
    rationale: consensus.rationale,
    rationaleText: consensus.rationale,
    recommendedAction: consensus.action,
    confidence: consensus.confidence,
    confidenceScore: consensus.confidence,
    evidence: decisionEvidence(params.consultations, params.scoreSummary),
  });
}

function executionSkipReasons(
  consensus: TradeConsensus,
  minConfidence: number,
  requiredAgreement: 'unanimous' | 'majority',
): string[] {
  const reasons: string[] = [];
  if (!tradingAgentExecutionEnabled()) {
    reasons.push('TRADING_AGENT_EXECUTION_ENABLED is not true; decision left pending for human approval.');
  }
  if (!isExecutableTradeAction(consensus.action)) {
    reasons.push(`Consensus action "${consensus.action}" is not executable.`);
  }
  const agreementOk = consensus.agreement === 'unanimous'
    || (requiredAgreement === 'majority' && consensus.agreement === 'majority');
  if (!agreementOk) {
    reasons.push(`Execution requires ${requiredAgreement} agent agreement; got "${consensus.agreement}".`);
  }
  if (consensus.confidence < minConfidence) {
    reasons.push(`Consensus confidence ${consensus.confidence} is below the execution threshold ${minConfidence}.`);
  }
  return reasons;
}

export async function runExecutionStage(params: {
  decision: InvestmentDecision;
  consensus: TradeConsensus;
  execute: boolean;
  notional: number;
  /** Risk contract governing agreement/confidence gates; defaults preserve legacy behavior. */
  personality?: TradingPersonality;
  /** Learning-loop penalty added to the execution confidence floor. */
  disciplineAdjustment?: number;
}): Promise<TradingAgentExecutionOutcome> {
  const { decision, consensus, execute, notional } = params;

  if (!isExecutableTradeAction(consensus.action)) {
    return execute
      ? { status: 'skipped', reasons: [`Consensus action "${consensus.action}" is not executable.`] }
      : { status: 'not_requested' };
  }

  if (notional <= 0) {
    return execute
      ? { status: 'skipped', reasons: ['Position sizer allocated $0 to this trade (no headroom or conviction too weak).'] }
      : { status: 'not_requested' };
  }

  try {
    if (!execute) {
      // Analysis-only run: still produce the risk-checked order preview so the
      // PM sees exactly what would be sent on approval.
      const preview = await previewPaperExecution({ decisionId: decision.id, notional, dryRun: true });
      return { status: 'previewed', preview };
    }

    const personality = params.personality ?? resolvePersonality();
    const minConfidence =
      tradingAgentEnvNumber('TRADING_AGENT_MIN_CONFIDENCE', personality.minExecutionConfidence ?? DEFAULT_MIN_EXECUTION_CONFIDENCE)
      + Math.max(0, params.disciplineAdjustment ?? 0);
    const reasons = executionSkipReasons(consensus, minConfidence, personality.executionAgreement);
    if (reasons.length > 0) {
      return { status: 'skipped', reasons };
    }

    const approved = await updateDecision(decision.id, {
      approvalStatus: 'approved',
      approvedBy: 'capitalbase_trading_agent',
      approvalNote: `Trading agent (${personality.name}) auto-approved for paper execution: ${consensus.agreement} consensus at ${consensus.confidence}/100 (threshold ${minConfidence}).`,
      updatedAt: new Date().toISOString(),
    });
    if (!approved) {
      return { status: 'failed', error: 'Decision could not be approved before execution.' };
    }

    const result = await submitApprovedPaperExecution({ decisionId: decision.id, notional, dryRun: false });
    return { status: 'submitted', result };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Consult the resident agents on one ticker and synthesize their reads.
 * Pure analysis — persists nothing, so scan mode can evaluate many candidates
 * and only commit decisions for the ones it selects.
 */
export async function analyzeTicker(params: {
  ticker: string;
  origin: string;
  requestHeaders?: Headers;
  themes?: string[];
}): Promise<{
  consultations: AgentConsultation[];
  consensus: TradeConsensus;
  context: TradingAgentContext;
  positionId: string | undefined;
}> {
  const ticker = params.ticker.toUpperCase().trim();
  const [positions, scoreSummary, consultations] = await Promise.all([
    listPositions({ ticker, limit: 1 }).catch(() => []),
    quantScoreSummary(ticker),
    consultCapitalBaseAgents({
      ticker,
      origin: params.origin,
      requestHeaders: params.requestHeaders,
      themes: params.themes,
    }),
  ]);

  const position = positions[0];
  const holdsPosition = Boolean(position && position.status !== 'closed');
  const consensus = synthesizeConsensus(consultations, holdsPosition);

  return {
    consultations,
    consensus,
    context: {
      holdsPosition,
      currentPrice: position?.currentPrice ?? null,
      notionalExposure: holdsPosition ? position?.notionalExposure ?? null : null,
      quantScoreSummary: scoreSummary,
    },
    positionId: position?.id,
  };
}

export async function recordSubmissionMemory(ticker: string, consensus: TradeConsensus): Promise<void> {
  try {
    await recordOutcome({
      memoryType: 'process_lesson',
      lesson: `${ticker} ${consensus.action.toUpperCase()} paper order submitted by the trading agent after ${consensus.agreement} agent consensus at ${consensus.confidence}/100. ${consensus.rationale}`,
      relatedTickers: [ticker],
      relatedThemes: ['trading_agent', 'paper_execution'],
      importance: 80,
    });
  } catch {
    // Memory persistence must not fail the run.
  }
}

/**
 * CapitalBase trading agent: gather platform context, consult the resident
 * agents (research debate + investment committee), synthesize their reads,
 * persist a PM decision, and — only when unanimously confident, explicitly
 * requested, and enabled by env — submit a paper order. Paper-only by design.
 */
export async function runTradingAgent(input: TradingAgentRunInput): Promise<TradingAgentRun> {
  const ticker = input.ticker.toUpperCase().trim();
  const ranAt = new Date().toISOString();
  const personality = resolvePersonality(input.personality);

  const [{ consultations, consensus, context, positionId }, trackRecord] = await Promise.all([
    analyzeTicker({
      ticker,
      origin: input.origin,
      requestHeaders: input.requestHeaders,
      themes: input.themes,
    }),
    reviewTrackRecord(),
  ]);

  if (consensus.agreement === 'no_signal') {
    return {
      ticker,
      ranAt,
      consultations,
      consensus,
      decision: null,
      execution: input.execute
        ? { status: 'skipped', reasons: ['No agent signal; nothing to execute.'] }
        : { status: 'not_requested' },
      context,
      sizing: null,
    };
  }

  // Size the trade unless the caller dictated an explicit notional.
  let sizing: PositionSize | null = null;
  let notional = input.notional ?? tradingAgentDefaultNotional();
  if (input.notional == null && consensus.stance === 'bullish') {
    const { equity } = await getPortfolioEquity();
    sizing = sizePosition({
      equity,
      consensus,
      personality,
      currentExposureUsd: context.notionalExposure,
    });
    notional = sizing.notional;
  }

  const decision = await persistConsensusDecision({
    ticker,
    consensus,
    consultations,
    scoreSummary: context.quantScoreSummary,
    positionId,
  });

  const execution = await runExecutionStage({
    decision,
    consensus,
    execute: Boolean(input.execute),
    notional,
    personality,
    disciplineAdjustment: trackRecord.disciplineAdjustment,
  });

  if (execution.status === 'submitted') {
    await recordSubmissionMemory(ticker, consensus);
  }

  return {
    ticker,
    ranAt,
    consultations,
    consensus,
    decision: execution.status === 'submitted' ? execution.result.decision : decision,
    execution,
    context,
    sizing,
  };
}
