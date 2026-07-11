import { z } from 'zod';

const isoString = z.string().datetime().or(z.string().min(8));
const tickerSchema = z.string().trim().min(1).max(16).transform(value => value.toUpperCase().replace(/-/g, '.'));
const nullableNumber = z.number().finite().nullable().optional().default(null);
const nullableString = z.string().nullable().optional().default(null);

export const impactDirectionSchema = z.enum(['bullish', 'bearish', 'neutral', 'mixed']);
export const alertSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'deferred']);
export const thesisStatusSchema = z.enum(['intact', 'under_review', 'building', 'holding', 'strengthening', 'weakening', 'broken', 'closed']);
export const tradeActionSchema = z.enum(['buy', 'sell', 'hold', 'short', 'cover', 'trim', 'add', 'watch', 'exit']);
export const alertTypeSchema = z.enum([
  'thesis_break',
  'conviction_drop',
  'event_risk',
  'score_change',
  'agent_conflict',
  'approval_needed',
  'weekly_memo',
  'news_shock',
  'macro_shock',
  'world_monitor',
  'earnings_shock',
  'position_monitor',
]);
export const memoryTypeSchema = z.enum([
  'missed_trade',
  'bad_exit',
  'false_positive',
  'false_negative',
  'thesis_failure',
  'successful_setup',
  'process_lesson',
]);

export const evidenceItemSchema = z.object({
  id: z.string().optional(),
  source: z.string().min(1),
  title: z.string().optional(),
  summary: z.string().min(1),
  url: z.string().url().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  impactDirection: impactDirectionSchema.optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export const portfolioPositionSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  ticker: tickerSchema,
  companyName: nullableString,
  shares: nullableNumber,
  notionalExposure: nullableNumber,
  costBasis: nullableNumber,
  currentPrice: nullableNumber,
  targetAllocation: nullableNumber,
  currentAllocation: nullableNumber,
  portfolioTheme: nullableString,
  portfolioRole: nullableString,
  timeHorizon: nullableString,
  status: z.enum(['watch', 'active', 'trimmed', 'exited', 'closed']).default('watch'),
  createdAt: isoString.default(() => new Date().toISOString()),
  updatedAt: isoString.default(() => new Date().toISOString()),
  pmNotes: z.string().optional(),
  approvalStatus: approvalStatusSchema.optional(),
  thesisIntegrity: z.enum(['intact', 'strengthening', 'weakening', 'broken', 'under_review', 'resolved']).optional(),
  agentConsensus: z.enum(['bullish', 'bearish', 'neutral', 'split']).optional(),
  convictionScore: z.number().min(0).max(100).nullable().optional(),
  entryScore: z.number().min(0).max(100).nullable().optional(),
  currentScore: z.number().min(0).max(100).nullable().optional(),
  lastAgentRunAt: z.string().optional(),
  weeklyMemoId: z.string().optional(),
  targetPrice: z.number().nullable().optional(),
  stopLoss: z.number().nullable().optional(),
  entryPrice: z.number().nullable().optional(),
  lastPmAnalysisAt: z.string().nullable().optional(),
});

export const thesisUpdateSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  ticker: tickerSchema,
  thesisId: z.string().nullable().optional().default(null),
  previousThesis: z.string().nullable().optional().default(null),
  newEvidence: z.string().min(1),
  updatedThesis: z.string().min(1),
  convictionBefore: z.number().min(0).max(100).nullable().optional().default(null),
  convictionAfter: z.number().min(0).max(100),
  thesisStatusBefore: thesisStatusSchema.nullable().optional().default(null),
  thesisStatusAfter: thesisStatusSchema,
  changedFactors: z.array(z.string()).default([]),
  shouldNotifyPM: z.boolean().default(false),
  explanation: z.string().min(1),
  source: z.enum(['agent', 'event', 'user', 'score_change', 'manual']).default('manual'),
  createdAt: isoString.default(() => new Date().toISOString()),
});

const researchEvidenceSchema = z.object({
  builtAt: isoString,
  horizonDays: z.number().int().positive(),
  coveragePct: z.number().min(0).max(100),
  degraded: z.boolean(),
  marketRegime: z.string().nullable(),
  available: z.array(z.string()),
  missing: z.array(z.string()),
  warnings: z.array(z.string()),
  sources: z.array(z.object({
    label: z.string().min(1),
    source: z.string().min(1),
    asOf: z.string().nullable(),
  })),
});

export const positionThesisSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  ticker: tickerSchema,
  thesisSummary: z.string().min(1),
  whyWeOwnIt: z.string().min(1),
  addConditions: z.array(z.string()).default([]),
  sellConditions: z.array(z.string()).default([]),
  invalidationConditions: z.array(z.string()).default([]),
  keyRisks: z.array(z.string()).default([]),
  catalysts: z.array(z.string()).default([]),
  convictionScore: z.number().min(0).max(100).default(50),
  thesisStatus: thesisStatusSchema.default('under_review'),
  timeHorizon: nullableString,
  lastReviewedAt: z.string().nullable().optional().default(null),
  createdAt: isoString.default(() => new Date().toISOString()),
  updatedAt: isoString.default(() => new Date().toISOString()),
  status: thesisStatusSchema.optional(),
  integrityStatus: z.enum(['intact', 'strengthening', 'weakening', 'broken', 'under_review', 'resolved']).optional(),
  originalThesis: z.string().optional(),
  currentThesis: z.string().optional(),
  entryScore: z.number().min(0).max(100).optional(),
  currentScore: z.number().min(0).max(100).optional(),
  catalystExpected: z.string().optional(),
  catalystConfirmed: z.boolean().optional(),
  horizon: z.string().optional(),
  primaryDriver: z.string().optional(),
  mainRisk: z.string().optional(),
  history: z.array(thesisUpdateSchema).optional(),
  researchEvidence: researchEvidenceSchema.optional(),
});

