import test from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/analyst-chat/model-export/route';
import { generateAnalystStructuredModel } from '@/lib/analyst/modelChat';

test('analyst model export route accepts canonical DCF payloads', async () => {
  const generated = await generateAnalystStructuredModel('Build a DCF using the attached PDF.', null, {
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

  assert.ok(generated, 'expected generated DCF payload');

  const request = new NextRequest('http://localhost/api/analyst-chat/model-export', {
    method: 'POST',
    body: JSON.stringify({ payload: generated.payload }),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const response = await POST(request);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  assert.equal(
    response.headers.get('Content-Type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
});
