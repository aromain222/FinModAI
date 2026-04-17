import assert from 'node:assert/strict';
import test from 'node:test';

import { extractInputs } from '@/lib/model-generator/extractInputs';

test('extractInputs prefers validated financial extraction snapshot for DCF anchors', async () => {
  const extraction = await extractInputs('Build a DCF for Apple', 'DCF', {
    financialExtractionSnapshot: {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      cik: '0000320193',
      lane: 'public',
      validationState: 'ok',
      warnings: [],
      blockingErrors: [],
      facts: [],
      mappedModelInputs: {
        companyName: 'Apple Inc.',
        ticker: 'AAPL',
        asOfDate: '2026-03-31',
        periodType: 'ltm',
        revenue: 410000,
        ebitda: 140000,
        ebit: 125000,
        cash: 55000,
        totalDebt: 98000,
        sharesOutstanding: 15000000000,
        sharePrice: 210,
        marketCap: 3150000,
        netDebt: 43000,
        source: 'financial_extraction_public',
        sourceAttribution: ['sec_companyfacts'],
      },
      sourceArtifacts: [],
    },
  });

  assert.equal(extraction.extractedInputs.modelType, 'DCF');
  if (extraction.extractedInputs.modelType !== 'DCF') return;
  assert.equal(extraction.extractedInputs.baseRevenue, 410000);
  assert.equal(extraction.extractedInputs.cash, 55000);
  assert.equal(extraction.extractedInputs.debt, 98000);
  assert.equal(extraction.extractedInputs.source, 'financial_extraction_public');
});

test('extractInputs derives three-statement margins from validated financial extraction snapshot', async () => {
  const extraction = await extractInputs('Build a three statement model', 'THREE_STATEMENT', {
    financialExtractionSnapshot: {
      companyName: 'PrivateCo',
      lane: 'private',
      validationState: 'warning',
      warnings: ['Using uploaded spreadsheet values.'],
      blockingErrors: [],
      facts: [],
      mappedModelInputs: {
        companyName: 'PrivateCo',
        asOfDate: '2025-12-31',
        periodType: 'annual',
        revenue: 100,
        grossProfit: 60,
        ebit: 20,
        cash: 10,
        totalDebt: 15,
        source: 'financial_extraction_private',
        sourceAttribution: ['financials.xlsx'],
      },
      sourceArtifacts: [],
    },
  });

  assert.equal(extraction.extractedInputs.modelType, 'THREE_STATEMENT');
  if (extraction.extractedInputs.modelType !== 'THREE_STATEMENT') return;
  assert.equal(extraction.extractedInputs.baseRevenue, 100);
  assert.equal(extraction.extractedInputs.grossMargin, 0.6);
  assert.equal(extraction.extractedInputs.opexPctRevenue, 0.4);
  assert.equal(extraction.extractedInputs.source, 'financial_extraction_private');
});
