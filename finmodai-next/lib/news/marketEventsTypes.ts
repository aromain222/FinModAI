import { z } from 'zod';

export const marketEventsTimeframeSchema = z.enum(['24h', '7d', '30d']);
export type MarketEventsTimeframe = z.infer<typeof marketEventsTimeframeSchema>;

export const marketEventsViewSchema = z.enum(['active', 'resolved']);
export type MarketEventsView = z.infer<typeof marketEventsViewSchema>;

export const marketEventsProviderSchema = z.enum(['live', 'demo-seed']);
export type MarketEventsProvider = z.infer<typeof marketEventsProviderSchema>;

export const marketEventTypeSchema = z.enum([
  'Geopolitics',
  'Macro',
  'CentralBank',
  'Conflict',
  'Sanctions',
  'EarningsMegaCap',
  'SystemicRisk',
  'RegulatoryShock',
]);
export type MarketEventType = z.infer<typeof marketEventTypeSchema>;

export const marketEventHorizonSchema = z.enum(['Immediate', 'NearTerm', 'Structural']);
export type MarketEventHorizon = z.infer<typeof marketEventHorizonSchema>;

export const marketEventStatusSchema = z.enum(['developing', 'confirmed', 'resolved']);
export type MarketEventStatus = z.infer<typeof marketEventStatusSchema>;

export const marketEventSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.string().datetime(),
  title: z.string().min(1).optional(),
  snippet: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
});
export type MarketEventSource = z.infer<typeof marketEventSourceSchema>;

export const marketImpactSchema = z
  .object({
    equities: z.string().min(1).optional(),
    rates: z.string().min(1).optional(),
    fx: z.string().min(1).optional(),
    oil: z.string().min(1).optional(),
    credit: z.string().min(1).optional(),
    sectors: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      [value.equities, value.rates, value.fx, value.oil, value.credit, value.sectors].some(
        (item) => typeof item === 'string' && item.trim().length > 0
      ),
    { message: 'At least one market impact field is required.' }
  );
export type MarketImpact = z.infer<typeof marketImpactSchema>;

export const marketEventSignalSchema = z.object({
  position: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
  conviction: z.number().min(0).max(1),
  primary_driver: z.string().optional(),
});
export type MarketEventSignal = z.infer<typeof marketEventSignalSchema>;

export const marketEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  eventType: marketEventTypeSchema,
  severity: z.number().int().min(0).max(100),
  horizon: marketEventHorizonSchema,
  drivers: z.array(z.string().min(1)).min(2).max(4),
  marketImpact: marketImpactSchema,
  transmissionPath: z.array(z.string().min(1)).min(1),
  watchNext: z.array(z.string().min(1)).min(1).max(3),
  status: marketEventStatusSchema.default('developing'),
  signal: marketEventSignalSchema.optional(),
  firstSeenAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime(),
  sources: z.array(marketEventSourceSchema).min(1).max(8),
});
export type MarketEvent = z.infer<typeof marketEventSchema>;

export const marketEventsApiResponseSchema = z.object({
  ok: z.boolean(),
  view: marketEventsViewSchema,
  provider: marketEventsProviderSchema,
  fallback: z.boolean().default(false),
  events: z.array(marketEventSchema),
  warning: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  diagnostics: z
    .object({
      fetched: z.number().int().min(0),
      deduped: z.number().int().min(0).optional(),
      gated: z.number().int().min(0),
      clustered: z.number().int().min(0),
      classified: z.number().int().min(0),
      stored: z.number().int().min(0),
      returned: z.number().int().min(0).optional(),
      lastFetchAt: z.string().datetime().optional(),
      cacheHit: z.boolean(),
      openaiCallCount: z.number().int().min(0),
      openaiErrors: z.array(z.string()),
      schemaParseFailures: z.number().int().min(0),
      fetchedSampleIds: z.array(z.string()).optional(),
      gatedSampleIds: z.array(z.string()).optional(),
      clusteredSampleIds: z.array(z.string()).optional(),
      classifiedSampleIds: z.array(z.string()).optional(),
      persistedSampleIds: z.array(z.string()).optional(),
      classifierRawSamples: z.array(z.string()).optional(),
    })
    .optional(),
});
export type MarketEventsApiResponse = z.infer<typeof marketEventsApiResponseSchema>;
