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

test('forecast-model prompts route into deterministic model generation', () => {
  const forecastRoute = routeAnalystQuery(
    'Build a 5-year three-statement forecast model for Nvidia (NVDA). Output a structured model, not narrative prose. Include yearly revenue, EBITDA, EBIT, net income, capex, working capital, debt, and ending cash.',
  );

  assert.equal(forecastRoute.intent, 'financial_model');
  assert.ok(
    forecastRoute.tickers.includes('NVDA'),
    'expected NVDA to be resolved for the forecast-model request',
  );
});
