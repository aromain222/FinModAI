import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAttachmentModelExtraction } from '@/lib/analyst/claudeModelExtraction';
import { evaluateAttachmentModelReadiness } from '@/lib/analyst/modelReadiness';

test('deterministic attachment extraction reports missing required fields without Claude recovery', async () => {
  const result = await resolveAttachmentModelExtraction({
    modelType: 'DCF',
    prompt: 'Build a DCF from the attached PDF.',
    snapshot: {
      source: 'attachment_pdf_statement',
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      reportEndDate: '2025-12-27',
      fiscalPeriod: 'Q1 FY26',
      periodType: 'quarter',
      units: 'millions',
      currency: 'USD',
      annualizedFromQuarter: false,
      revenue: 143_762_000_000,
      grossProfit: 67_450_000_000,
      operatingIncome: 42_832_000_000,
      ebitda: null,
      netIncome: 36_330_000_000,
      cash: 45_317_000_000,
      totalDebt: 95_281_000_000,
      sharesOutstanding: null,
      capex: 2_907_000_000,
      depreciationAndAmortization: 3_211_000_000,
      warnings: [],
    },
    attachmentSummary: 'Apple Inc. quarterly financial statements',
  });

  assert.equal(result.providerTrace, 'deterministic');
  assert.deepEqual(result.missingRequiredFields, ['sharesOutstanding']);
});

test('Claude recovery fills a missing required PDF anchor and readiness becomes one-shot ready', async () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-1234567890';
  global.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              fields: {
                sharesOutstanding: {
                  value: 14_810_356_000,
                  confidence: 0.98,
                  note: 'Diluted weighted average shares outstanding from the filing.',
                },
              },
            }),
          },
        ],
      }),
    }) as Response);

  try {
    const extraction = await resolveAttachmentModelExtraction({
      modelType: 'DCF',
      prompt: 'Build a DCF from the attached PDF.',
      snapshot: {
        source: 'attachment_pdf_statement',
        companyName: 'Apple Inc.',
        ticker: 'AAPL',
        reportEndDate: '2025-12-27',
        fiscalPeriod: 'Q1 FY26',
        periodType: 'quarter',
        units: 'millions',
        currency: 'USD',
        annualizedFromQuarter: false,
        revenue: 143_762_000_000,
        grossProfit: 67_450_000_000,
        operatingIncome: 42_832_000_000,
        ebitda: null,
        netIncome: 36_330_000_000,
        cash: 45_317_000_000,
        totalDebt: 95_281_000_000,
        sharesOutstanding: null,
        capex: 2_907_000_000,
        depreciationAndAmortization: 3_211_000_000,
        warnings: [],
      },
      attachmentText: 'Diluted weighted average shares outstanding were 14,810,356 thousand shares.',
    });

    assert.equal(extraction.providerTrace, 'mixed');
    assert.equal(extraction.snapshot?.sharesOutstanding, 14_810_356_000);
    assert.deepEqual(extraction.missingRequiredFields, []);

    const readiness = evaluateAttachmentModelReadiness({
      modelType: 'DCF',
      attachmentSnapshot: extraction.snapshot,
      extractionContext: extraction,
    });
    assert.equal(readiness.ready, true);
  } finally {
    process.env.ANTHROPIC_API_KEY = originalKey;
    global.fetch = originalFetch;
  }
});
