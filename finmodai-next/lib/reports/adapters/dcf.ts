import type { ReportV1 } from '@/types/reportContracts';

const pick = (obj: any, path: string[]) => {
  return path.reduce<any>((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
};

export function buildDcfReport(params: {
  modelId: string;
  ticker?: string | null;
  companyName?: string | null;
  scenario?: string | null;
  results?: any;
  preview?: any;
}): ReportV1 {
  const now = new Date().toISOString();
  const results = params.results || {};
  const valuation = results?.valuation || results?.valuationResults || {};
  const assumptions = results?.assumptions || {};
  const coverageFields = ['impliedValuePerShare', 'enterpriseValue', 'equityValue', 'wacc', 'terminalGrowth'];
  let found = 0;
  coverageFields.forEach((field) => {
    if (valuation[field] !== undefined || assumptions[field] !== undefined) found += 1;
  });
  const coveragePct = Math.round((found / coverageFields.length) * 100);

  return {
    version: '1',
    reportId: params.modelId,
    modelId: params.modelId,
    modelType: 'dcf',
    ticker: params.ticker ?? null,
    companyName: params.companyName ?? null,
    scenario: params.scenario ?? null,
    createdAt: now,
    generatedAt: now,
    status: 'ready',
    summary: {
      title: `${params.ticker ?? 'DCF'} Valuation`,
      subtitle: valuation?.valuationDate ? `As of ${valuation.valuationDate}` : undefined,
      recommendation: null,
    },
    kpis: [
      { key: 'pricePerShare', label: 'Implied Price / Share', value: valuation.impliedValuePerShare ?? valuation.pricePerShare ?? null, format: 'currency' },
      { key: 'equityValue', label: 'Equity Value', value: valuation.equityValue ?? null, format: 'currency' },
      { key: 'enterpriseValue', label: 'Enterprise Value', value: valuation.enterpriseValue ?? null, format: 'currency' },
      { key: 'wacc', label: 'WACC', value: assumptions.wacc ?? assumptions.discountRate ?? null, format: 'percent' },
      { key: 'terminalGrowth', label: 'Terminal Growth', value: assumptions.terminalGrowth ?? assumptions.longTermGrowth ?? null, format: 'percent' },
    ],
    inputs: [
      { key: 'revenueGrowth', label: 'Revenue CAGR', value: assumptions.revenueGrowth ?? assumptions.revenueGrowthPct ?? null, format: 'percent' },
      { key: 'ebitMargin', label: 'EBIT Margin', value: assumptions.ebitMargin ?? assumptions.ebitdaMargin ?? null, format: 'percent' },
      { key: 'taxRate', label: 'Tax Rate', value: assumptions.taxRate ?? assumptions.tax_rate ?? null, format: 'percent' },
    ],
    drivers: [
      { label: 'WACC sensitivity', impact: valuation.impliedValuePerShare ? `${valuation.impliedValuePerShare}` : 'n/a', detail: 'Discount rate drives terminal value.' },
      { label: 'Terminal growth', impact: assumptions.terminalGrowth ? `${assumptions.terminalGrowth}%` : 'n/a', detail: 'Small changes alter perpetuity value.' },
    ],
    risks: [
      { label: 'Execution risk', detail: 'Assumptions may be optimistic vs peers.' },
    ],
    tables: {
      valuationBridge: {
        title: 'Valuation Bridge',
        columns: [
          { key: 'metric', label: 'Metric' },
          { key: 'value', label: 'Value' },
        ],
        rows: [
          { metric: 'Enterprise Value', value: valuation.enterpriseValue ?? null },
          { metric: 'Net Debt', value: pick(results, ['valuationBridge', 'netDebt']) ?? null },
          { metric: 'Equity Value', value: valuation.equityValue ?? null },
        ],
      },
    },
    charts: [],
    dataQuality: {
      coveragePct: isNaN(coveragePct) ? 0 : coveragePct,
      missing: coverageFields.filter((f) => valuation[f] === undefined && assumptions[f] === undefined),
      sources: results?.sources ?? ['internal'],
    },
    artifacts: {
      excel: {
        r2Key: results?.r2_key ?? null,
        signedUrl: null,
      },
      preview: { available: Boolean(params.preview), snapshotId: null },
    },
    notes: {
      analystSummary: results?.summary ?? null,
      methodology: results?.methodology ?? null,
    },
    debug: { adapter: 'dcf' },
  };
}
