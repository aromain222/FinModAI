import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { NextRequest } from 'next/server';
import { POST as createJob } from '@/app/api/financial-extraction/jobs/route';
import { GET as getModelInputs } from '@/app/api/financial-extraction/jobs/[jobId]/model-inputs/route';
import { financialExtractionRouteDeps } from '@/lib/data/financial-extraction/routeDeps';

test('financial extraction job route creates and returns persisted snapshot state', async () => {
  const createMock = mock.method(
    financialExtractionRouteDeps,
    'createAndProcessFinancialExtractionJob',
    async () => ({
      id: 'job-123',
      lane: 'public' as const,
      stage: 'completed' as const,
      validationState: 'ok' as const,
      request: { lane: 'public' as const, ticker: 'AAPL' },
      resolvedIdentity: null,
      sourceArtifacts: [],
      facts: [],
      validationFindings: [],
      mappedModelInputs: null,
      snapshot: {
        companyName: 'Apple Inc.',
        ticker: 'AAPL',
        cik: '0000320193',
        lane: 'public',
        validationState: 'ok',
        warnings: [],
        blockingErrors: [],
        facts: [],
        mappedModelInputs: null,
        sourceArtifacts: [],
      },
      errorMessage: null,
      createdAt: '2026-04-16T12:00:00.000Z',
      updatedAt: '2026-04-16T12:00:00.000Z',
    }),
  );

  try {
    const request = new NextRequest('http://localhost/api/financial-extraction/jobs', {
      method: 'POST',
      body: JSON.stringify({ lane: 'public', ticker: 'AAPL', targetPeriodType: 'ltm' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await createJob(request);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.jobId, 'job-123');
    assert.equal(body.validationState, 'ok');
  } finally {
    createMock.mock.restore();
  }
});

test('financial extraction model-inputs route rejects blocking snapshots', async () => {
  const getMock = mock.method(financialExtractionRouteDeps, 'getFinancialExtractionJob', async () => ({
    id: 'job-456',
    lane: 'private' as const,
    stage: 'completed' as const,
    validationState: 'blocking_error' as const,
    request: { lane: 'private' as const, companyName: 'PrivateCo', fileIds: ['file.pdf'] },
    resolvedIdentity: null,
    sourceArtifacts: [],
    facts: [],
    validationFindings: [],
    mappedModelInputs: null,
    snapshot: {
      companyName: 'PrivateCo',
      lane: 'private',
      validationState: 'blocking_error',
      warnings: [],
      blockingErrors: ['Revenue is still missing.'],
      facts: [],
      mappedModelInputs: null,
      sourceArtifacts: [],
    },
    errorMessage: null,
    createdAt: '2026-04-16T12:00:00.000Z',
    updatedAt: '2026-04-16T12:00:00.000Z',
  }));

  try {
    const response = await getModelInputs(
      new NextRequest('http://localhost/api/financial-extraction/jobs/job-456/model-inputs'),
      { params: Promise.resolve({ jobId: 'job-456' }) },
    );
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.match(String(body.error ?? ''), /not model-ready/i);
  } finally {
    getMock.mock.restore();
  }
});
