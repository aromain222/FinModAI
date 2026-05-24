/**
 * PM OS — Shared Types
 *
 * Portfolio Manager Operating System layer. Consumes structured outputs from
 * the Intelligence Engine (lib/ranking, lib/analyst, app/api/hedge-fund,
 * app/api/tradingagents) and turns them into persistent investment workflows.
 *
 * Do NOT redefine types that already exist:
 *   - ActivePosition    → lib/portfolio/types.ts
 *   - Position          → lib/trading/positions.ts
 *   - ThesisDrift       → lib/portfolio/types.ts
 *   - RankedStock       → lib/ranking/types.ts
 *
 * Import and extend those; define only PM OS-specific types here.
 */

import type { ThesisDrift } from '@/lib/portfolio/types';
import type { Signal } from '@/lib/ranking/types';

// ── Enumerations ───────────────────────────────────────────────────────────────

/** Severity levels for PM alerts, ordered highest to lowest. */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Trade action a PM can take on a position recommendation. */
export type TradeAction = 'buy' | 'sell' | 'hold' | 'short' | 'cover' | 'trim' | 'add' | 'watch' | 'exit';

/** Lifecycle status of a PM approval request. */
export type PMApprovalStatus = 'pending' | 'approved' | 'rejected' | 'deferred';

/**
 * Integrity of a position thesis relative to the original investment case.
 * Set by the PM Brain when comparing new evidence to original thesis.
 */
export type ThesisIntegrityStatus = 'intact' | 'strengthening' | 'weakening' | 'broken' | 'under_review' | 'resolved';

/**
 * Current state of the investment thesis lifecycle.
 * Extends the simpler ThesisDrift from lib/portfolio/types.ts with full lifecycle states.
 */
export type ThesisStatus =
  | 'intact'
  | 'under_review'
  | 'building'       // position entered, thesis being established
  | 'holding'        // thesis intact, no new material evidence
  | 'strengthening'  // evidence supports original case
  | 'weakening'      // evidence undermines original case
  | 'broken'         // original thesis no longer supportable
  | 'closed';        // position exited, thesis archived

export type ImpactDirection = 'bullish' | 'bearish' | 'neutral' | 'mixed';

export type PMAlertType =
  | 'thesis_break'
  | 'conviction_drop'
  | 'event_risk'
  | 'score_change'
  | 'agent_conflict'
  | 'approval_needed'
  | 'weekly_memo'
  | 'news_shock'
  | 'macro_shock'
  | 'earnings_shock';

export type MemoryType =
  | 'missed_trade'
  | 'bad_exit'
  | 'false_positive'
  | 'false_negative'
  | 'thesis_failure'
  | 'successful_setup'
  | 'process_lesson';

export type EvidenceItem = {
  id?: string;
  source: string;
  title?: string;
  summary: string;
  url?: string | null;
  publishedAt?: string | null;
  impactDirection?: ImpactDirection;
  confidence?: number;
};

// ── Portfolio position (PM OS view) ──────────────────────────────────────────

/**
 * PM OS view of a portfolio position.
 * Extends ActivePosition with PM OS-specific fields for approval,
 * thesis integrity, and agent consensus tracking.
 */
export type PortfolioPosition = {
  id: string;
  ticker: string;
  companyName: string | null;
  shares: number | null;
  notionalExposure: number | null;
  costBasis: number | null;
  currentPrice: number | null;
  targetAllocation: number | null;
  currentAllocation: number | null;
  portfolioTheme: string | null;
  portfolioRole: string | null;
  timeHorizon: string | null;
  status: 'watch' | 'active' | 'trimmed' | 'exited' | 'closed';
  createdAt: string;
  updatedAt: string;
  pmNotes?: string;
  approvalStatus?: PMApprovalStatus;
  thesisIntegrity?: ThesisIntegrityStatus;
  agentConsensus?: 'bullish' | 'bearish' | 'neutral' | 'split';
  lastAgentRunAt?: string;
  weeklyMemoId?: string;
};

// ── Thesis types ──────────────────────────────────────────────────────────────

/**
 * The living thesis document for an open position.
 * Original thesis is preserved; updates are appended via ThesisUpdate records.
 * Never overwrite originalThesis once set.
 */
export type PositionThesis = {
  id: string;
  ticker: string;
  positionId?: string;
  createdAt: string;
  updatedAt: string;
  status?: ThesisStatus;
  integrityStatus?: ThesisIntegrityStatus;
  thesisDrift?: ThesisDrift;

  /** The thesis as written at position entry — immutable after creation. */
  originalThesis?: string;
  /** The current thesis, updated as evidence accumulates. */
  currentThesis?: string;

  thesisSummary: string;
  whyWeOwnIt: string;
  addConditions: string[];
  sellConditions: string[];
  invalidationConditions: string[];
  keyRisks: string[];
  catalysts: string[];
  convictionScore: number;
  thesisStatus: ThesisStatus;
  timeHorizon: string | null;
  lastReviewedAt: string | null;

  entryScore?: number;
  currentScore?: number;

  /** Catalyst that the original thesis depended on. */
  catalystExpected?: string;
  /** Whether the expected catalyst has materially occurred. */
  catalystConfirmed?: boolean;

  horizon?: string;
  primaryDriver?: string;
  mainRisk?: string;

  /** Ordered evidence trail — each entry records what changed and why. */
  history?: ThesisUpdate[];
};

