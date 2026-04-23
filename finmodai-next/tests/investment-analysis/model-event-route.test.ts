import assert from 'node:assert/strict';
import test from 'node:test';

import { NextRequest } from 'next/server';
import { POST as deriveModelEventAdjustment } from '@/app/api/model-events/derive/route';

test('model-events derive route returns reviewed event-linked deltas', async () => {
  const response = await deriveModelEventAdjustment(
    new NextRequest('http://localhost/api/model-events/derive', {
      method: 'POST',
      body: JSON.stringify({
        event: {
          sourceType: 'pasted_text',
          rawEventText: 'Oil shock raises input costs and pressures demand across cyclical sectors.',
          title: 'Oil shock',
        },
        company: {
          companyName: 'Roadrunner Logistics',
          ticker: 'ROAD',
          sector: 'Industrials',
        },
        currentAssumptions: {
          revenue_growth: 0.1,
          operating_margin: 0.18,
          wacc: 0.09,
          terminal_growth_rate: 0.025,
        },
        modelType: 'THREE_STATEMENT',
      }),
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(typeof body.normalizedEventSummary, 'string');
  assert.equal(typeof body.summary, 'string');
  assert.ok(Array.isArray(body.changedDrivers));
  assert.equal(typeof body.transcription?.eventSummary, 'string');
  assert.ok(Array.isArray(body.transcription?.suggestedAssumptions));
  assert.ok('normalizedOverrides' in body);
});
