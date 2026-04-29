import { z } from 'zod';
import { getFinancialModelAnalysis, type TradingSignal } from '@/lib/news/tradingSignal';

export const whatIfResultSchema = z.object({
  variable: z.string(),
  delta: z.number(),
  valuation_change: z.number(),
  conviction: z.number().min(0).max(1).optional(),
  insight: z.string().optional(),
});

export type WhatIfResult = z.infer<typeof whatIfResultSchema>;

export type WhatIfInput = {
  query?: string;
  base_assumptions: {
    revenue_growth: number;
    operating_margin: number;
    discount_rate: number;
  };
  change?: {
    variable: 'growth' | 'margin' | 'discount_rate';
    delta: number;
  };
};

export async function getWhatIfAnalysis(input: WhatIfInput): Promise<TradingSignal | null> {
  const growth = input.base_assumptions.revenue_growth;
  const margin = input.base_assumptions.operating_margin;
  const discount_rate = input.base_assumptions.discount_rate;

  if (input.change) {
    return getFinancialModelAnalysis({
      mode: 'WHAT_IF_SIMULATION',
      data: {
        base_model: { growth, margin, discount_rate },
        change: input.change,
      },
    });
  }

  return getFinancialModelAnalysis({
    mode: 'MODEL_ANALYSIS',
    data: { growth, margin, discount_rate },
  });
}
