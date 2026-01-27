import type { ReportV1 } from '@/types/reportContracts';

export function buildFallbackReport(params: {
  modelId: string;
  modelType: string;
  ticker?: string | null;
  companyName?: string | null;
  scenario?: string | null;
  results?: any;
  preview?: any;
}): ReportV1 {
  const now = new Date().toISOString();
  return {
    version: '1',
    reportId: params.modelId,
    modelId: params.modelId,
    modelType: params.modelType,
    ticker: params.ticker ?? null,
    companyName: params.companyName ?? null,
    scenario: params.scenario ?? null,
    createdAt: now,
    generatedAt: now,
    status: 'ready',
    summary: {
      title: `Report for ${params.ticker ?? params.modelType}`,
      subtitle: 'Fallback report (limited data)',
      recommendation: null,
    },
    kpis: [
      { key: 'modelType', label: 'Model type', value: params.modelType, format: 'text' },
      { key: 'scenario', label: 'Scenario', value: params.scenario ?? 'N/A', format: 'text' },
    ],
    inputs: [],
    drivers: [],
    risks: [],
    tables: {},
    charts: [],
    dataQuality: {
      coveragePct: 20,
      missing: ['detailed outputs'],
      sources: ['internal'],
    },
    artifacts: {
      excel: {
        r2Key: params.results?.r2_key ?? null,
        signedUrl: null,
      },
      preview: {
        available: Boolean(params.preview),
        snapshotId: null,
      },
    },
    notes: {
      analystSummary: 'Limited data available; download workbook for full detail.',
      methodology: 'Fallback adapter used due to missing structured outputs.',
    },
    debug: {
      adapter: 'fallback',
    },
  };
}
