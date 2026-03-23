import assert from 'node:assert/strict';
import test from 'node:test';

import { routeAnalystQuery } from '@/lib/analyst/router';

test('investment-style company prompts route into deterministic model generation', () => {
  const appleRoute = routeAnalystQuery('Analyze Apple as an investment');
  assert.equal(appleRoute.intent, 'financial_model');

  const eventRoute = routeAnalystQuery(
    'Analyze General Dynamics if current wartime conditions continue for the next 5 years',
  );
  assert.equal(eventRoute.intent, 'financial_model');
});

