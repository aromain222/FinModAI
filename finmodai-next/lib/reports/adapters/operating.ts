import type { ReportV1 } from '@/types/reportContracts';

export function buildOperatingReport(params: {
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
  const income = results?.incomeStatement || results?.income || {};
  const cash = results?.cashFlow || {};
  const expected = ['revenueCagr', 'ebitdaMargin', 'fcfMargin', 'netDebt'];
  const found = expected.filter((k) => results?.[k] !== undefined).length;
  const coveragePct = Math.round((found / expected.length) * 100);

  return {
    version: '1',
    reportId: params.modelId,
    modelId: params.modelId,
    modelType: 'operating',
    ticker: params.ticker ?? null,
    companyName: params.companyName ?? null,
    scenario: params.scenario ?? null,
    createdAt: now,
    generatedAt: now,
    status: 'ready',
    summary: {
      title: `${params.ticker ?? 'Operating'} Model`,
      subtitle: summary?.title,
      recommendation: null,
    },
    kpis: [
      { key: 'revenueCagr', label: 'Revenue CAGR', value: results.revenueCagr ?? null, format: 'percent' },
      { key: 'ebitdaMargin', label: 'EBITDA Margin', value: results.ebitdaMargin ?? null, format: 'percent' },
      { key: 'fcfMargin', label: 'FCF Margin', value: results.fcfMargin ?? null, format: 'percent' },
      { key: 'netDebt', label: 'Net Debt', value: results.netDebt ?? null, format: 'currency' },
    ],
    inputs: [
      { key: 'headcount', label: 'Headcount', value: results.headcount ?? null, format: 'number' },
      { key: 'opex', label: 'OpEx Run-rate', value: results.opex ?? null, format: 'currency' },
    ],
    drivers: [{ label: 'Revenue growth', impact: results.revenueCagr ? `${results.revenueCagr}%` : 'n/a' }],
    risks: [{ label: 'Runway risk', detail: 'Cash burn or net debt may constrain operations.' }],
    tables: {
      incomeStatement: {
        title: 'Income Statement (summary)',
        columns: [
          { key: 'metric', label: 'Metric' },
          { key: 'value', label: 'Value' },
        ],
        rows: [
          { metric: 'Revenue', value: income.revenue ?? null },
          { metric: 'EBITDA', value: income.ebitda ?? null },
          { metric: 'Net Income', value: income.netIncome ?? null },
        ],
      },
      cashFlow: {
        title: 'Cash Flow (summary)',
        columns: [
          { key: 'metric', label: 'Metric' },
          { key: 'value', label: 'Value' },
        ],
        rows: [
          { metric: 'Operating CF', value: cash.operating ?? null },
          { metric: 'Investing CF', value: cash.investing ?? null },
          { metric: 'Financing CF', value: cash.financing ?? null },
        ],
      },
    },
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
    debug: { adapter: 'operating' },
  };
}
