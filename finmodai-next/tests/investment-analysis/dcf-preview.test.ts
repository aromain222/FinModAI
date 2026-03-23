import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalystDcfPreviewPayload } from '@/lib/analyst/dcfPreview';
import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';

function makePayload(): AnalystDcfDemoPayload {
  return {
    prompt: 'Analyze Apple as an investment',
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Technology',
    currency: 'USD',
    years: 5,
    source: 'demo',
    asOfDate: '2026-03-23',
    memo: 'Base memo',
    warnings: [],
    notes: [],
    baseMetrics: {
      revenueLtm: 400000,
      ebitdaLtm: 140000,
      netIncomeLtm: 100000,
      cash: 50000,
      totalDebt: 100000,
      netDebt: 50000,
      sharesOutstanding: 15000,
      sharePrice: 200,
      marketCap: 3000000,
    },
    assumptions: {
      revenueGrowth: [0.08, 0.07, 0.06, 0.05, 0.04],
      ebitMargin: [0.3, 0.3025, 0.305, 0.3075, 0.31],
      taxRate: 0.21,
      daPctRevenue: 0.03,
      capexPctRevenue: 0.04,
      nwcPctRevenue: 0.01,
      wacc: 0.09,
      terminalGrowth: 0.03,
    },
    forecast: [
      { year: 2027, revenue: 432000, ebit: 129600, fcff: 91000 },
      { year: 2028, revenue: 462240, ebit: 139867, fcff: 98000 },
      { year: 2029, revenue: 489974, ebit: 149442, fcff: 104000 },
      { year: 2030, revenue: 514473, ebit: 158175, fcff: 109000 },
      { year: 2031, revenue: 535052, ebit: 166000, fcff: 113000 },
    ],
    scenarios: {
      bear: {
        name: 'Bear',
        enterpriseValue: 1500000,
        equityValue: 1450000,
        pricePerShare: 96.67,
        marketPrice: 200,
        upsidePct: -0.5167,
        netDebt: 50000,
        stagePv: 350000,
        terminalValue: 1800000,
        pvTerminalValue: 1150000,
        terminalValueWeight: 0.7667,
      },
      base: {
        name: 'Base',
        enterpriseValue: 1800000,
        equityValue: 1750000,
        pricePerShare: 116.67,
        marketPrice: 200,
        upsidePct: -0.4167,
        netDebt: 50000,
        stagePv: 450000,
        terminalValue: 2200000,
        pvTerminalValue: 1350000,
        terminalValueWeight: 0.75,
      },
      bull: {
        name: 'Bull',
        enterpriseValue: 2100000,
        equityValue: 2050000,
        pricePerShare: 136.67,
        marketPrice: 200,
        upsidePct: -0.3167,
        netDebt: 50000,
        stagePv: 525000,
        terminalValue: 2500000,
        pvTerminalValue: 1575000,
        terminalValueWeight: 0.75,
      },
    },
    comparison: null,
  };
}

test('dcf preview payload updates forecast and valuation without mutating the committed payload', () => {
  const payload = makePayload();
  const preview = buildAnalystDcfPreviewPayload(payload, {
    revenueGrowth: payload.assumptions.revenueGrowth.map((value) => value + 0.01),
    ebitMargin: payload.assumptions.ebitMargin.map((value) => value + 0.005),
    wacc: payload.assumptions.wacc + 0.01,
    terminalGrowth: payload.assumptions.terminalGrowth,
  });

  assert.notEqual(preview, payload);
  assert.equal(payload.assumptions.wacc, 0.09);
  assert.equal(preview.assumptions.wacc, 0.1);
  assert.notDeepEqual(preview.forecast, payload.forecast);
  assert.notEqual(preview.scenarios.base.enterpriseValue, payload.scenarios.base.enterpriseValue);
  assert.equal(preview.memo, payload.memo);
});
