import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';
import type { UserIntent } from '@/lib/execution/userIntent';
import type { EvidenceItem, ImpactDirection } from '@/lib/pm/types';
import type { AgentConsultation, AgentStance } from '@/lib/pm/tradingAgent/types';
import type { ResearchPacket } from '@/lib/pm/research/researchPacketContract';

// tradingagents now runs a 4-stage researcher debate (worst case ~52s of LLM time);
// callers of this module are crons with 300s budgets, so 90s leaves honest headroom.
const CONSULT_TIMEOUT_MS = 90_000;

type TradingAgentsResponse = {
  ticker: string;
  decision: string;
  summary: string | null;
  thesis: string | null;
  price_target: number | null;
  target_validity?: 'valid' | 'invalid' | 'unavailable';
  time_horizon: string | null;
  reports: {
    market: string | null;
    fundamentals: string | null;
    sentiment: string | null;
    news: string | null;
  };
  theme_fit_score: number | null;
  theme_fit_reason: string;
  business_consistency: boolean;
};

type CommitteeResponse = {
  ticker: string;
  mode: 'committee';
  decision: { action: string; confidence: number; reasoning: string; sizing?: string } | null;
  signals: Array<{
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

export function stanceFromDecisionWord(decision: string): AgentStance {
  const d = decision.toLowerCase();
  if (d === 'buy' || d === 'overweight' || d === 'add' || d === 'cover') return 'bullish';
  if (d === 'sell' || d === 'underweight' || d === 'short' || d === 'trim' || d === 'exit') return 'bearish';
  return 'neutral';
}

function stanceToImpact(stance: AgentStance): ImpactDirection {
  return stance;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function failedConsultation(
  agent: AgentConsultation['agent'],
  agentName: string,
  error: unknown,
): AgentConsultation {
  return {
    agent,
    agentName,
    ok: false,
    stance: 'neutral',
    confidence: 0,
    summary: 'Consultation failed; treated as no signal.',
    evidence: [],
    error: error instanceof Error ? error.message : String(error),
  };
}

function buildIntent(themes: string[] | undefined): UserIntent | null {
  if (!themes || themes.length === 0) return null;
  return {
    themes,
    risk_profile: 'balanced',
    position_count: null,
    capital_usd: null,
    time_horizon: 'short',
    asset_class: 'common_stock',
    raw_prompt: `Trading agent mandate check: ${themes.join(', ')}`,
  };
}

/**
 * The research debate route returns no numeric confidence, so derive one from
 * the qualitative sanity signals it does return.
 */
export function deriveDebateConfidence(result: TradingAgentsResponse): number {
  let confidence = 55;
  if (result.target_validity === 'valid') confidence += 12;
  if (result.target_validity === 'invalid') confidence -= 15;
  if (!result.business_consistency) confidence -= 20;
  if (result.theme_fit_score != null) {
    confidence += result.theme_fit_score >= 7 ? 8 : result.theme_fit_score < 5 ? -15 : 0;
  }
  const stance = stanceFromDecisionWord(result.decision);
  if (stance === 'neutral') confidence -= 10;
  return clampConfidence(confidence);
}

/** Consult the TradingAgents research debate (4 analysts + PM synthesis). */
export async function consultResearchDebate(params: {
  ticker: string;
  origin: string;
  requestHeaders?: Headers;
  themes?: string[];
  researchPacket?: ResearchPacket;
}): Promise<AgentConsultation> {
  const agentName = 'TradingAgents Research Debate';
  try {
    const response = await fetch(`${params.origin}/api/tradingagents`, {
      method: 'POST',
      headers: internalRequestHeaders(params.requestHeaders),
      body: JSON.stringify({
        ticker: params.ticker,
        intent: buildIntent(params.themes),
        researchPacket: params.researchPacket,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(CONSULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`tradingagents responded ${response.status}: ${await response.text()}`);
    }

    const result = await response.json() as TradingAgentsResponse;
    const stance = stanceFromDecisionWord(result.decision);
    const analystNotes: Array<{ source: string; note: string | null }> = [
      { source: 'Market Analyst', note: result.reports.market },
      { source: 'Fundamentals Analyst', note: result.reports.fundamentals },
      { source: 'Sentiment Analyst', note: result.reports.sentiment },
      { source: 'News Analyst', note: result.reports.news },
    ];
    const reportEvidence: EvidenceItem[] = analystNotes
      .filter((entry): entry is { source: string; note: string } => Boolean(entry.note))
      .map(entry => ({
        source: entry.source,
        title: `${agentName} — ${params.ticker}`,
        summary: entry.note,
        impactDirection: stanceToImpact(stance),
      }));

    return {
      agent: 'tradingagents',
      agentName,
      ok: true,
      stance,
      confidence: deriveDebateConfidence(result),
      summary: [
        `${result.decision}: ${result.summary ?? result.thesis ?? 'no synthesis returned.'}`,
        result.theme_fit_reason || null,
      ].filter(Boolean).join(' '),
      evidence: reportEvidence,
      raw: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return failedConsultation('tradingagents', agentName, error);
  }
}

/** Consult the hedge-fund senior investment committee (13 investor personas). */
export async function consultInvestmentCommittee(params: {
  ticker: string;
  origin: string;
  requestHeaders?: Headers;
  researchPacket?: ResearchPacket;
}): Promise<AgentConsultation> {
  const agentName = 'Senior Investment Committee';
  try {
    const response = await fetch(`${params.origin}/api/hedge-fund`, {
      method: 'POST',
      headers: internalRequestHeaders(params.requestHeaders),
      body: JSON.stringify({
        ticker: params.ticker,
        mode: 'committee',
        trigger: 'trading_agent',
        researchPacket: params.researchPacket,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(CONSULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`hedge-fund committee responded ${response.status}: ${await response.text()}`);
    }

    const result = await response.json() as CommitteeResponse;
    if (!result.decision) {
      throw new Error(result.degradedReason ?? 'Committee returned no decision.');
    }

    const stance = stanceFromDecisionWord(result.decision.action);
    const { bullish, bearish, neutral } = result.consensus;
    const topSignals = [...result.signals]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 4)
      .map(signal => ({
        source: signal.name,
        title: `${agentName} — ${params.ticker}`,
        summary: signal.reasoning || signal.thesis,
        impactDirection: signal.signal,
        confidence: clampConfidence(signal.confidence),
      }));

    return {
      agent: 'hedge_fund_committee',
      agentName,
      ok: true,
      stance,
      confidence: clampConfidence(result.decision.confidence),
      summary: `${result.decision.action} (${bullish} bullish / ${bearish} bearish / ${neutral} neutral): ${result.decision.reasoning}`,
      evidence: topSignals,
      raw: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return failedConsultation('hedge_fund_committee', agentName, error);
  }
}

/** Run both consultations in parallel; failures degrade to no-signal entries. */
export async function consultCapitalBaseAgents(params: {
  ticker: string;
  origin: string;
  requestHeaders?: Headers;
  themes?: string[];
}): Promise<AgentConsultation[]> {
  const { buildResearchPacket, DEFAULT_RESEARCH_HORIZON_DAYS } = await import('@/lib/pm/research/researchPacket');
  const researchPacket = await buildResearchPacket({
    ticker: params.ticker,
    origin: params.origin,
    horizonDays: DEFAULT_RESEARCH_HORIZON_DAYS,
  });
  return Promise.all([
    consultResearchDebate({ ...params, researchPacket }),
    consultInvestmentCommittee({ ...params, researchPacket }),
  ]);
}