/**
 * One atomic update to a position thesis.
 * Records the before/after state and the evidence that triggered the change.
 */
export type ThesisUpdate = {
  id: string;
  ticker: string;
  thesisId: string | null;
  createdAt: string;
  /** Previous thesis text before this update. */
  previousThesis: string | null;
  /** The new evidence or event that prompted the update. */
  newEvidence: string;
  /** Updated thesis text after incorporating the new evidence. */
  updatedThesis: string;
  scoreBefore?: number;
  scoreAfter?: number;
  convictionBefore: number | null;
  convictionAfter: number;
  integrityBefore?: ThesisIntegrityStatus;
  integrityAfter?: ThesisIntegrityStatus;
  thesisStatusBefore: ThesisStatus | null;
  thesisStatusAfter: ThesisStatus;
  changedFactors: string[];
  shouldNotifyPM: boolean;
  explanation: string;
  /** What triggered this update. */
  triggeredBy?: 'agent' | 'user' | 'event' | 'score_change';
  /** Identifier of the triggering source (agent run ID, event name, etc). */
  source?: string;
};

// ── Agent memory types ─────────────────────────────────────────────────────────

/**
 * Persisted record of one agent run for a ticker.
 * Created after every hedge-fund or tradingagents run so the PM OS
 * can reason about conviction drift over time.
 */
export type AgentView = {
  id: string;
  ticker: string;
  agentName: string;
  stance: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  conviction: number;
  reasoning: string;
  changedSinceLast: boolean;
  evidence: EvidenceItem[];
  createdAt: string;
  /** Associated position ID, if this was run in context of an open position. */
  positionId?: string;
  agentType?: 'hedge_fund' | 'tradingagents' | 'dexter' | 'pm_brain' | 'catalyst' | 'forecast';
  runAt?: string;
  signal?: 'bullish' | 'bearish' | 'neutral';
  /** 0–100 confidence from the agent output. */
  confidence?: number;
  /** Short summary of the agent's read (1–2 sentences). */
  summary?: string;
  /** Full thesis string if the agent produced one. */
  thesis?: string;
  /** Recommended trade action if the agent produced one. */
  action?: TradeAction;
  /** Sizing recommendation (Track / Build / Trim / Exit / Avoid). */
  sizing?: string;
  /** Price target anchored to live price at run time. */
  priceTarget?: number | null;
  /** Time horizon string from the agent output. */
  timeHorizon?: string | null;
  /** Full raw JSON output for reference (not displayed in UI). */
  rawOutput?: Record<string, unknown>;
  source?: 'hedge_fund' | 'tradingagents' | 'dexter' | 'rank' | 'forecast' | 'news' | 'pm_brain' | 'manual';
  recommendation?: TradeAction | null;
};

/**
 * A recorded change in conviction level for a ticker.
 * Generated by the PM Brain when consecutive AgentViews show a signal flip.
 */
export type ConvictionChange = {
  id: string;
  ticker: string;
  positionId?: string;
  recordedAt: string;
  /** Conviction level before the change (0–100). */
  fromLevel: number;
  /** Conviction level after the change (0–100). */
  toLevel: number;
  delta: number;
  reason: string;
  triggeredBy: 'agent_run' | 'thesis_update' | 'score_change' | 'event' | 'manual';
};

// ── Decision types ─────────────────────────────────────────────────────────────

/**
 * A PM OS investment recommendation awaiting human approval.
 * Generated by the PM Brain; not actionable until approvalStatus === 'approved'.
 */
export type InvestmentDecision = {
  id: string;
  ticker: string;
  positionId?: string;
  createdAt: string;
  updatedAt: string;

  action: TradeAction;
  recommendation: string;
  /** PM approval is required before this is actionable. */
  approvalStatus: PMApprovalStatus;
  approvedBy: string | null;
  rationale: string;
  evidence: EvidenceItem[];
  linkedAlertId: string | null;
  confidence: number;

  recommendedAction?: TradeAction;
  /** Sizing recommendation from the agent (Track / Build / Trim / Exit / Avoid). */
  recommendedSizing?: string;
  /** 0–100 confidence in the recommendation. */
  confidenceScore?: number;

  /** Human-readable rationale for the recommendation. */
  rationaleText?: string;
  /** IDs of AgentView records that support this decision. */
  agentViewIds?: string[];
  thesisId?: string;

  approvedAt?: string | null;
  approvalNote?: string;

  /** When the PM executed the decision after approval. */
  executedAt?: string;
  executionNote?: string;
};

// ── Alert types ────────────────────────────────────────────────────────────────

/**
 * A PM OS alert surfaced to the PM dashboard.
 * Generated by the Alert Engine from threshold rules.
 */
