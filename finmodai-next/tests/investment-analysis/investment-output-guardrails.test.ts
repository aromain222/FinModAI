import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAnalystOutput, deriveOutputFromDcf } from '@/lib/analyst/investmentOutput';
import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';

function buildFallbackDcf(): AnalystDcfDemoPayload {
  return {
    prompt: 'Is GOOGL undervalued?',
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    sector: 'Communication Services',
    currency: 'USD',
    years: 5,
    source: 'demo_seed_fallback',
    asOfDate: '2026-03-24',
    memo: 'Fallback memo.',
    warnings: [],
    notes: [],
    baseMetrics: {
      revenueLtm: 348_000,
      ebitdaLtm: 120_000,
      netIncomeLtm: 90_000,
      cash: 100_000,
      totalDebt: 25_000,
      netDebt: -75_000,
      sharesOutstanding: 12_300,
      sharePrice: 384,
      marketCap: 4_723_200,
    },
    assumptions: {
      revenueGrowth: [0.06, 0.05, 0.04, 0.035, 0.025],
      ebitMargin: [0.32, 0.33, 0.33, 0.33, 0.33],
      taxRate: 0.21,
      daPctRevenue: 0.025,
      capexPctRevenue: 0.045,
      nwcPctRevenue: 0.01,
      wacc: 0.1,
      terminalGrowth: 0.025,
    },
    forecast: [
      { year: 2027, revenue: 368_880, ebit: 118_041, fcff: 83_000 },
      { year: 2028, revenue: 387_324, ebit: 127_817, fcff: 89_000 },
    ],
    scenarios: {
      base: {
        name: 'Base',
        enterpriseValue: 1_200_000,
        equityValue: 1_275_000,
        pricePerShare: 102,
        marketPrice: 384,
        upsidePct: -73.4,
        netDebt: -75_000,
        stagePv: 300_000,
        terminalValue: 1_500_000,
        pvTerminalValue: 900_000,
        terminalValueWeight: 0.75,
      },
      bull: {
        name: 'Bull',
        enterpriseValue: 1_500_000,
        equityValue: 1_575_000,
        pricePerShare: 128,
        marketPrice: 384,
        upsidePct: -66.7,
        netDebt: -75_000,
        stagePv: 350_000,
        terminalValue: 1_800_000,
        pvTerminalValue: 1_150_000,
        terminalValueWeight: 0.77,
      },
      bear: {
        name: 'Bear',
        enterpriseValue: 900_000,
        equityValue: 975_000,
        pricePerShare: 79,
        marketPrice: 384,
        upsidePct: -79.4,
        netDebt: -75_000,
        stagePv: 250_000,
        terminalValue: 1_100_000,
        pvTerminalValue: 650_000,
        terminalValueWeight: 0.72,
      },
    },
  };
}

test('demo seeded DCF outputs are non-actionable in the investment card', () => {
  const output = deriveOutputFromDcf(buildFallbackDcf());

  assert.equal(output.signal, 'NEUTRAL');
  assert.equal(output.percentChange, 0);
  assert.equal(output.sizePct, null);
  assert.equal(output.targetPrice, null);
  assert.equal(output.stopLoss, null);
  assert.match(output.valuationConclusion ?? '', /Non-actionable fallback model/i);
  assert.match(output.investmentCapabilityMemo ?? '', /non-actionable scaffold/i);
});

test('normalization repairs near-value conclusion on a material valuation gap', () => {
  const normalized = normalizeAnalystOutput({
    signal: 'SHORT',
    percentChange: -43.6,
    confidence: 0.45,
    analystNote: 'Material downside under the model.',
    valuationConclusion: 'Trading near intrinsic value estimates',
  });

  assert.match(normalized.valuationConclusion, /Significantly overvalued/);
});

test('normalization includes an investment capability memo for incomplete price data', () => {
  const normalized = normalizeAnalystOutput({
    signal: 'LONG',
    percentChange: 24,
    confidence: 0.62,
    analystNote: 'Attractive upside under the model.',
    ticker: 'TEST',
  });

  assert.match(normalized.investmentCapabilityMemo, /valuation framework only/i);
});

test('DCF investment output carries active event context', () => {
  const dcf = buildFallbackDcf();
  dcf.source = 'finnhub_live_metrics';
  dcf.eventContext = [
    {
      title: 'Fed signals higher-for-longer rates',
      eventType: 'CentralBank',
      severity: 78,
      horizon: 'NearTerm',
      impact: 'Rates pressure long-duration equities',
      sourceName: 'Federal Reserve',
      publishedAt: '2026-04-30T12:00:00.000Z',
      signal: 'SHORT',
    },
  ];

  const output = deriveOutputFromDcf(dcf);
  const normalized = normalizeAnalystOutput(output);

  assert.equal(normalized.eventContext.length, 1);
  assert.match(normalized.eventContext[0].impact, /Rates pressure/i);
  assert.match(normalized.investmentCapabilityMemo, /Active event context/i);
});

test('NVDA output includes AI infrastructure strategic context', () => {
  const dcf = buildFallbackDcf();
  dcf.ticker = 'NVDA';
  dcf.companyName = 'NVIDIA Corp';
  dcf.sector = 'Technology';
  dcf.source = 'finnhub_live_metrics';
  dcf.assumptions.revenueGrowth = [0.25, 0.22, 0.15, 0.1, 0.07];
  dcf.assumptions.ebitMargin = [0.5, 0.5, 0.5, 0.5, 0.5];

  const output = deriveOutputFromDcf(dcf);
  const normalized = normalizeAnalystOutput(output);

  assert.match(normalized.strategicContext, /AI infrastructure/i);
  assert.match(normalized.strategicContext, /CUDA/i);
  assert.match(normalized.strategicContext, /neutral diligence question/i);
  assert.doesNotMatch(normalized.strategicContext, /supports premium|stock works|buy|sell/i);
});

test('generic company output includes neutral strategic context', () => {
  const dcf = buildFallbackDcf();
  dcf.ticker = 'XYZ';
  dcf.companyName = 'Example Industrial Co';
  dcf.sector = 'Industrials';
  dcf.source = 'finnhub_live_metrics';

  const normalized = normalizeAnalystOutput(deriveOutputFromDcf(dcf));

  assert.match(normalized.strategicContext, /Strategic context:/i);
  assert.match(normalized.strategicContext, /neutral diligence question/i);
  assert.match(normalized.strategicContext, /order cycles|operating leverage/i);
  assert.doesNotMatch(normalized.strategicContext, /LONG|SHORT|buy|sell/i);
});
