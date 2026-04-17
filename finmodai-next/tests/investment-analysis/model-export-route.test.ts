import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/analyst-chat/model-export/route';
import { analystModelExportDeps } from '@/lib/analyst/analystModelExportDeps';
import {
  buildAnalystGeneratedModelExportSeed,
  generateAnalystStructuredModel,
} from '@/lib/analyst/modelChat';

async function buildGeneratedAttachmentDcf() {
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
  assert.ok(!generated.validationFailed, 'expected validated DCF payload');
  if (!generated || generated.validationFailed) {
    throw new Error('expected generated DCF payload');
  }
  return generated;
}

test('analyst model export route rebuilds workbook from saved run version', async () => {
  const generated = await buildGeneratedAttachmentDcf();

  const getPromptModelRunVersionMock = mock.method(analystModelExportDeps, 'getPromptModelRunVersion', async () => ({
    run: {
      id: 'run-123',
      surface: 'analyst_chat',
      sessionId: 'session-123',
      prompt: generated.payload.prompt,
      modelType: generated.payload.modelType,
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      status: 'generated',
      createdAt: '2026-04-02T16:00:00.000Z',
      updatedAt: '2026-04-02T16:00:00.000Z',
      latestVersion: null,
    },
    version: {
      id: 'version-123',
      runId: 'run-123',
      versionNumber: 3,
      status: 'generated',
      assumptions: {},
      defaultsUsed: generated.payload.defaultsUsed,
      extractedInputs: generated.payload.extractedInputs as Record<string, unknown>,
      provenance: generated.payload.provenanceSummary,
      comparison: generated.payload.comparisonSummary,
      workbookFilename: null,
      exportSeed: buildAnalystGeneratedModelExportSeed(generated.payload),
      createdAt: '2026-04-02T16:05:00.000Z',
    },
  }));

  try {
    const request = new NextRequest('http://localhost/api/analyst-chat/model-export', {
      method: 'POST',
      body: JSON.stringify({ runId: 'run-123' }),
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
    assert.equal(getPromptModelRunVersionMock.mock.calls.length, 1);
  } finally {
    getPromptModelRunVersionMock.mock.restore();
  }
});

test('analyst model export route rejects legacy payload-only requests', async () => {
  const generated = await buildGeneratedAttachmentDcf();

  const request = new NextRequest('http://localhost/api/analyst-chat/model-export', {
    method: 'POST',
    body: JSON.stringify({ payload: generated.payload }),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const response = await POST(request);
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(String(body.error ?? ''), /legacy analyst chat exports/i);
});

test('analyst model export route rejects saved runs without export seed', async () => {
  const getPromptModelRunVersionMock = mock.method(analystModelExportDeps, 'getPromptModelRunVersion', async () => ({
    run: {
      id: 'run-456',
      surface: 'analyst_chat',
      sessionId: 'session-456',
      prompt: 'Build a DCF',
      modelType: 'DCF',
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      status: 'generated',
      createdAt: '2026-04-02T16:00:00.000Z',
      updatedAt: '2026-04-02T16:00:00.000Z',
      latestVersion: null,
    },
    version: {
      id: 'version-456',
      runId: 'run-456',
      versionNumber: 1,
      status: 'generated',
      assumptions: {},
      defaultsUsed: {},
      extractedInputs: {},
      provenance: null,
      comparison: null,
      workbookFilename: null,
      exportSeed: {},
      createdAt: '2026-04-02T16:05:00.000Z',
    },
  }));

  try {
    const request = new NextRequest('http://localhost/api/analyst-chat/model-export', {
      method: 'POST',
      body: JSON.stringify({ runId: 'run-456' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(String(body.error ?? ''), /does not have an exportable workbook seed/i);
  } finally {
    getPromptModelRunVersionMock.mock.restore();
  }
});
