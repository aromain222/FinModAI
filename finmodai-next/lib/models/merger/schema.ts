import { z } from 'zod';

export const MergerModelInputSchema = z.object({
  acquirerTicker: z.string(),
  targetTicker: z.string(),
  purchasePrice: z.number(),
  synergies: z.number().optional()
});

export type MergerModelInput = z.infer<typeof MergerModelInputSchema>;

export function getMissingMergerInputs(inputs: Partial<MergerModelInput>): string[] {
  const required = ['acquirerTicker', 'targetTicker', 'purchasePrice'];
  return required.filter(field => !inputs[field as keyof MergerModelInput]);
}

export function validateMergerInputs(inputs: MergerModelInput): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (inputs.purchasePrice <= 0) errors.push('Purchase price must be positive');
  return { isValid: errors.length === 0, errors };
}
