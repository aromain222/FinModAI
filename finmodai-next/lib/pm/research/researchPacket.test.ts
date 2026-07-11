import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatResearchPacketForPrompt,
  isResearchPacket,
  type ResearchMetric,
  type ResearchPacket,
} from '@/lib/pm/research/researchPacketContract';

const value = (amount: number | null, unit?: string): ResearchMetric => ({
  value: amount,
  source: amount === null ? null : 'test_provider',
  asOf: amount === null ? null : '2026-07-10',
  ...(unit ? { unit } : {}),
});

function packet(): ResearchPacket {
  return {
    version: 1,
    ticker: 'TEST',
    companyName: 'Test Company',
    builtAt: '2026-07-10T12:00:00.000Z',
    horizon: { days: 45, startDate: '2026-07-10', endDate: '2026-08-24', label: '45-day / 1-3 month' },
    company: { sector: 'Technology', industry: 'Software', exchange: 'NASDAQ', currency: 'USD' },
    market: { price: value(100, 'USD'), marketCap: value(10_000, 'USD millions'), sharesOutstanding: value(100, 'millions') },
    fundamentals: {
      revenueLtm: value(2_000, 'USD millions'),
      grossMarginPct: value(70, '%'),
      ebitdaLtm: value(400, 'USD millions'),
      ebitdaMarginPct: value(20, '%'),
      netIncomeLtm: value(250, 'USD millions'),
      netMarginPct: value(12.5, '%'),
      cash: value(500, 'USD millions'),
      totalDebt: value(200, 'USD millions'),
      netDebtToEbitda: value(-0.75, 'x'),
      historicalRevenueGrowthPct: value(18, '%'),
    },
    consensus: {
      revenueEstimateNtm: value(2_300),
      epsEstimateNtm: value(3.2, 'USD/share'),
      targetPrice: value(115, 'USD'),
      targetUpsidePct: value(15, '%'),
      analystCount: 12,
      rating: 'Buy',
    },
    earnings: {
      fiscalPeriod: 'Q2 2026',
      reportEndDate: '2026-06-30',
      filedAt: '2026-07-25',
      lastFetchedAt: '2026-07-26',
      highlights: ['revenue: 550', 'guidance: raised'],
      source: 'sec',
    },
    pricePath: {
      expectedReturnPct: value(8, '%'),
      lowerReturnPct: value(-7, '%'),
      upperReturnPct: value(18, '%'),
      momentum20dPct: value(4, '%'),
      annualizedVolatilityPct: value(25, '%'),
      methodology: 'test forecast',
    },
    catalysts: [{ title: 'Verified product launch', source: 'Reuters', publishedAt: '2026-07-09', url: 'https://example.com/news' }],
    marketState: null,
    quality: {
      coveragePct: 78,
      available: ['live_price', 'company_fundamentals'],
      missing: ['positioning_and_options', 'peer_valuation'],
      warnings: [],
    },
  };
}

test('recognizes the explicit research packet contract', () => {
  assert.equal(isResearchPacket(packet()), true);
  assert.equal(isResearchPacket({ ticker: 'TEST' }), false);
});

test('formats provenance, horizon, catalysts, and missing evidence for agents', () => {
  const prompt = formatResearchPacketForPrompt(packet());
  assert.match(prompt, /2026-07-10 to 2026-08-24 \(45 days\)/);
  assert.match(prompt, /Revenue LTM: 2000 USD millions \[test_provider, 2026-07-10\]/);
  assert.match(prompt, /Verified product launch/);
  assert.match(prompt, /Missing evidence: positioning_and_options, peer_valuation/);
  assert.match(prompt, /Do not invent dates, estimates, positioning, options, peer multiples/);
});
