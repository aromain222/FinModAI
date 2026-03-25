import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { extractInputs } from '@/lib/model-generator/extractInputs';

test('debt capacity prompts classify into DEBT_CAPACITY_LITE', () => {
  const modelType = classifyPrompt('Create a debt capacity model for Netflix');

  assert.equal(modelType, 'DEBT_CAPACITY_LITE');
});

test('debt capacity prompts extract leverage, coverage, and rate assumptions', async () => {
  const result = await extractInputs(
    'Create a debt capacity model for Netflix with max leverage of 5.0x, minimum interest coverage of 2.5x, and interest rate of 9%',
    'DEBT_CAPACITY_LITE',
  );

  assert.equal(result.extractedInputs.modelType, 'DEBT_CAPACITY_LITE');
  assert.equal(result.extractedInputs.ticker, 'NFLX');
  assert.equal(result.extractedInputs.maxLeverage, 5);
  assert.equal(result.extractedInputs.minInterestCoverage, 2.5);
  assert.equal(result.extractedInputs.interestRate, 0.09);
});
