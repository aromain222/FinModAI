import { z } from 'zod';

export const EventIntelligenceRangeSchema = z.enum(['1D', '1W', '1M']);
export type EventIntelligenceRange = z.infer<typeof EventIntelligenceRangeSchema>;

export const EventIntelligenceRegionSchema = z.enum(['global', 'us']);
export type EventIntelligenceRegion = z.infer<typeof EventIntelligenceRegionSchema>;

export const DirectionSchema = z.enum(['up', 'down', 'flat']);
export type Direction = z.infer<typeof DirectionSchema>;

export const MarketImpactSchema = z.object({
  risk: DirectionSchema,
  vol: DirectionSchema,
  rates: DirectionSchema,
  usd: DirectionSchema,
  commodities: DirectionSchema,
});
export type MarketImpact = z.infer<typeof MarketImpactSchema>;

export const SectorImpactSchema = z.object({
  sector: z.string().min(1),
  direction: DirectionSchema,
  confidence: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(180),
});
export type SectorImpact = z.infer<typeof SectorImpactSchema>;

export const TickerImpactSchema = z.object({
  ticker: z.string().min(1),
  direction: DirectionSchema,
  confidence: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(180),
});
export type TickerImpact = z.infer<typeof TickerImpactSchema>;

export const EventScenarioSchema = z.object({
  name: z.string().min(1),
  probability: z.number().int().min(0).max(100),
  implication: z.string().min(1).max(240),
});
export type EventScenario = z.infer<typeof EventScenarioSchema>;

export const EventItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    occurredAt: z.string().min(1),
    region: EventIntelligenceRegionSchema,
    category: z.string().min(1),
    headlineCount: z.number().int().min(1),
    sources: z.array(z.string()).max(25),
    mechanism: z.array(z.string().min(1).max(120)).min(3).max(6),
    marketImpact: MarketImpactSchema,
    sectors: z.array(SectorImpactSchema).max(10),
    tickers: z.array(TickerImpactSchema).max(8),
    scenarios: z.array(EventScenarioSchema).max(4),
  })
  .superRefine((value, ctx) => {
    if (value.scenarios.length) {
      const sum = value.scenarios.reduce((acc, s) => acc + (Number.isFinite(s.probability) ? s.probability : 0), 0);
      if (sum < 80 || sum > 120) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Scenario probabilities must sum ~100 (tolerance 80–120); got ${sum}.`,
          path: ['scenarios'],
        });
      }
    }
  });
export type EventItem = z.infer<typeof EventItemSchema>;

export const EventIntelligenceResponseSchema = z.object({
  ok: z.boolean(),
  source: z.string(),
  updatedAt: z.string(),
  data: z.object({ events: z.array(EventItemSchema) }),
  warnings: z.array(z.string()),
  meta: z
    .object({
      traceId: z.string(),
      fetchedAt: z.string(),
      stale: z.boolean().optional(),
      providers: z.record(z.any()).optional(),
      counts: z.any().optional(),
      ai: z
        .object({
          attempted: z.boolean(),
          used: z.boolean(),
          calls: z.number().int().min(0),
          cached: z.number().int().min(0),
        })
        .optional(),
    })
    .optional(),
});
export type EventIntelligenceResponse = z.infer<typeof EventIntelligenceResponseSchema>;

