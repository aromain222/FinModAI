import { z } from 'zod';

export const MacroEventSchema = z.object({
  title: z.string(),
  country: z.string(),
  date: z.string(),
  time: z.string().optional(),
  impact: z.enum(['low', 'med', 'high']),
  sourceUrl: z.string().url(),
  description: z.string().optional(),
});

export const MacroSnapshotSchema = z.object({
  asOf: z.string(),
  inflation: z.number().optional(),
  unemployment: z.number().optional(),
  fedFunds: z.number().optional(),
  gdp: z.number().optional(),
  yield10y: z.number().optional(),
  yield2y: z.number().optional(),
  dxy: z.number().optional(),
});

export const MacroSummarySchema = z.object({
  bullets: z.array(z.string()),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
  asOf: z.string(),
  sources: z.array(z.object({ name: z.string(), url: z.string().url() })),
});

export type MacroEvent = z.infer<typeof MacroEventSchema>;
export type MacroSnapshot = z.infer<typeof MacroSnapshotSchema>;
export type MacroSummary = z.infer<typeof MacroSummarySchema>;
