import { z } from 'zod';

export const ReportKpiSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable().optional(),
  format: z.enum(['currency', 'percent', 'multiple', 'number', 'text']).nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
});

export const ReportInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable().optional(),
});

export const ReportSectionSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
});

export const ReportTableSchema = z.record(
  z.string(),
  z.object({
    title: z.string(),
    columns: z.array(z.object({ key: z.string(), label: z.string() })),
    rows: z.array(z.record(z.any())),
  })
);

export const ReportV1Schema = z.object({
  version: z.literal('1'),
  reportId: z.string(),
  modelId: z.string(),
  modelType: z.string(),
  ticker: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  scenario: z.string().nullable().optional(),
  createdAt: z.string(),
  generatedAt: z.string().optional(),
  status: z.enum(['queued', 'generating', 'ready', 'failed']),
  summary: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    recommendation: z
      .enum(['Bull', 'Base', 'Bear', 'Buy', 'Hold', 'Sell'])
      .nullable()
      .optional(),
  }),
  kpis: z.array(ReportKpiSchema),
  inputs: z.array(ReportInputSchema),
  drivers: z.array(z.object({ label: z.string(), impact: z.string(), detail: z.string().optional() })),
  risks: z.array(z.object({ label: z.string(), detail: z.string().optional() })),
  tables: ReportTableSchema,
  charts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: z.enum(['line', 'bar', 'waterfall', 'heatmap']),
      data: z.any(),
    })
  ),
  dataQuality: z.object({
    coveragePct: z.number(),
    missing: z.array(z.string()),
    sources: z.array(z.string()),
  }),
  artifacts: z.object({
    excel: z
      .object({
        r2Key: z.string().nullable().optional(),
        signedUrl: z.string().nullable().optional(),
      })
      .optional(),
    preview: z
      .object({
        available: z.boolean(),
        snapshotId: z.string().nullable().optional(),
      })
      .optional(),
  }),
  notes: z
    .object({
      analystSummary: z.string().nullable().optional(),
      methodology: z.string().nullable().optional(),
    })
    .optional(),
  debug: z.record(z.any()).optional(),
});

export type ReportV1 = z.infer<typeof ReportV1Schema>;
