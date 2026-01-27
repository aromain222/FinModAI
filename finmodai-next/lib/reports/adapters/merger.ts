import type { ReportV1 } from '@/types/reportContracts';

export function buildMergerReport(params: {
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
  const expected = ['accretion', 'proFormaEps', 'synergies', 'purchasePrice'];
  const found = expected.filter((k) => results?.[k] !== undefined).length;
  const coveragePct = Math.round((found / expected.length) * 100);

  return {
    version: '1',
    reportId: params.modelId,
    modelId: params.modelId,
    modelType: 'merger',
    ticker: params.ticker ?? null,
    companyName: params.companyName ?? null,
    scenario: params.scenario ?? null,
    createdAt: now,
    generatedAt: now,
    status: 'ready',
    summary: {
      title: `${params.ticker ?? 'Merger'} Analysis`,
      subtitle: summary?.title,
      recommendation: null,
    },
    kpis: [
      { key: 'accretion', label: 'EPS Accretion/(Dilution)', value: results.accretion ?? null, format: 'percent' },
      { key: 'proFormaEps', label: 'Pro Forma EPS', value: results.proFormaEps ?? null, format: 'currency' },
      { key: 'synergies', label: 'Synergies', value: results.synergies ?? null, format: 'currency' },
      { key: 'purchasePrice', label: 'Purchase Price', value: results.purchasePrice ?? null, format: 'currency' },
    ],
    inputs: [
      { key: 'cash', label: 'Cash Consideration', value: results.cashPortion ?? null, format: 'currency' },
      { key: 'stock', label: 'Stock Consideration', value: results.stockPortion ?? null, format: 'currency' },
    ],
    drivers: [{ label: 'Synergy realization', impact: results.synergies ? `${results.synergies}` : 'n/a' }],
    risks: [{ label: 'Integration risk', detail: 'Accretion sensitive to synergy timing and costs.' }],
    tables: {
      sourcesUses: {
        title: 'Sources & Uses',
        columns: [
          { key: 'type', label: 'Type' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: Array.isArray(results.sourcesUses) ? results.sourcesUses : [],
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
    debug: { adapter: 'merger' },
  };
}
