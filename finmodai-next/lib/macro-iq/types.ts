/**
 * Macro IQ Card Types
 * Strict schema for Macro IQ event cards
 */

import { z } from 'zod';

export const MacroIQCardSchema = z.object({
  id: z.string(),
  eventType: z.enum(['CPI_PRINT', 'JOBS_REPORT', 'FOMC_UPDATE', 'OIL_SHOCK', 'GEOPOLITICS']),
  title: z.string().max(120),
  tag: z.string().max(50),
  investorBrief: z.string().max(2500),
  coreTake: z.string().max(500), // 2 sentences max
  marketTransmission: z.object({
    bullets: z.array(z.string()).length(4), // Exactly 4 bullets
  }),
  sectors: z.object({
    winners: z.array(z.string()).length(3), // Exactly 3
    losers: z.array(z.string()).length(3), // Exactly 3
  }),
  tickersToWatch: z.object({
    winners: z.array(z.string()).min(2).max(3),
    losers: z.array(z.string()).min(2).max(3),
  }),
  scenarios: z.array(
    z.object({
      name: z.string(),
      prob: z.number().min(0).max(100),
      impact: z.string(),
    })
  ).length(3).refine(
    (scenarios) => scenarios.reduce((sum, s) => sum + s.prob, 0) === 100,
    { message: 'Scenario probabilities must sum to 100' }
  ),
  whatToWatch: z.array(z.string()).length(3), // Exactly 3
  confidence: z.enum(['LOW', 'MED', 'HIGH']),
  dataCoverage: z.object({
    news: z.boolean(),
    macro: z.boolean(),
    prices: z.boolean(),
  }),
});

export type MacroIQCard = z.infer<typeof MacroIQCardSchema>;

export const MacroIQCardsResponseSchema = z.object({
  traceId: z.string(),
  status: z.enum(['ok', 'error']),
  result: z.object({
    cards: z.array(MacroIQCardSchema).min(3).max(4), // Always 3-4 cards
    rawInputs: z.object({
      newsCount: z.number(),
      macroSeriesCount: z.number(),
      priceSeriesCount: z.number(),
    }),
  }).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }).optional(),
});

export type MacroIQCardsResponse = z.infer<typeof MacroIQCardsResponseSchema>;
