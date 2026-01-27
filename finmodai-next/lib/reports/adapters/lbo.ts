import type { ReportV1 } from '@/types/reportContracts';

export function buildLboReport(params: {
  modelId: string;
  ticker?: string | null;
  companyName?: string | null;
  scenario?: string | null;
  results?: any;
  preview?: any;
}): ReportV1 {
  const now = new Date().toISOString();
  const results = params.results || {};
  const summary = results?.summary || {};
  const expected = ['irr', 'moic', 'entryMultiple', 'exitMultiple', 'leverage'];
  const found = expected.filter((k) => results?.[k] !== undefined).length;
  const coveragePct = Math.round((found / expected.length) * 100);

  return {
    version: '1',
    reportId: params.modelId,
    modelId: params.modelId,
    modelType: 'lbo',
    ticker: params.ticker ?? null,
    companyName: params.companyName ?? null,
    scenario: params.scenario ?? null,
    createdAt: now,
    generatedAt: now,
    status: 'ready',
    summary: {
      title: `${params.ticker ?? 'LBO'} Returns`,
      subtitle: summary?.title,
      recommendation: null,
    },
    kpis: [
      { key: 'irr', label: 'IRR', value: results.irr ?? summary.irr ?? null, format: 'percent' },
      { key: 'moic', label: 'MOIC', value: results.moic ?? null, format: 'multiple' },
      { key: 'entryMultiple', label: 'Entry Multiple', value: results.entryMultiple ?? null, format: 'multiple' },
      { key: 'exitMultiple', label: 'Exit Multiple', value: results.exitMultiple ?? null, format: 'multiple' },
      { key: 'leverage', label: 'Leverage', value: results.leverage ?? null, format: 'multiple' },
    ],
    inputs: [
      { key: 'hold', label: 'Hold Period', value: results.holdPeriod ?? summary.holdPeriod ?? null, unit: 'years' },
      { key: 'growth', label: 'Revenue Growth', value: results.revenueGrowth ?? null, format: 'percent' },
      { key: 'margin', label: 'EBITDA Margin', value: results.margin ?? results.ebitdaMargin ?? null, format: 'percent' },
    ],
    drivers: [
      { label: 'Exit multiple', impact: results.exitMultiple ? `${results.exitMultiple}x` : 'n/a' },
      { label: 'De-leveraging', impact: results.debtPaydown ? `-${results.debtPaydown}` : 'n/a' },
    ],
    risks: [{ label: 'Multiple compression', detail: 'Returns sensitive to exit multiple and leverage.' }],
    tables: {},
    charts: [],
    dataQuality: {
      coveragePct: isNaN(coveragePct) ? 0 : coveragePct,
      missing: expected.filter((k) => results?.[k] === undefined),
      sources: results?.sources ?? ['internal'],
    },
    artifacts: {
      excel: { r2Key: results?.r2_key ?? null, signedUrl: null },
      preview: { available: Boolean(params.preview), snapshotId: null },
    },
    notes: { analystSummary: summary?.notes ?? null },
    debug: { adapter: 'lbo' },
  };
}
