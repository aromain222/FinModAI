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

import type { ActivePosition, ThesisDrift } from '@/lib/portfolio/types';

// ── Enumerations ───────────────────────────────────────────────────────────────

/** Severity levels for PM alerts, ordered highest to lowest. */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Trade action a PM can take on a position recommendation. */
export type TradeAction = 'buy' | 'sell' | 'hold' | 'short' | 'cover' | 'trim' | 'add';

/** Lifecycle status of a PM approval request. */
export type PMApprovalStatus = 'pending' | 'approved' | 'rejected' | 'deferred';

/**
 * Integrity of a position thesis relative to the original investment case.
 * Set by the PM Brain when comparing new evidence to original thesis.
 */
export type ThesisIntegrityStatus = 'intact' | 'degrading' | 'broken' | 'resolved';

/**
 * Current state of the investment thesis lifecycle.
 * Extends the simpler ThesisDrift from lib/portfolio/types.ts with full lifecycle states.
 */
export type ThesisStatus =
  | 'building'       // position entered, thesis being established
  | 'holding'        // thesis intact, no new material evidence
  | 'strengthening'  // evidence supports original case
  | 'weakening'      // evidence undermines original case
  | 'broken'         // original thesis no longer supportable
  | 'closed';        // position exited, thesis archived

// ── Portfolio position (PM OS view) ──────────────────────────────────────────

/**
 * PM OS view of a portfolio position.
 * Extends ActivePosition with PM OS-specific fields for approval,
 * thesis integrity, and agent consensus tracking.
 */
export type PortfolioPosition = ActivePosition & {
  /** Optional PM notes that don't belong in the thesis narrative. */
  pmNotes?: string;
  /** Whether this position's last InvestmentDecision has been approved. */
  approvalStatus: PMApprovalStatus;
  /** Current integrity of the original investment thesis. */
  thesisIntegrity: ThesisIntegrityStatus;
  /** Aggregate signal across the most recent agent views for this ticker. */
  agentConsensus?: 'bullish' | 'bearish' | 'neutral' | 'split';
  /** ISO timestamp of the last hedge-fund or tradingagents run for this ticker. */
  lastAgentRunAt?: string;
  /** ID of the weekly memo that last referenced this position. */
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
  positionId: string;
  createdAt: string;
  updatedAt: string;
  status: ThesisStatus;
  integrityStatus: ThesisIntegrityStatus;
  thesisDrift: ThesisDrift;

  /** The thesis as written at position entry — immutable after creation. */
  originalThesis: string;
  /** The current thesis, updated as evidence accumulates. */
  currentThesis: string;

  entryScore: number;
  currentScore: number;

  /** Catalyst that the original thesis depended on. */
  catalystExpected: string;
  /** Whether the expected catalyst has materially occurred. */
  catalystConfirmed: boolean;

  horizon: string;
  primaryDriver: string;
  mainRisk: string;

  /** Ordered evidence trail — each entry records what changed and why. */
  history: ThesisUpdate[];
};

/**
 * One atomic update to a position thesis.
 * Records the before/after state and the evidence that triggered the change.
 */
export type ThesisUpdate = {
  id: string;
  createdAt: string;
  /** Previous thesis text before this update. */
  previousThesis: string;
  /** The new evidence or event that prompted the update. */
  newEvidence: string;
  /** Updated thesis text after incorporating the new evidence. */
  updatedThesis: string;
  scoreBefore: number;
  scoreAfter: number;
  integrityBefore: ThesisIntegrityStatus;
  integrityAfter: ThesisIntegrityStatus;
  /** What triggered this update. */
  triggeredBy: 'agent' | 'user' | 'event' | 'score_change';
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
  /** Associated position ID, if this was run in context of an open position. */
  positionId?: string;
  agentType: 'hedge_fund' | 'tradingagents' | 'dexter' | 'pm_brain' | 'catalyst' | 'forecast';
  runAt: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  /** 0–100 confidence from the agent output. */
  confidence: number;
  /** Short summary of the agent's read (1–2 sentences). */
  summary: string;
  /** Full thesis string if the agent produced one. */
  thesis?: string;
  /** Recommended trade action if the agent produced one. */
  action?: TradeAction;
  /** Sizing recommendation (Track / Build / Trim / Exit / Avoid). */
  sizing?: string;
  /** Price target anchored to live price at run time. */
  priceTarget?: number | null;
  /** Time horizon string from the agent output. */
  timeHorizon?: string;
  /** Full raw JSON output for reference (not displayed in UI). */
  rawOutput?: Record<string, unknown>;
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

  recommendedAction: TradeAction;
  /** Sizing recommendation from the agent (Track / Build / Trim / Exit / Avoid). */
  recommendedSizing?: string;
  /** 0–100 confidence in the recommendation. */
  confidence: number;

  /** Human-readable rationale for the recommendation. */
  rationale: string;
  /** IDs of AgentView records that support this decision. */
  agentViewIds: string[];
  thesisId?: string;

  approvalStatus: PMApprovalStatus;
  approvedAt?: string;
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
  ticker?: string;
  positionId?: string;
  createdAt: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  category:
    | 'thesis_break'      // ThesisIntegrityStatus changed to 'broken'
    | 'conviction_drop'   // agent consensus flipped bearish
    | 'event_risk'        // macro event within 5 days with position exposure
    | 'score_change'      // score delta ≥ 0.8 since last PM review
    | 'agent_conflict'    // hedge-fund and tradingagents signals disagree
    | 'approval_needed'   // new InvestmentDecision awaiting PM sign-off
    | 'weekly_memo';      // weekly memo generated and ready
  acknowledged: boolean;
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
  /** ISO date string for the Sunday ending this week. */
  weekEnding: string;
  generatedAt: string;

  /** 2–3 sentence portfolio-level summary. */
  portfolioSummary: string;
  /** Tickers where thesis was confirmed this week. */
  topPerformers: string[];
  /** Tickers where thesis is weakening or broken. */
  laggards: string[];
  /** Positions where thesis broke this week and reason. */
  thesisBreaks: string[];
  /** Positions where a key catalyst confirmed the original thesis. */
  thesisConfirmations: string[];

  /** Notable agent consensus shifts or conflicts during the week. */
  agentHighlights: string;
  /** Macro context: events that fired, how they resolved. */
  macroContext: string;

  /** InvestmentDecision IDs actioned this week. */
  decisions: string[];
  /** InvestmentDecision IDs still pending approval. */
  openApprovals: string[];

  /** Tickers to monitor closely in the coming week. */
  nextWeekWatchlist: string[];

  /** Raw section text keyed by section name, for reference and re-rendering. */
  rawSections: Record<string, string>;
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
