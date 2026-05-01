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

test('forecast plus valuation impact prompts route into deterministic model generation', () => {
  const route = routeAnalystQuery('Analyze GOOGL with a forward forecast and valuation impact');

  assert.equal(route.intent, 'financial_model');
  assert.ok(route.tickers.includes('GOOGL'));
});

test('plain multi-year forecast prompts stay company questions for forecast-layer handling', () => {
  const route = routeAnalystQuery('Forecast Google for the next 4 years');

  assert.equal(route.intent, 'company_question');
  assert.ok(route.tickers.includes('GOOGL'));
});

test('generic company earnings prompts prefer earnings-context retrieval', () => {
  const earningsRoute = routeAnalystQuery("Tell me about Amazon's earnings");

  assert.equal(earningsRoute.intent, 'company_question');
  assert.ok(
    earningsRoute.tickers.includes('AMZN'),
    'expected AMZN to be resolved for a generic earnings-summary request',
  );
  assert.equal(earningsRoute.prefersEarningsContext, true);
});

test('generic possessive company earnings prompts still resolve ticker and earnings context', () => {
  const earningsRoute = routeAnalystQuery('tell me about amazons earnings');

  assert.equal(earningsRoute.intent, 'company_question');
  assert.ok(
    earningsRoute.tickers.includes('AMZN'),
    'expected AMZN to be resolved for possessive earnings-summary wording',
  );
  assert.equal(earningsRoute.prefersEarningsContext, true);
});
