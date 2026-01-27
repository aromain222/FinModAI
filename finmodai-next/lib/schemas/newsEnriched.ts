import { z } from 'zod';
import { NewsItemSchema } from '@/lib/schemas/news';

export const NewsImpactMoveSchema = z.object({
  symbol: z.string(),
  pct: z.number().nullable(),
  fromTs: z.string().nullable(),
  toTs: z.string().nullable(),
});

export const NewsImpactSchema = z.object({
  baseline: z.object({
    method: z.string(),
    label: z.string(),
    fromTs: z.string().nullable(),
    toTs: z.string().nullable(),
  }),
  window: z.string(),
  benchmarkSymbol: z.string(),
  benchmarkPct: z.number().nullable(),
  moves: z.array(NewsImpactMoveSchema),
});

export const EnrichedNewsItemSchema = NewsItemSchema.extend({
  impact: NewsImpactSchema,
  rankScore: z.number(),
});

export type NewsImpactMove = z.infer<typeof NewsImpactMoveSchema>;
export type NewsImpact = z.infer<typeof NewsImpactSchema>;
export type EnrichedNewsItem = z.infer<typeof EnrichedNewsItemSchema>;

