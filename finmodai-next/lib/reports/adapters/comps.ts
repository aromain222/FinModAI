import type { ReportV1 } from '@/types/reportContracts';

export function buildCompsReport(params: {
  modelId: string;
  ticker?: string | null;
  companyName?: string | null;
  scenario?: string | null;
  results?: any;
  preview?: any;
}): ReportV1 {
  const now = new Date().toISOString();
  const results = params.results || {};
  const compsTable = results?.compsTable || results?.comps || [];
  const expected = ['evEbitda', 'pe', 'impliedPriceLow', 'impliedPriceHigh'];
  const found = expected.filter((k) => results?.[k] !== undefined).length;
  const coveragePct = Math.round((found / expected.length) * 100);

  return {
    version: '1',
    reportId: params.modelId,
    modelId: params.modelId,
    modelType: 'comps',
    ticker: params.ticker ?? null,
    companyName: params.companyName ?? null,
    scenario: params.scenario ?? null,
    createdAt: now,
    generatedAt: now,
    status: 'ready',
    summary: {
      title: `${params.ticker ?? 'Comps'} Valuation`,
      subtitle: 'Trading comparables snapshot',
      recommendation: null,
    },
    kpis: [
      { key: 'medianEvEbitda', label: 'Median EV/EBITDA', value: results.evEbitda ?? null, format: 'multiple' },
      { key: 'medianPe', label: 'Median P/E', value: results.pe ?? null, format: 'multiple' },
      { key: 'impliedPriceLow', label: 'Implied Price (Low)', value: results.impliedPriceLow ?? null, format: 'currency' },
      { key: 'impliedPriceHigh', label: 'Implied Price (High)', value: results.impliedPriceHigh ?? null, format: 'currency' },
    ],
    inputs: [
      { key: 'peerCount', label: 'Peers Included', value: Array.isArray(compsTable) ? compsTable.length : null },
      { key: 'metric', label: 'Metric', value: results.metric ?? 'EV/EBITDA', format: 'text' },
    ],
    drivers: [{ label: 'Peer multiples', impact: 'see comps table' }],
    risks: [{ label: 'Outlier sensitivity', detail: 'Median/trim choices drive valuation.' }],
    tables: {
      comps: {
        title: 'Comps Universe',
        columns: [
          { key: 'name', label: 'Company' },
          { key: 'evEbitda', label: 'EV/EBITDA' },
          { key: 'pe', label: 'P/E' },
          { key: 'price', label: 'Price' },
        ],
        rows: Array.isArray(compsTable) ? compsTable : [],
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
    notes: { analystSummary: results?.summary ?? null },
    debug: { adapter: 'comps' },
  };
}
