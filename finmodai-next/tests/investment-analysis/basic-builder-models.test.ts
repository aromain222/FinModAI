import assert from 'node:assert/strict';
import test from 'node:test';

import { extractInputs } from '@/lib/model-generator/extractInputs';

test('cap table prompts extract round economics', async () => {
  const result = await extractInputs(
    'Build a cap table for a Series A raising $15m at a $60m pre-money with founder shares of 10m and option pool refresh of 12%',
    'CAP_TABLE',
  );

  assert.equal(result.extractedInputs.modelType, 'CAP_TABLE');
  const inputs = result.extractedInputs;
  if (inputs.modelType !== 'CAP_TABLE') throw new Error('unexpected model type');
  assert.equal(inputs.roundType, 'Series A');
  assert.equal(inputs.raiseAmount, 15_000_000);
  assert.equal(inputs.preMoney, 60_000_000);
  assert.equal(inputs.founderShares, 10_000_000);
  assert.equal(inputs.optionPoolRefresh, 0.12);
});

test('saas operating prompts extract explicit SaaS drivers', async () => {
  const result = await extractInputs(
    'Build a SaaS operating model for Nimbus starting ARR of $25m growing 30% with gross margin of 78% churn of 6% CAC of $18000 and ARPU of $30000',
    'SAAS_OPERATING_MODEL',
  );

  assert.equal(result.extractedInputs.modelType, 'SAAS_OPERATING_MODEL');
  const inputs = result.extractedInputs;
  if (inputs.modelType !== 'SAAS_OPERATING_MODEL') throw new Error('unexpected model type');
  assert.equal(inputs.companyName, 'Nimbus');
  assert.equal(inputs.startingArr, 25_000_000);
  assert.equal(inputs.growthRate, 0.3);
  assert.equal(inputs.grossMargin, 0.78);
  assert.equal(inputs.churn, 0.06);
  assert.equal(inputs.cac, 18_000);
  assert.equal(inputs.arpu, 30_000);
});
