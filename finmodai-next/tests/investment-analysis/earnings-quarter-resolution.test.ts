import assert from 'node:assert/strict';
import test from 'node:test';

import { extractEarningsRequestTarget } from '@/lib/analyst/earningsRequest';
import { overrideRouteFromAttachment } from '@/lib/analyst/attachmentRouting';
import type { UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';
import type { AnalystRoute } from '@/lib/analyst/router';

test('extractEarningsRequestTarget treats yearless quarter requests as latest matching quarter', () => {
  const target = extractEarningsRequestTarget({
    ticker: 'AMZN',
    prompt: 'find me amazon q1 financials',
  });

  assert.equal(target.mode, 'yearless_quarter');
  assert.equal(target.fiscalPeriod, 'Q1');
  assert.equal(target.fiscalYear, null);
  assert.equal(target.reportEndDate, null);
});

test('extractEarningsRequestTarget keeps explicit quarter-year requests strict', () => {
  const target = extractEarningsRequestTarget({
    ticker: 'AMZN',
    prompt: "find me Amazon's Q1 2025 financials",
  });

  assert.equal(target.mode, 'explicit_quarter');
  assert.equal(target.fiscalPeriod, 'Q1');
  assert.equal(target.fiscalYear, 2025);
});

test('overrideRouteFromAttachment ignores unrelated uploaded PDF context for company quarter lookup', () => {
  const baseRoute: AnalystRoute = {
    intent: 'company_question',
    tickers: ['AMZN'],
    requiresLiveData: true,
    requiresNews: false,
    requiresFinancials: true,
    prefersEarningsContext: true,
    requiresQuarterReportContext: true,
  };

  const attachment: UploadedAttachmentContext = {
    name: 'FY26_Q1_Consolidated_Financial_Statements.pdf',
    mimeType: 'application/pdf',
    sizeKb: 512,
    kind: 'document',
    summary: 'Apple quarterly financial statements',
    warnings: [],
    signals: {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      fiscalPeriod: 'Q1 2026',
      keyLines: [],
    },
  };

  const route = overrideRouteFromAttachment(baseRoute, 'find me amazons q1 financials', attachment);
  assert.deepEqual(route, baseRoute);
});
