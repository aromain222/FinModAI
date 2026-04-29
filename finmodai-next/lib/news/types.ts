import { z } from 'zod';

export const newsRangeSchema = z.enum(['1D', '3D', '1W', '1M']);
export type NewsRange = z.infer<typeof newsRangeSchema>;

export const newsTopicSchema = z.enum([
  'all',
  'policy',
  'rates',
  'inflation',
  'energy',
  'fx',
  'equities',
]);
export type NewsTopic = z.infer<typeof newsTopicSchema>;

export const newsItemSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  url: z.string().url(),
  published_at: z.string().datetime(),
  tags: z.array(z.string()).optional(),
});
export type NewsItem = z.infer<typeof newsItemSchema>;

export const headlineItemSchema = newsItemSchema;
export type HeadlineItem = z.infer<typeof headlineItemSchema>;

export const normalizedNewsItemSchema = newsItemSchema.extend({
  ai_summary: z.string().nullable(),
  affected_tickers: z.array(z.string()).nullable(),
  affected_sectors: z.array(z.string()).nullable(),
});
export type NormalizedNewsItem = z.infer<typeof normalizedNewsItemSchema>;

export const headlinesResponseSchema = z.object({
  items: z.array(newsItemSchema),
  provider: z.enum(['perigon', 'polygon', 'alphavantage', 'benzinga', 'eodhd', 'newsapi', 'finnhub', 'supabase', 'demo', 'none']),
  error: z.string().optional(),
});
export type HeadlinesResponse = z.infer<typeof headlinesResponseSchema>;

export const impactDirectionSchema = z.enum(['up', 'down', 'mixed', 'unknown']);
export type ImpactDirection = z.infer<typeof impactDirectionSchema>;

export const sectorNameSchema = z.enum([
  'Technology',
  'Financials',
  'Energy',
  'Industrials',
  'Healthcare',
  'Consumer Discretionary',
  'Consumer Staples',
  'Materials',
  'Utilities',
  'Real Estate',
  'Communication Services',
]);
export type SectorName = z.infer<typeof sectorNameSchema>;

export const impactedSectorSchema = z.object({
  sector: sectorNameSchema,
  direction: impactDirectionSchema,
  rationale: z.string().optional(),
});
export type ImpactedSector = z.infer<typeof impactedSectorSchema>;

export const impactedTickerSchema = z.object({
  ticker: z.string().min(1),
  direction: impactDirectionSchema,
  rationale: z.string().optional(),
});
export type ImpactedTicker = z.infer<typeof impactedTickerSchema>;

export const eventSourceSchema = z.object({
  source: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  published_at: z.string().datetime(),
});
export type EventSource = z.infer<typeof eventSourceSchema>;

export const modelImpactSchema = z.object({
  event_label: z.string(),
  subject: z.string(),
  type: z.enum(['earnings', 'macro', 'geopolitics', 'regulatory', 'systemic']),
  direction: z.enum(['positive', 'negative']),
  impact_type: z.enum(['growth', 'margin', 'risk']),
  probability: z.number().min(0).max(1),
  horizon: z.enum(['intraday', 'short_term', 'medium_term']),
  revenue_growth_delta: z.number(),
  margin_delta: z.number(),
  discount_rate_delta: z.number(),
  primary_driver: z.enum(['growth', 'margin', 'discount_rate']),
});
export type ModelImpact = z.infer<typeof modelImpactSchema>;

export const eventExtractionSchema = z.object({
  event_label: z.string().min(1),
  subject: z.string().min(1),
  type: z.enum(['earnings', 'macro', 'geopolitics', 'regulatory', 'systemic']),
  direction: z.enum(['positive', 'negative']),
  impact_type: z.enum(['growth', 'margin', 'risk']),
  valid: z.boolean().optional().default(true),
});

const scenarioCaseSchema = z.object({
  probability: z.number().min(0).max(1),
  expected_direction: z.string().min(1),
  magnitude: z.number(),
});

export const tradingSignalSchema = z.object({
  mode: z.enum(['EVENT_ANALYSIS', 'MODEL_ANALYSIS', 'WHAT_IF_SIMULATION']),
  event: z.string().default(''),
  type: z.enum(['earnings', 'macro', 'regulatory', 'management']).optional(),
  impact_type: z.enum(['growth', 'margin', 'risk']).optional(),
  direction: z.enum(['positive', 'negative']).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  confidence: z.number().min(0).max(1),
  model_impact: z.object({
    growth_delta: z.number(),
    margin_delta: z.number(),
    discount_rate_delta: z.number(),
    primary_driver: z.string(),
  }).optional(),
  what_if: z.object({
    variable: z.string(),
    delta: z.number(),
    valuation_change: z.number(),
  }).optional(),
  scenarios: z.object({
    bull: z.object({ probability: z.number().min(0).max(1), impact: z.number() }),
    base: z.object({ probability: z.number().min(0).max(1), impact: z.number() }),
    bear: z.object({ probability: z.number().min(0).max(1), impact: z.number() }),
  }).optional(),
  signal: z.object({
    position: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
    conviction: z.number().min(0).max(1),
    size_pct: z.number().min(0),
    primary_driver: z.string(),
  }).optional(),
  model_analysis: z.object({
    key_driver: z.string(),
    risks: z.array(z.string()),
    insight: z.string(),
  }).optional(),
});
export type TradingSignalItem = z.infer<typeof tradingSignalSchema>;

export const eventItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  what_happened: z.string().min(1),
  ai_summary: z.string().min(1),
  why_it_matters: z.string().min(1),
  impacted_sectors: z.array(impactedSectorSchema),
  impacted_tickers: z.array(impactedTickerSchema),
  watch_items: z.array(z.string().min(1)).min(1).max(6),
  sources: z.array(eventSourceSchema).min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  published_at: z.string().datetime(),
  model_impact: modelImpactSchema.optional(),
  event_extraction: eventExtractionSchema.optional(),
  trading_signal: tradingSignalSchema.optional(),
  tags: z.array(z.string()).optional(),
});
export type EventItem = z.infer<typeof eventItemSchema>;

export const eventsResponseSchema = z.object({
  events: z.array(eventItemSchema),
  error: z.string().optional(),
});
export type EventsResponse = z.infer<typeof eventsResponseSchema>;

export const headlineEnrichmentSchema = z.object({
  ai_summary: z.string().nullable(),
  why_it_matters: z.string().nullable(),
  impacted_sectors: z.array(impactedSectorSchema),
  impacted_tickers: z.array(impactedTickerSchema),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type HeadlineEnrichment = z.infer<typeof headlineEnrichmentSchema>;

export const newsTypeSchema = z.enum(['headlines', 'events']);
export type NewsType = z.infer<typeof newsTypeSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  provider: z.enum(['perigon', 'polygon', 'alphavantage', 'benzinga', 'eodhd', 'newsapi', 'finnhub', 'supabase', 'demo', 'none']).nullable(),
  message: z.string(),
  env: z.string().optional(),
  details: z.string().optional(),
});
export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;

export const unifiedNewsApiResponseSchema = z.object({
  items: z.array(normalizedNewsItemSchema).optional(),
  events: z.array(eventItemSchema).optional(),
  provider: z.enum(['perigon', 'polygon', 'alphavantage', 'benzinga', 'eodhd', 'newsapi', 'finnhub', 'supabase', 'demo', 'none']),
  fallback_active: z.boolean().optional(),
  error: apiErrorSchema.optional(),
});
export type UnifiedNewsApiResponse = z.infer<typeof unifiedNewsApiResponseSchema>;
