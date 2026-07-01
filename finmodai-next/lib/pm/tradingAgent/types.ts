import type { EvidenceItem, InvestmentDecision, TradeAction } from '@/lib/pm/types';
import type { PaperExecutionPreview, PaperExecutionResult } from '@/lib/execution/types';
import type { PersonalityKey } from '@/lib/pm/tradingAgent/personality';
import type { PortfolioEquity, PositionSize } from '@/lib/pm/tradingAgent/sizing';

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
  /** Explicit paper order size in USD; when omitted the agent sizes the position itself. */
  notional?: number;
  /** When true, attempt guarded paper execution after the consult round. */
  execute?: boolean;
  /** Risk contract the agent trades under; defaults to env, then 'operator'. */
  personality?: PersonalityKey;
};

export type TradingAgentExecutionOutcome =
  | { status: 'not_requested' }
  | { status: 'skipped'; reasons: string[] }
  | { status: 'previewed'; preview: PaperExecutionPreview }
  | { status: 'submitted'; result: PaperExecutionResult }
  | { status: 'failed'; error: string };

export type TradingAgentContext = {
  holdsPosition: boolean;
  currentPrice: number | null;
  /** Current dollar exposure to this name in pm_positions, when held. */
  notionalExposure: number | null;
  quantScoreSummary: string | null;
};

export type TradingAgentRun = {
  ticker: string;
  ranAt: string;
  consultations: AgentConsultation[];
  consensus: TradeConsensus;
  /** Pending PM decision persisted for the approval workflow; null when no signal. */
  decision: InvestmentDecision | null;
  execution: TradingAgentExecutionOutcome;
  /** Platform context the agent factored in before deciding. */
  context: TradingAgentContext;
  /** How the agent sized this trade (null when there was nothing to size). */
  sizing: PositionSize | null;
};

// ── Autonomous scan mode ──────────────────────────────────────────────────────

export type CandidateSource = 'rank' | 'provided' | 'watchlist' | 'positions';

/** A stock the scan considered, with the ranking context it was sourced with. */
export type ScanCandidate = {
  ticker: string;
  source: CandidateSource;
  /** Opportunity score from the ranked board (1–10), when sourced from rank. */
  rankScore: number | null;
  primaryReason: string | null;
  valuation: {
    signal: 'undervalued' | 'fair' | 'overvalued';
    impliedUpside: number | null;
    summary: string;
  } | null;
};

/** Full agent read on one scanned candidate (nothing persisted yet). */
export type TickerAnalysis = {
  candidate: ScanCandidate;
  consultations: AgentConsultation[];
  consensus: TradeConsensus;
  context: TradingAgentContext;
  /** Existing pm_positions record id when the book already holds the name. */
  positionId?: string;
  /** Human-readable narrative combining ranking, agent reads, and consensus. */
  story: string;
};

export type TradingAgentPick = {
  ticker: string;
  /** Composite selection score used to order picks (higher = stronger). */
  selectionScore: number;
  selectionReason: string;
  consensus: TradeConsensus;
  /** How much of the portfolio the agent assigned to this name, and why. */
  sizing: PositionSize;
  decision: InvestmentDecision;
  execution: TradingAgentExecutionOutcome;
};

export type TradingAgentScanInput = {
  origin: string;
  requestHeaders?: Headers;
  /** Investment themes forwarded to sourcing and the research debate. */
  themes?: string[];
  /** Explicit universe to consider instead of the ranked board. */
  universe?: string[];
  /** How many candidates to run the full agent consult on (bounded). */
  maxCandidates?: number;
  /** How many investments to choose from the scanned set (default: personality). */
  maxPicks?: number;
  /** Explicit per-order USD size; when omitted the agent sizes each pick itself. */
  notional?: number;
  execute?: boolean;
  /** Risk contract the agent trades under; defaults to env, then 'operator'. */
  personality?: PersonalityKey;
};

export type TradingAgentScanRun = {
  mode: 'scan';
  ranAt: string;
  universeSource: CandidateSource;
  /** The risk contract this run traded under. */
  personality: { key: PersonalityKey; name: string; voice: string };
  /** What the agent learned from its own book before this run. */
  trackRecord: { summary: string; disciplineAdjustment: number; lessons: string[] };
  /** Portfolio equity the sizer allocated against. */
  equity: PortfolioEquity;
  /** Every candidate the agents were consulted on. */
  scanned: TickerAnalysis[];
  /** New investments the agent chose. */
  picks: TradingAgentPick[];
  /** Defensive actions on held names (trims/exits on bearish consensus). */
  bookActions: TradingAgentPick[];
  /** Run-level narrative: what was scanned, what the agents said, why the picks won. */
  story: string;
};
