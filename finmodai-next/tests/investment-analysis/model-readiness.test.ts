import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAttachmentModelReadiness,
  parseAttachmentClarificationAnswer,
} from '@/lib/analyst/modelReadiness';

test('DCF readiness asks for shares outstanding after other required anchors are present', () => {
  const readiness = evaluateAttachmentModelReadiness({
    modelType: 'DCF',
    attachmentSnapshot: {
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
      sharesOutstanding: null,
      capex: null,
      depreciationAndAmortization: null,
      warnings: [],
    },
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.clarificationField, 'sharesOutstanding');
  assert.match(readiness.clarificationQuestion ?? '', /shares outstanding/i);
});

test('clarification parser accepts standalone share count answers for the active field', () => {
  const parsed = parseAttachmentClarificationAnswer({
    modelType: 'DCF',
    answer: '14.81b',
    currentField: 'sharesOutstanding',
  });

  assert.deepEqual(parsed.matchedFields, ['sharesOutstanding']);
  assert.equal(parsed.inputOverrides.sharesOutstanding, 14_810_000_000);
});

test('three-statement readiness moves from gross margin to opex after a user answer', () => {
  const first = evaluateAttachmentModelReadiness({
    modelType: 'THREE_STATEMENT',
    attachmentSnapshot: {
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
      operatingIncome: null,
      ebitda: null,
      netIncome: null,
      cash: 45_317_000_000,
      totalDebt: 95_281_000_000,
      sharesOutstanding: null,
      capex: null,
      depreciationAndAmortization: null,
      warnings: [],
    },
  });

  assert.equal(first.clarificationField, 'grossMargin');

  const parsed = parseAttachmentClarificationAnswer({
    modelType: 'THREE_STATEMENT',
    answer: 'gross margin 46%',
    currentField: 'grossMargin',
  });

  const second = evaluateAttachmentModelReadiness({
    modelType: 'THREE_STATEMENT',
    attachmentSnapshot: {
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
      operatingIncome: null,
      ebitda: null,
      netIncome: null,
      cash: 45_317_000_000,
      totalDebt: 95_281_000_000,
      sharesOutstanding: null,
      capex: null,
      depreciationAndAmortization: null,
      warnings: [],
    },
    inputOverrides: parsed.inputOverrides,
  });

  assert.equal(second.ready, false);
  assert.equal(second.clarificationField, 'opexPctRevenue');
});

test('comps clarification parser accepts EBITDA-labeled answers', () => {
  const parsed = parseAttachmentClarificationAnswer({
    modelType: 'COMPS',
    answer: 'EBITDA is $140B',
    currentField: 'subjectRevenueOrEbitda',
  });

  assert.deepEqual(parsed.matchedFields, ['subjectRevenueOrEbitda']);
  assert.deepEqual(parsed.inputOverrides.subject, { ebitda: 140_000_000_000 });
});
