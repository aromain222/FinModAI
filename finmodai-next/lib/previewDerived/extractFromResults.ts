import type { DerivedPreview } from './types';

const safeGet = (obj: any, paths: string[]): any => {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur && p in cur) {
        cur = cur[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null) return cur;
  }
  return null;
};

const pickNumber = (...vals: any[]): number | null => {
  for (const v of vals) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const parsed = Number(v);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
};

export function extractFromResults(results: any): Partial<DerivedPreview> {
  const assumptions: Record<string, { label: string; value: number | string | null; kind: 'percent' | 'money' | 'number' | 'text' }> = {};

  const setAssumption = (key: string, label: string, val: any, kind: 'percent' | 'money' | 'number' | 'text') => {
    const parsed = pickNumber(val);
    if (parsed !== null && parsed !== undefined) assumptions[key] = { label, value: parsed, kind };
  };

  setAssumption('taxRate', 'TAX RATE', safeGet(results, ['assumptions.taxRate', 'assumptions.tax_rate']), 'percent');
  setAssumption('revenueGrowth', 'REVENUE GROWTH', safeGet(results, ['assumptions.revenueGrowth', 'assumptions.revenue_growth']), 'percent');
  setAssumption('ebitMargin', 'EBIT MARGIN', safeGet(results, ['assumptions.ebitMargin', 'assumptions.ebit_margin']), 'percent');
  setAssumption('wacc', 'WACC', safeGet(results, ['assumptions.wacc', 'assumptions.discount_rate']), 'percent');
  setAssumption('terminalGrowth', 'TERMINAL GROWTH', safeGet(results, ['assumptions.terminalGrowth', 'assumptions.terminal_growth']), 'percent');

  return {
    keyOutputs: {
      enterpriseValue: pickNumber(
        safeGet(results, ['valuation.enterpriseValue', 'enterpriseValue', 'outputs.enterpriseValue'])
      ),
      equityValue: pickNumber(safeGet(results, ['valuation.equityValue', 'equityValue', 'outputs.equityValue'])),
      netDebt: pickNumber(safeGet(results, ['valuation.netDebt', 'netDebt'])),
      sharesMm: pickNumber(
        safeGet(results, [
          'sharesOutstandingMm',
          'shares',
          'sharesOutstanding',
          'capitalization.sharesOutstanding',
          'outputs.shares',
          'outputs.sharesOutstanding',
        ])
      ),
      pricePerShare: pickNumber(
        safeGet(results, [
          'valuation.pricePerShare',
          'valuation.impliedValuePerShare',
          'pricePerShare',
          'outputs.pricePerShare',
        ])
      ),
      notes: [],
    },
    assumptions,
    file: { ready: Boolean(safeGet(results, ['r2_key'])), label: '' },
    series: {
      revenue: safeGet(results, ['revenueSeries', 'projection.revenue']),
      fcf: safeGet(results, ['fcfSeries', 'projection.fcf', 'cashFlow.freeCashFlow']),
      ebit: safeGet(results, ['projection.ebit']),
    },
    debug: { matchedLabels: [], chosenSources: ['results'] },
  };
}
