import test from 'node:test';
import assert from 'node:assert/strict';

import { extractInputs } from '@/lib/model-generator/extractInputs';

test('attachment-driven DCF extraction normalizes attachment values and clarification overrides into model units', async () => {
  const result = await extractInputs('Build a DCF using the attached PDF.', 'DCF', {
    attachmentDriven: true,
    attachmentStatementSnapshot: {
      source: 'attachment_pdf_statement',
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      reportEndDate: '2025-12-27',
      fiscalPeriod: 'Q1 FY26',
      periodType: 'quarter',
      units: 'millions',
      currency: 'USD',
      annualizedFromQuarter: true,
      revenue: 497_200_000_000,
      grossProfit: 184_000_000_000,
      operatingIncome: 171_328_000_000,
      ebitda: null,
      netIncome: 145_320_000_000,
      cash: 45_317_000_000,
      totalDebt: 95_281_000_000,
      sharesOutstanding: 14_810_356_000,
      capex: 11_628_000_000,
      depreciationAndAmortization: 12_844_000_000,
      warnings: [],
    },
    inputOverrides: {
      sharesOutstanding: 14_900_000_000,
    },
  });

  assert.equal(result.extractedInputs.modelType, 'DCF');
  assert.equal(result.extractedInputs.baseRevenue, 497_200);
  assert.equal(result.extractedInputs.cash, 45_317);
  assert.equal(result.extractedInputs.debt, 95_281);
  assert.equal(result.extractedInputs.sharesOutstanding, 14_900);
  assert.equal(result.provenanceSummary.sourceType, 'attachment_statement');
  assert.equal(result.scaleValidation?.ok, true);
  assert.equal(result.fieldDisplayMap?.baseRevenue, 'model_millions_currency');
});

test('attachment-driven DCF extraction marks unit-scale mismatches as validation failures', async () => {
  const result = await extractInputs('Build a DCF using the attached PDF.', 'DCF', {
    attachmentDriven: true,
    attachmentStatementSnapshot: {
      source: 'attachment_pdf_statement',
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      reportEndDate: '2025-12-27',
      fiscalPeriod: 'Q1 FY26',
      periodType: 'quarter',
      units: 'millions',
      currency: 'USD',
      annualizedFromQuarter: true,
      revenue: 575_024_000_000,
      grossProfit: null,
      operatingIncome: 203_408_000_000,
      ebitda: null,
      netIncome: null,
      cash: 45_317_000_000,
      totalDebt: 90_509_000_000,
      sharesOutstanding: 14_810_356_000,
      capex: null,
      depreciationAndAmortization: null,
      warnings: [],
    },
    inputOverrides: {
      baseRevenue: 74_525,
    },
  });

  assert.equal(result.scaleValidation?.ok, false);
  assert.deepEqual(result.scaleValidation?.failedFields, ['baseRevenue']);
  assert.match(result.scaleValidation?.message ?? '', /stopped to avoid a mis-scaled output/i);
});
