/**
 * AI Agent Pipeline Schema
 * 
 * Structured output schema for the agent pipeline that takes user prompts
 * and produces recommended models, assumptions, build plans, and preview outputs.
 */

import { z } from 'zod';

export const IntentSchema = z.enum([
  'FORECAST',
  'VALUATION',
  'MERGER',
  'OPERATING',
  'SCENARIO',
  'MARKET_BRIEF',
  'MIXED',
]);

export const ModelTypeSchema = z.enum([
  'DCF',
  'COMPS',
  'LBO',
  'THREE_STATEMENT',
  'MERGER',
  'OPERATING',
  'SCENARIO_ENGINE',
]);

export const ModelToCreateSchema = z.object({
  modelType: ModelTypeSchema,
  title: z.string().max(200),
  why: z.string().max(500),
  inputsNeeded: z.array(z.string()).min(1).max(10),
  prefill: z.record(z.any()).optional(), // Flexible object for pre-filling model inputs
});

export const AssumptionSchema = z.object({
  key: z.string().max(100),
  value: z.string().max(200),
  rationale: z.string().max(300),
});

export const ChartSpecSchema = z.object({
  type: z.enum(['line', 'bar', 'fan', 'waterfall', 'tornado']),
  title: z.string().max(100),
  series: z.any(), // Flexible structure for chart data
});

export const TableSpecSchema = z.object({
  title: z.string().max(100),
  columns: z.array(z.string()).min(1).max(10),
  rows: z.array(z.array(z.any())).max(20), // Max 20 rows for preview
});

export const MemoSectionSchema = z.object({
  title: z.string().max(100),
  bullets: z.array(z.string()).min(1).max(10),
});

export const MemoSpecSchema = z.object({
  sections: z.array(MemoSectionSchema).min(1).max(5),
});

export const OutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('chart'),
    spec: ChartSpecSchema,
  }),
  z.object({
    kind: z.literal('table'),
    spec: TableSpecSchema,
  }),
  z.object({
    kind: z.literal('memo'),
    spec: MemoSpecSchema,
  }),
]);

export const ConfidenceSchema = z.enum(['Low', 'Medium', 'High']);

export const DataCoverageSchema = z.object({
  price: z.boolean(),
  fundamentals: z.boolean(),
  news: z.boolean(),
  macro: z.boolean(),
});

export const AgentPipelineOutputSchema = z.object({
  intent: IntentSchema,
  modelsToCreate: z.array(ModelToCreateSchema).min(0).max(5),
  assumptions: z.array(AssumptionSchema).min(0).max(15),
  outputs: z.array(OutputSchema).min(1).max(10), // At least 1 output required
  confidence: ConfidenceSchema,
  dataCoverage: DataCoverageSchema,
  warnings: z.array(z.string()).min(0).max(10),
});

export type AgentPipelineOutput = z.infer<typeof AgentPipelineOutputSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type ModelToCreate = z.infer<typeof ModelToCreateSchema>;
export type Assumption = z.infer<typeof AssumptionSchema>;
export type Output = z.infer<typeof OutputSchema>;
export type ChartSpec = z.infer<typeof ChartSpecSchema>;
export type TableSpec = z.infer<typeof TableSpecSchema>;
export type MemoSpec = z.infer<typeof MemoSpecSchema>;
export type MemoSection = z.infer<typeof MemoSectionSchema>;
export type DataCoverage = z.infer<typeof DataCoverageSchema>;

