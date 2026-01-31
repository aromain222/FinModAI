import { z } from 'zod';

export const OperatingModelInputSchema = z.object({
  ticker: z.string(),
  revenue: z.number(),
  revenueGrowth: z.number().optional(),
  ebitdaMargin: z.number().optional()
});

export type OperatingModelInput = z.infer<typeof OperatingModelInputSchema>;

export function getMissingOperatingInputs(inputs: Partial<OperatingModelInput>): string[] {
  const required = ['ticker', 'revenue'];
  return required.filter(field => !inputs[field as keyof OperatingModelInput]);
}
