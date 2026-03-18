import { z } from 'zod';

export const financeChartTypeSchema = z.enum(['line', 'bar', 'area', 'scatter']);
export const financeAxisFormatSchema = z.enum(['number', 'currency', 'percent', 'multiple', 'date', 'string']);

export const financeSeriesSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  color: z.string().optional(),
  axis: z.enum(['left', 'right']).optional(),
  format: financeAxisFormatSchema.optional(),
  renderAs: z.enum(['line', 'bar', 'area']).optional(),
});

export const financeChartPointSchema = z.record(z.union([z.string(), z.number(), z.null()])).and(
  z.object({
    x: z.union([z.string(), z.number()]),
  }),
);

export const financeChartFormattingSchema = z.object({
  xFormat: financeAxisFormatSchema.optional(),
  yLeftFormat: financeAxisFormatSchema.optional(),
  yRightFormat: financeAxisFormatSchema.optional(),
  decimals: z.number().int().min(0).max(4).optional(),
  currencyCode: z.string().default('USD').optional(),
  compactNumbers: z.boolean().optional(),
});

export const financeChartSpecSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  chartType: financeChartTypeSchema,
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  yRightLabel: z.string().optional(),
  series: z.array(financeSeriesSchema).min(1),
  data: z.array(financeChartPointSchema).min(1),
  formatting: financeChartFormattingSchema.optional(),
  note: z.string().optional(),
});

export type FinanceChartType = z.infer<typeof financeChartTypeSchema>;
export type FinanceAxisFormat = z.infer<typeof financeAxisFormatSchema>;
export type FinanceSeries = z.infer<typeof financeSeriesSchema>;
export type FinanceChartPoint = z.infer<typeof financeChartPointSchema>;
export type FinanceChartFormatting = z.infer<typeof financeChartFormattingSchema>;
export type FinanceChartSpec = z.infer<typeof financeChartSpecSchema>;

export function validateFinanceChartSpec(input: unknown): FinanceChartSpec | null {
  const parsed = financeChartSpecSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
