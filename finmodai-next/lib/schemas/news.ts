import { z } from 'zod';

export const NewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string(),
  publishedAt: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
  tickers: z.array(z.string()),
  sentiment: z.enum(['pos', 'neg', 'neu']).optional(),
});

export const NewsResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    items: z.array(NewsItemSchema),
  }),
  meta: z.object({
    source: z.string(),
    stale: z.boolean(),
    fetchedAt: z.string(),
    traceId: z.string(),
    reason: z.string().optional(),
  }),
});

export const NewsErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  meta: z.object({
    traceId: z.string(),
  }),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;
