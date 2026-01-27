import { z } from 'zod';

export const TopStoryImpactSchema = z.enum(['low', 'med', 'high']);
export type TopStoryImpact = z.infer<typeof TopStoryImpactSchema>;

export const TopStoryWindowSchema = z.enum(['1D', '1W']);
export type TopStoryWindow = z.infer<typeof TopStoryWindowSchema>;

export const TopStoryAffectedSchema = z.object({
  ticker: z.string(),
  reason: z.string(),
  movePct: z.number().nullable(),
  window: TopStoryWindowSchema,
  provider: z.string(),
});
export type TopStoryAffected = z.infer<typeof TopStoryAffectedSchema>;

export const TopStoryBenchmarkSchema = z.object({
  ticker: z.literal('SPY'),
  movePct: z.number().nullable(),
  window: TopStoryWindowSchema,
  provider: z.string(),
});
export type TopStoryBenchmark = z.infer<typeof TopStoryBenchmarkSchema>;

export const TopStoryMetaSchema = z.object({
  sourceUsed: z.string(),
  warnings: z.array(z.string()),
  debugScore: z.number().optional(),
});
export type TopStoryMeta = z.infer<typeof TopStoryMetaSchema>;

export const TopStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string(),
  publishedAt: z.string(),
  summary: z.string(),
  impact: TopStoryImpactSchema,
  sectorTags: z.array(z.string()).max(3).optional(),
  impactDirection: z.enum(['up', 'down', 'unclear']).optional(),
  whyItMatters: z.string().max(220).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  affected: z.array(TopStoryAffectedSchema),
  benchmark: TopStoryBenchmarkSchema,
  meta: TopStoryMetaSchema,
});
export type TopStory = z.infer<typeof TopStorySchema>;

export const TopStoriesResponseSchema = z.object({
  ok: z.boolean(),
  source: z.string(),
  updatedAt: z.string(),
  range: TopStoryWindowSchema,
  items: z.array(TopStorySchema),
  warnings: z.array(z.string()),
  meta: z
    .object({
      traceId: z.string(),
      fetchedAt: z.string(),
      providers: z.record(z.any()).optional(),
      counts: z.any().optional(),
    })
    .optional(),
});
export type TopStoriesResponse = z.infer<typeof TopStoriesResponseSchema>;
