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
