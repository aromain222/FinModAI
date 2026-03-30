import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAnalystStructuredModel } from '@/lib/analyst/modelChat';

test('generateAnalystStructuredModel supports canonical DCF payloads', async () => {
  const result = await generateAnalystStructuredModel('Build a DCF using the attached PDF.', null, {
    attachmentStatementSnapshot: {
      source: 'attachment_pdf_statement',
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      reportEndDate: null,
      fiscalPeriod: 'Q1 FY26',
      periodType: 'quarter',
      units: 'millions',
      currency: 'USD',
      annualizedFromQuarter: false,
      revenue: 575_024_000_000,
      grossProfit: null,
      operatingIncome: 193_341_000_000,
      ebitda: null,
      netIncome: null,
      cash: 45_317_000_000,
      totalDebt: 95_281_000_000,
      sharesOutstanding: 14_810_356_000,
      capex: null,
      depreciationAndAmortization: null,
      warnings: [],
    },
  });

  assert.ok(result);
  assert.equal(result?.payload.modelType, 'DCF');
  assert.equal(result?.payload.title, 'Apple Inc. DCF');
  assert.ok(result?.payload.tabs.includes('DCF Valuation'));
});
