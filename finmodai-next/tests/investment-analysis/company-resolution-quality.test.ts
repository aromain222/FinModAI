import assert from 'node:assert/strict';
import test from 'node:test';

import { routeAnalystQuery } from '@/lib/analyst/router';
import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';

test('extractCompanyQuery resolves expanded quality-universe aliases for core model companies', () => {
  const palantir = extractCompanyQuery({ prompt: 'Build a DCF for Palantir' });
  assert.equal(palantir.ticker, 'PLTR');

  const autodesk = extractCompanyQuery({ prompt: 'Build a football field for Autodesk' });
  assert.equal(autodesk.ticker, 'ADSK');

  const rtx = extractCompanyQuery({ prompt: 'Run trading comps for RTX' });
  assert.equal(rtx.ticker, 'RTX');
});

test('analyst router resolves expanded company aliases for model prompts', () => {
  const autodeskRoute = routeAnalystQuery('Build a football field for Autodesk');
  assert.equal(autodeskRoute.intent, 'financial_model');
  assert.ok(autodeskRoute.tickers.includes('ADSK'));

  const palantirRoute = routeAnalystQuery('Build a DCF for Palantir');
  assert.equal(palantirRoute.intent, 'financial_model');
  assert.ok(palantirRoute.tickers.includes('PLTR'));
});
