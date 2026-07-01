import type { EvidenceItem, InvestmentDecision, TradeAction } from '@/lib/pm/types';
import type { PaperExecutionPreview, PaperExecutionResult } from '@/lib/execution/types';

/** Directional read extracted from a consulted CapitalBase agent. */
export type AgentStance = 'bullish' | 'bearish' | 'neutral';

export type ConsultedAgentKey = 'tradingagents' | 'hedge_fund_committee';

/**
 * Normalized result of one agent consultation. The trading agent never trades
 * off a raw agent payload — everything is reduced to stance + confidence first.
 */
export type AgentConsultation = {
  agent: ConsultedAgentKey;
  agentName: string;
  ok: boolean;
  stance: AgentStance;
  /** 0–100. */
  confidence: number;
  summary: string;
  evidence: EvidenceItem[];
  raw?: Record<string, unknown>;
  error?: string;
};

export type ConsensusAgreement = 'unanimous' | 'majority' | 'split' | 'no_signal';

export type TradeConsensus = {
  stance: AgentStance;
  action: TradeAction;
  /** 0–100, dampened when agents disagree or respond partially. */
  confidence: number;
  agreement: ConsensusAgreement;
  rationale: string;
};

export type TradingAgentRunInput = {
  ticker: string;
  origin: string;
  requestHeaders?: Headers;
  /** Investment themes the trade must fit (forwarded to the research debate). */
  themes?: string[];
  /** Paper order size in USD; still subject to execution risk checks. */
  notional?: number;
  /** When true, attempt guarded paper execution after the consult round. */
  execute?: boolean;
};

export type TradingAgentExecutionOutcome =
  | { status: 'not_requested' }
  | { status: 'skipped'; reasons: string[] }
  | { status: 'previewed'; preview: PaperExecutionPreview }
  | { status: 'submitted'; result: PaperExecutionResult }
  | { status: 'failed'; error: string };

export type TradingAgentRun = {
  ticker: string;
  ranAt: string;
  consultations: AgentConsultation[];
  consensus: TradeConsensus;
  /** Pending PM decision persisted for the approval workflow; null when no signal. */
  decision: InvestmentDecision | null;
  execution: TradingAgentExecutionOutcome;
  /** Platform context the agent factored in before deciding. */
  context: {
    holdsPosition: boolean;
    currentPrice: number | null;
    quantScoreSummary: string | null;
  };
};