export type PMAlert = {
  id: string;
  /** Ticker this alert relates to, if position-specific. */
  ticker: string | null;
  positionId?: string;
  createdAt: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  impactDirection: ImpactDirection;
  suggestedAction: 'review' | 'add' | 'hold' | 'trim' | 'exit' | 'approve' | 'watch';
  confidence: number;
  affectedTheme: string | null;
  affectedThesis: string | null;
  shouldNotifyPM: boolean;
  evidence: EvidenceItem[];
  resolvedAt: string | null;
  body?: string;
  alertType: PMAlertType;
  category?: PMAlertType;
  acknowledged?: boolean;
  acknowledgedAt?: string;
  /** ID of the InvestmentDecision this alert links to, if approval_needed. */
  linkedDecisionId?: string;
};

// ── Report types ───────────────────────────────────────────────────────────────

/**
 * A structured weekly PM memo.
 * Generated from persisted PM OS data — not from new agent calls.
 */
export type WeeklyMemo = {
  id: string;
  weekStart: string;
  weekEnd: string;
  portfolioPerformance: string;
  benchmarkComparison: string | null;
  winners: string[];
  losers: string[];
  themePerformance: Record<string, string>;
  alertsSummary: string;
  thesisChanges: string[];
  decisionsMade: string[];
  agentDisagreementSummary: string;
  narrativeSections: Record<string, string>;
  generatedAt: string;

  /** ISO date string for the Sunday ending this week. */
  weekEnding?: string;

  /** 2–3 sentence portfolio-level summary. */
  portfolioSummary?: string;
  /** Tickers where thesis was confirmed this week. */
  topPerformers?: string[];
  /** Tickers where thesis is weakening or broken. */
  laggards?: string[];
  /** Positions where thesis broke this week and reason. */
  thesisBreaks?: string[];
  /** Positions where a key catalyst confirmed the original thesis. */
  thesisConfirmations?: string[];

  /** Notable agent consensus shifts or conflicts during the week. */
  agentHighlights?: string;
  /** Macro context: events that fired, how they resolved. */
  macroContext?: string;

  /** InvestmentDecision IDs actioned this week. */
  decisions?: string[];
  /** InvestmentDecision IDs still pending approval. */
  openApprovals?: string[];

  /** Tickers to monitor closely in the coming week. */
  nextWeekWatchlist?: string[];

  /** Raw section text keyed by section name, for reference and re-rendering. */
  rawSections?: Record<string, string>;
};

export type PMMemory = {
  id: string;
  memoryType: MemoryType;
  lesson: string;
  relatedTickers: string[];
  relatedThemes: string[];
  importance: number;
  createdAt: string;
};

export type ThesisUpdateInput = {
  ticker: string;
  newEvidence: string;
  newThesisSummary?: string;
  convictionScore?: number;
  agentViews?: AgentView[];
  evidence?: EvidenceItem[];
  source?: 'agent' | 'event' | 'user' | 'score_change' | 'manual';
};

export type ThesisUpdateResult = {
  previousThesis: PositionThesis | null;
  updatedThesis: PositionThesis;
  update: ThesisUpdate;
  convictionDelta: number | null;
  changedFactors: string[];
  shouldNotifyPM: boolean;
  alert?: PMAlert | null;
};

export type InterpretableEvent = {
  id?: string;
  title: string;
  summary: string;
  source?: string;
  url?: string | null;
  publishedAt?: string | null;
  eventType?: 'market' | 'news' | 'macro' | 'earnings' | 'agent' | 'portfolio';
  tickers?: string[];
  themes?: string[];
  impactDirection?: ImpactDirection;
  severityHint?: AlertSeverity;
  confidence?: number;
  materiality?: number;
  urgency?: number;
};

export type EventInterpretation = {
  material: boolean;
  reason: string;
  alerts: PMAlert[];
};

export type WeeklyMemoSection = {
  title: string;
  body: string;
  tickers?: string[];
  themes?: string[];
};

export type OpportunityScoreSnapshot = {
  ticker: string;
  score: number;
  signal: Signal;
  scoredAt: string;
  primaryReason?: string;
  mainRisk?: string;
};

// ── Portfolio theme types ──────────────────────────────────────────────────────

/**
 * A thematic grouping of positions sharing a macro narrative or sector thesis.
 * Used to track portfolio concentration and shared risk.
 */
export type PortfolioTheme = {
  id: string;
  name: string;
  description: string;
  /** Tickers belonging to this theme. */
  tickers: string[];
  createdAt: string;
  updatedAt: string;

  /** The macro or sector thesis driving this theme. */
  thesis: string;
  /** Investment horizon for the theme (e.g., "4–8 weeks"). */
  horizon: string;
  status: 'active' | 'monitoring' | 'exited';

  /** Aggregate signal across all positions in this theme. */
  aggregateSignal?: 'bullish' | 'mixed' | 'bearish';
  /** Macro tailwind supporting the theme (e.g., "AI capex cycle"). */
  macroTailwind?: string;
  /** Shared risk across all positions in this theme. */
  sharedRisk?: string;
};
