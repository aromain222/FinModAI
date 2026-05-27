import { z } from 'zod';

const unknownRecord = z.record(z.unknown()).default({});

export const pmBrainDecisionSchema = z.enum(['BUY', 'SELL', 'HOLD', 'REDUCE', 'EXIT', 'REJECT']);
export const pmBrainHorizonSchema = z.enum(['intraday', '2-10 days', '2-6 weeks', '1-3 months']);

export const pmBrainAgentInputSchema = z.object({
  ticker: z.string().trim().min(1).max(16).transform(value => value.toUpperCase().replace(/-/g, '.')),
  market_context: unknownRecord,
  portfolio_state: unknownRecord,
  analyst_signals: z.array(z.record(z.unknown())).default([]),
  debate_summary: unknownRecord,
  risk_snapshot: unknownRecord,
  current_price: z.number().positive(),
});

export const pmBrainAgentOutputSchema = z.object({
  ticker: z.string().trim().min(1).max(16).transform(value => value.toUpperCase().replace(/-/g, '.')),
  decision: pmBrainDecisionSchema,
  position_size_pct: z.number().min(0).max(15),
  confidence: z.number().min(0).max(100),
  time_horizon: pmBrainHorizonSchema,
  thesis: z.string().min(1).max(600),
  top_drivers: z.array(z.string().min(1).max(180)).min(1).max(5),
  top_risks: z.array(z.string().min(1).max(180)).min(1).max(5),
  expected_catalysts: z.array(z.string().min(1).max(180)).min(1).max(5),
  invalidation_conditions: z.array(z.string().min(1).max(180)).min(1).max(5),
  risk_notes: z.array(z.string().min(1).max(180)).min(1).max(5),
  execution_notes: z.array(z.string().min(1).max(180)).min(1).max(5),
});

export type PMBrainAgentInput = z.infer<typeof pmBrainAgentInputSchema>;
export type PMBrainAgentOutput = z.infer<typeof pmBrainAgentOutputSchema>;

export type PMBrainAgentRunResult = {
  ok: boolean;
  decision: PMBrainAgentOutput;
  source: 'openai' | 'fallback';
  model?: string;
  error?: string;
};

export const pmBrainAgentJsonSchema = {
  name: 'capitalbase_pm_brain_agent_decision',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'ticker',
      'decision',
      'position_size_pct',
      'confidence',
      'time_horizon',
      'thesis',
      'top_drivers',
      'top_risks',
      'expected_catalysts',
      'invalidation_conditions',
      'risk_notes',
      'execution_notes',
    ],
    properties: {
      ticker: { type: 'string' },
      decision: { type: 'string', enum: ['BUY', 'SELL', 'HOLD', 'REDUCE', 'EXIT', 'REJECT'] },
      position_size_pct: { type: 'number', minimum: 0, maximum: 15 },
      confidence: { type: 'number', minimum: 0, maximum: 100 },
      time_horizon: { type: 'string', enum: ['intraday', '2-10 days', '2-6 weeks', '1-3 months'] },
      thesis: { type: 'string' },
      top_drivers: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
      top_risks: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
      expected_catalysts: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
      invalidation_conditions: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
      risk_notes: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
      execution_notes: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
    },
  },
} as const;
