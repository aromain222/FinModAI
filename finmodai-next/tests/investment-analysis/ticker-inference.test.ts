import assert from 'node:assert/strict';
import test from 'node:test';

import { inferTickerFromPrompt } from '@/lib/analyst/retrieval';

test('ticker inference prefers company aliases over event acronyms', () => {
  const ticker = inferTickerFromPrompt(
    'Analyze Google as an investment assuming DOJ search and ad-tech remedies continue to pressure distribution and ad economics',
  );

  assert.equal(ticker, 'GOOGL');
});

test('ticker inference still supports explicit ticker-led prompts', () => {
  const ticker = inferTickerFromPrompt('Compare AMD vs NVDA as investments');

  assert.equal(ticker, 'AMD');
});
