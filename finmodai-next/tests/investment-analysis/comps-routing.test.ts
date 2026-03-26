import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { extractInputs } from '@/lib/model-generator/extractInputs';

test('compare-as-investment prompts classify into COMPS', () => {
  const modelType = classifyPrompt('Compare AMD vs Nvidia as investments');

  assert.equal(modelType, 'COMPS');
});

test('compare prompts seed the explicit second company into the comps peer set', async () => {
  const result = await extractInputs('Compare AMD vs Nvidia as investments', 'COMPS');

  assert.equal(result.extractedInputs.modelType, 'COMPS');
  assert.equal(result.extractedInputs.ticker, 'AMD');
  assert.ok(
    result.extractedInputs.peers.some((peer) => peer.ticker === 'NVDA'),
    'expected NVDA to be included explicitly in the peer set',
  );
});

test('compare prompts can resolve new quality-universe tickers outside the curated demo list', async () => {
  const result = await extractInputs('Compare Palantir vs Nvidia as investments', 'COMPS', {
    demoSnapshotsOverride: {},
    marketCompanyUniverseOverride: [
      {
        ticker: 'PLTR',
        companyName: 'Palantir Technologies Inc.',
        sector: 'Technology',
        industry: 'Software',
        country: 'United States',
        exchange: 'NASDAQ',
        companyType: 'Technology',
        updatedAt: '2026-03-26',
        asOfDate: '2026-03-20',
        revenueLtm: 3400,
        ebitdaLtm: 950,
        netIncomeLtm: 420,
        cash: 5200,
        totalDebt: 250,
        sharesOutstanding: 2300,
        marketCap: 210000,
        sharePrice: 91.3,
        source: 'company_cache',
      },
      {
        ticker: 'NVDA',
        companyName: 'NVIDIA Corporation',
        sector: 'Technology',
        industry: 'Semiconductors',
        country: 'United States',
        exchange: 'NASDAQ',
        companyType: 'Technology',
        updatedAt: '2026-03-26',
        asOfDate: '2026-03-20',
        revenueLtm: 215938,
        ebitdaLtm: 133230,
        netIncomeLtm: 120120,
        cash: 10605,
        totalDebt: 8468,
        sharesOutstanding: 24305,
        marketCap: 4439430,
        sharePrice: 182.65,
        source: 'company_cache',
      },
      {
        ticker: 'AMD',
        companyName: 'Advanced Micro Devices, Inc.',
        sector: 'Technology',
        industry: 'Semiconductors',
        country: 'United States',
        exchange: 'NASDAQ',
        companyType: 'Technology',
        updatedAt: '2026-03-26',
        asOfDate: '2026-03-20',
        revenueLtm: 34639,
        ebitdaLtm: 7285,
        netIncomeLtm: 1640,
        cash: 6100,
        totalDebt: 2900,
        sharesOutstanding: 1630,
        marketCap: 315305,
        sharePrice: 193.39,
        source: 'company_cache',
      },
    ],
  });

  assert.equal(result.extractedInputs.modelType, 'COMPS');
  assert.equal(result.extractedInputs.ticker, 'PLTR');
  assert.equal(result.extractedInputs.subject.ticker, 'PLTR');
  assert.ok(
    result.extractedInputs.peers.some((peer) => peer.ticker === 'NVDA'),
    'expected NVDA to remain in the peer set for a new quality-universe subject',
  );
});

test('trading comps peer ranking can include new quality-universe tickers', async () => {
  const result = await extractInputs('Run a trading comps analysis for Snowflake', 'COMPS', {
    demoSnapshotsOverride: {},
    marketCompanyUniverseOverride: [
      {
        ticker: 'SNOW',
        companyName: 'Snowflake Inc.',
        sector: 'Technology',
        industry: 'Cloud Software',
        country: 'United States',
        exchange: 'NYSE',
        companyType: 'Technology',
        updatedAt: '2026-03-26',
        asOfDate: '2026-03-20',
        revenueLtm: 4200,
        ebitdaLtm: 350,
        netIncomeLtm: 120,
        cash: 4800,
        totalDebt: 0,
        sharesOutstanding: 355,
        marketCap: 72000,
        sharePrice: 202.8,
        source: 'company_cache',
      },
      {
        ticker: 'PLTR',
        companyName: 'Palantir Technologies Inc.',
        sector: 'Technology',
        industry: 'Software',
        country: 'United States',
        exchange: 'NASDAQ',
        companyType: 'Technology',
        updatedAt: '2026-03-26',
        asOfDate: '2026-03-20',
        revenueLtm: 3400,
        ebitdaLtm: 950,
        netIncomeLtm: 420,
        cash: 5200,
        totalDebt: 250,
        sharesOutstanding: 2300,
        marketCap: 210000,
        sharePrice: 91.3,
        source: 'company_cache',
      },
      {
        ticker: 'NOW',
        companyName: 'ServiceNow, Inc.',
        sector: 'Technology',
        industry: 'Cloud Software',
        country: 'United States',
        exchange: 'NYSE',
        companyType: 'Technology',
        updatedAt: '2026-03-26',
        asOfDate: '2026-03-20',
        revenueLtm: 12600,
        ebitdaLtm: 4100,
        netIncomeLtm: 2400,
        cash: 9200,
        totalDebt: 2100,
        sharesOutstanding: 210,
        marketCap: 198000,
        sharePrice: 942.8,
        source: 'company_cache',
      },
      {
        ticker: 'ADSK',
        companyName: 'Autodesk, Inc.',
        sector: 'Technology',
        industry: 'Software',
        country: 'United States',
        exchange: 'NASDAQ',
        companyType: 'Technology',
        updatedAt: '2026-03-26',
        asOfDate: '2026-03-20',
        revenueLtm: 6700,
        ebitdaLtm: 2300,
        netIncomeLtm: 1450,
        cash: 2100,
        totalDebt: 1800,
        sharesOutstanding: 214,
        marketCap: 61000,
        sharePrice: 285.05,
        source: 'company_cache',
      },
      {
        ticker: 'XOM',
        companyName: 'Exxon Mobil Corporation',
        sector: 'Energy',
        industry: 'Integrated Oil & Gas',
        country: 'United States',
        exchange: 'NYSE',
        companyType: 'Energy',
        updatedAt: '2026-03-26',
        asOfDate: '2026-03-20',
        revenueLtm: 338000,
        ebitdaLtm: 78000,
        netIncomeLtm: 43000,
        cash: 31000,
        totalDebt: 42000,
        sharesOutstanding: 4200,
        marketCap: 520000,
        sharePrice: 123.8,
        source: 'company_cache',
      },
    ],
  });

  assert.equal(result.extractedInputs.modelType, 'COMPS');
  assert.equal(result.extractedInputs.ticker, 'SNOW');
  assert.ok(
    result.extractedInputs.peers.some((peer) => peer.ticker === 'PLTR'),
    'expected PLTR to be available in the ranked comps peer universe',
  );
  assert.ok(
    result.extractedInputs.peers.some((peer) => peer.ticker === 'NOW'),
    'expected NOW to be available in the ranked comps peer universe',
  );
});