export const agentViewSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  ticker: tickerSchema,
  agentName: z.string().min(1),
  stance: z.enum(['bullish', 'bearish', 'neutral', 'mixed']),
  conviction: z.number().min(0).max(100),
  reasoning: z.string().min(1),
  changedSinceLast: z.boolean().default(false),
  evidence: z.array(evidenceItemSchema).default([]),
  createdAt: isoString.default(() => new Date().toISOString()),
  source: z.enum(['hedge_fund', 'tradingagents', 'dexter', 'rank', 'forecast', 'news', 'pm_brain', 'quant', 'world_monitor', 'manual']).optional(),
  positionId: z.string().optional(),
  agentType: z.enum(['hedge_fund', 'tradingagents', 'dexter', 'pm_brain', 'catalyst', 'forecast', 'quant', 'world_monitor']).optional(),
  runAt: z.string().optional(),
  signal: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  confidence: z.number().min(0).max(100).optional(),
  summary: z.string().optional(),
  thesis: z.string().optional(),
  action: tradeActionSchema.optional(),
  sizing: z.string().optional(),
  priceTarget: z.number().nullable().optional(),
  recommendation: tradeActionSchema.nullable().optional(),
  timeHorizon: z.string().nullable().optional(),
  rawOutput: z.record(z.unknown()).optional(),
});

export const investmentDecisionSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  ticker: tickerSchema,
  action: tradeActionSchema,
  recommendation: z.string().min(1),
  approvalStatus: approvalStatusSchema.default('pending'),
  approvedBy: z.string().nullable().optional().default(null),
  rationale: z.string().min(1),
  evidence: z.array(evidenceItemSchema).default([]),
  linkedAlertId: z.string().nullable().optional().default(null),
  confidence: z.number().min(0).max(100).default(50),
  createdAt: isoString.default(() => new Date().toISOString()),
  updatedAt: isoString.default(() => new Date().toISOString()),
  positionId: z.string().optional(),
  recommendedAction: tradeActionSchema.optional(),
  recommendedSizing: z.string().optional(),
  confidenceScore: z.number().min(0).max(100).optional(),
  rationaleText: z.string().optional(),
  agentViewIds: z.array(z.string()).optional(),
  thesisId: z.string().optional(),
  approvedAt: z.string().nullable().optional(),
  approvalNote: z.string().optional(),
  executedAt: z.string().optional(),
  executionNote: z.string().optional(),
});

export const pmAlertSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  ticker: tickerSchema.nullable().optional().default(null),
  alertType: alertTypeSchema,
  severity: alertSeveritySchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  impactDirection: impactDirectionSchema.default('neutral'),
  suggestedAction: z.enum(['review', 'add', 'hold', 'trim', 'exit', 'approve', 'watch']).default('review'),
  confidence: z.number().min(0).max(100).default(50),
  affectedTheme: z.string().nullable().optional().default(null),
  affectedThesis: z.string().nullable().optional().default(null),
  shouldNotifyPM: z.boolean().default(false),
  evidence: z.array(evidenceItemSchema).default([]),
  createdAt: isoString.default(() => new Date().toISOString()),
  resolvedAt: z.string().nullable().optional().default(null),
  body: z.string().optional(),
  category: alertTypeSchema.optional(),
  acknowledged: z.boolean().optional(),
  acknowledgedAt: z.string().optional(),
  linkedDecisionId: z.string().optional(),
});

export const pmMemorySchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  memoryType: memoryTypeSchema,
  lesson: z.string().min(1),
  relatedTickers: z.array(tickerSchema).default([]),
  relatedThemes: z.array(z.string()).default([]),
  importance: z.number().min(0).max(100).default(50),
  createdAt: isoString.default(() => new Date().toISOString()),
});

export const weeklyMemoSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  weekStart: z.string().min(8),
  weekEnd: z.string().min(8),
  portfolioPerformance: z.string().default('No portfolio performance summary recorded.'),
  benchmarkComparison: z.string().nullable().optional().default(null),
  winners: z.array(tickerSchema).default([]),
  losers: z.array(tickerSchema).default([]),
  themePerformance: z.record(z.string()).default({}),
  alertsSummary: z.string().default('No material PM alerts recorded.'),
  thesisChanges: z.array(z.string()).default([]),
  decisionsMade: z.array(z.string()).default([]),
  agentDisagreementSummary: z.string().default('No material agent disagreement recorded.'),
  narrativeSections: z.record(z.string()).default({}),
  generatedAt: isoString.default(() => new Date().toISOString()),
});

export const idPatchSchema = z.object({
  id: z.string().min(1),
  patch: z.record(z.unknown()).default({}),
});

export const tickerQuerySchema = z.object({
  ticker: tickerSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type PortfolioPositionInput = z.infer<typeof portfolioPositionSchema>;
export type PositionThesisInput = z.infer<typeof positionThesisSchema>;
export type AgentViewInput = z.infer<typeof agentViewSchema>;
export type InvestmentDecisionInput = z.infer<typeof investmentDecisionSchema>;
export type PMAlertInput = z.infer<typeof pmAlertSchema>;
export type PMMemoryInput = z.infer<typeof pmMemorySchema>;
export type WeeklyMemoInput = z.infer<typeof weeklyMemoSchema>;
