import assert from 'node:assert/strict';
import test from 'node:test';

import { extractInputs } from '@/lib/model-generator/extractInputs';

test('precedents honors explicit subject overrides and builds a transaction set', async () => {
  const result = await extractInputs('Build a precedents model for AES', 'PRECEDENTS', {
    inputOverrides: {
      companyName: 'AES Corporation',
      subjectRevenue: 12_500,
    },
    demoSnapshotsOverride: {
      AES: {
        ticker: 'AES',
        companyName: 'AES Corporation',
        sector: 'Energy',
        revenueLtm: 12_100,
        ebitdaLtm: 3_100,
        netIncomeLtm: 900,
        cash: 1_200,
        totalDebt: 9_000,
        sharesOutstanding: 650,
        marketCap: 12_000,
        sharePrice: 18.5,
        updatedAt: '2026-04-09',
      },
      NEE: {
        ticker: 'NEE',
        companyName: 'NextEra Energy',
        sector: 'Energy',
        revenueLtm: 28_000,
        ebitdaLtm: 9_000,
        netIncomeLtm: 4_000,
        cash: 2_000,
        totalDebt: 35_000,
        sharesOutstanding: 2_000,
        marketCap: 140_000,
        sharePrice: 70,
        updatedAt: '2026-04-09',
      },
      DUK: {
        ticker: 'DUK',
        companyName: 'Duke Energy',
        sector: 'Energy',
        revenueLtm: 30_000,
        ebitdaLtm: 10_000,
        netIncomeLtm: 4_500,
        cash: 1_500,
        totalDebt: 42_000,
        sharesOutstanding: 780,
        marketCap: 80_000,
        sharePrice: 102,
        updatedAt: '2026-04-09',
      },
      SO: {
        ticker: 'SO',
        companyName: 'Southern Company',
        sector: 'Energy',
        revenueLtm: 26_000,
        ebitdaLtm: 8_200,
        netIncomeLtm: 3_200,
        cash: 1_300,
        totalDebt: 30_000,
        sharesOutstanding: 1_100,
        marketCap: 75_000,
        sharePrice: 68,
        updatedAt: '2026-04-09',
      },
    },
  });

  assert.equal(result.extractedInputs.modelType, 'PRECEDENTS');
  const inputs = result.extractedInputs;
  if (inputs.modelType !== 'PRECEDENTS') throw new Error('unexpected model type');

  assert.equal(inputs.companyName, 'AES Corporation');
  assert.equal(inputs.subjectRevenue, 12_500);
  assert.ok(inputs.transactions.length > 0);
  assert.equal(inputs.transactionCount, inputs.transactions.length);
  assert.equal(result.missingCriticalInputs.includes('companyName'), false);
});
