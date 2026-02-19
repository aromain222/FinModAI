import { z } from 'zod';

export const OperatingModelInputSchema = z.object({
  ticker: z.string(),
  // Operating model is a monthly operating plan; UI supports rich nested inputs.
  // Keep this schema permissive (catchall) so we can validate minimums without blocking feature growth.
  revenue: z.number().optional(),
  revenueGrowth: z.number().optional(),
  ebitdaMargin: z.number().optional(),
  startMonth: z.string().optional(),
  months: z.number().int().min(1).max(60).optional(),
  currency: z.string().optional(),
  taxRate: z.number().optional(),
  startingCash: z.number().optional(),
  revenueModel: z.any().optional(),
  cogsModel: z.any().optional(),
  opexModel: z.any().optional(),
  capexSchedule: z.array(z.number()).optional(),
  debt: z.any().optional(),
}).catchall(z.any());

export type OperatingModelInput = z.infer<typeof OperatingModelInputSchema>;

export function getMissingOperatingInputs(inputs: Partial<OperatingModelInput>): string[] {
  // Minimal required inputs for a meaningful run (keep this conservative; more can be added later).
  const missing: string[] = [];
  if (!inputs.ticker) missing.push('ticker');
  return missing;
}
