import { z } from 'zod';

export const MarketHeadlineSchema = z.object({
  title: z.string(),
  source: z.string(),
  url: z.string().url().optional(),
  publishedAt: z.string(),
  symbols: z.array(z.string()).optional(),
  sentiment: z.enum(['pos', 'neg', 'neu']).optional(),
  summary: z.string().optional(),
});

export const MarketIndexPointSchema = z.object({
  t: z.string(), // ISO
  v: z.number(),
});

export const MarketIndexSeriesSchema = z.object({
  symbol: z.string(),
  points: z.array(MarketIndexPointSchema),
  interval: z.enum(['1d', '1w', '1m', '3m', '1y', '5y']),
});

export const MarketPulseSchema = z.object({
  asOf: z.string(),
  breadth: z.object({
    advancers: z.number(),
    decliners: z.number(),
  }),
  vol: z.object({
    vix: z.number().optional(),
  }),
  rates: z
    .object({
      twoY: z.number().optional(),
      tenY: z.number().optional(),
    })
    .optional(),
  notes: z.array(z.string()).optional(),
});

export type MarketHeadline = z.infer<typeof MarketHeadlineSchema>;
export type MarketIndexPoint = z.infer<typeof MarketIndexPointSchema>;
export type MarketIndexSeries = z.infer<typeof MarketIndexSeriesSchema>;
export type MarketPulse = z.infer<typeof MarketPulseSchema>;
