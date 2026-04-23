import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '@/app/api/scenarios/ai-smart-dcf/route';
import {
  buildAiSmartDcfReport,
  RATES_DOWN_100BPS_SCENARIO,
  TESLA_BASE_CASE,
} from '@/lib/scenarios/aiSmartDcf';

test('ai smart dcf report applies the macro shock before valuation', () => {
  const report = buildAiSmartDcfReport();

  assert.equal(report.company, 'Tesla');
  assert.equal(report.adjustedAssumptions.growth, 0.13);
  assert.equal(report.adjustedAssumptions.margin, 0.175);
  assert.ok(Math.abs(report.adjustedAssumptions.discount_rate - 0.09) < 1e-9);
  assert.ok(report.scenarioValuation.enterprise_value > report.baseValuation.enterprise_value);
  assert.equal(report.sections.length, 6);
  assert.match(report.formattedResponse, /SECTION 1: Earnings Snapshot/);
  assert.match(report.formattedResponse, /SECTION 3: Scenario-Based DCF Output/);
  assert.match(report.formattedResponse, /Base Valuation \(estimate\): \$245\.1B enterprise value/);
  assert.match(report.formattedResponse, /Scenario Valuation: \$343\.0B enterprise value/);
  assert.match(report.formattedResponse, /% Change: 39\.9%/);
});

test('ai smart dcf route defaults to the Tesla scenario workflow', async () => {
  const response = await POST(
    new Request('http://localhost:3000/api/scenarios/ai-smart-dcf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.baseCase.company, TESLA_BASE_CASE.company);
  assert.equal(payload.scenario.name, RATES_DOWN_100BPS_SCENARIO.name);
  assert.equal(payload.sections[0]?.title, 'SECTION 1: Earnings Snapshot');
  assert.equal(payload.sections[5]?.title, 'SECTION 6: Risks');
});

test('ai smart dcf route rejects invalid discount rates that break the terminal value formula', async () => {
  const response = await POST(
    new Request('http://localhost:3000/api/scenarios/ai-smart-dcf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseCase: {
          company: 'Tesla',
          revenue: 100_000_000_000,
          growth: 0.08,
          margin: 0.18,
          discount_rate: 0.03,
        },
      }),
    }),
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /terminal growth/i);
});
