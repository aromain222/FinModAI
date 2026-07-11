import type { QuantAnalystKey } from '@/lib/pm/monitoring/types';

export type DebateStance = 'bullish' | 'bearish' | 'neutral';
export type DebateChannel = 'estimates' | 'multiple' | 'positioning' | 'risk' | 'catalyst' | 'technical';

export type DebateClaim = {
  id: string;
  statement: string;
  channel: DebateChannel;
  evidenceRefs: string[];
  falsifier: string;
  horizon: string;
};

export type FunctionalMemo = {
  key: QuantAnalystKey;
  name: string;
  stance: DebateStance;
  score: number;
  confidence: number;
  thesis: string;
  reasoning: string;
  claims: DebateClaim[];
  risk: string;
  watch: string;
  missingEvidence: string[];
  degraded: boolean;
  llm?: DebateLlmTelemetry;
};

export type ClaimChallenge = {
  claimId: string;
  verdict: 'supported' | 'weak' | 'unsupported';
  critique: string;
  missingEvidence: string[];
  proposedRevision: string;
};

export type DebateRebuttal = {
  reviewerKey: QuantAnalystKey;
  targetKey: QuantAnalystKey;
  challenges: ClaimChallenge[];
  // claimIds the reviewer referenced that do not exist on the target memo — dropped from
  // `challenges` before it's used, but recorded so callers can flag the hallucination.
  invalidClaimIds: string[];
  revisedStance: DebateStance;
  revisedConfidence: number;
  revisedThesis: string;
  degraded: boolean;
  llm?: DebateLlmTelemetry;
};

export type AdjudicatedClaim = {
  claimId: string;
  score: number;
  accepted: boolean;
  // false when no rebuttal challenged this claim — distinct from a challenge that found it weak.
  reviewed: boolean;
  reason: string;
};

export type DebateAdjudication = {
  action: 'buy' | 'hold' | 'sell' | 'short' | 'cover';
  confidence: number;
  sizing: 'Track' | 'Build' | 'Trim' | 'Exit watch' | 'Avoid';
  decision: 'pass' | 'wait' | 'work_up' | 'pitch_candidate';
  reasoning: string;
  whatIsPriced: string;
  whyNow: string;
  upsidePath: string;
  downsidePath: string;
  confirmation: string;
  invalidation: string;
  disagreements: string[];
  claims: AdjudicatedClaim[];
  degraded: boolean;
  llm?: DebateLlmTelemetry;
};

export type DebateLlmTelemetry = {
  provider: 'anthropic' | 'openai';
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
};

export type DebateRunMetrics = {
  elapsedMs: number;
  modelCalls: number;
  successfulCalls: number;
  degradedCalls: number;
  reportedInputTokens: number;
  reportedOutputTokens: number;
  reportedTotalTokens: number;
  models: string[];
};

export type FunctionalDebateResult = {
  version: 1;
  ticker: string;
  horizonDays: number;
  depth: 'scan' | 'committee';
  ranAt: string;
  memos: FunctionalMemo[];
  rebuttals: DebateRebuttal[];
  adjudication: DebateAdjudication | null;
  degraded: boolean;
  degradedReasons: string[];
  metrics: DebateRunMetrics;
};
