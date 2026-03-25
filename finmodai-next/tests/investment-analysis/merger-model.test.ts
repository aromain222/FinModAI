import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { extractInputs } from '@/lib/model-generator/extractInputs';

test('accretion-dilution prompts classify into MERGER', () => {
  const modelType = classifyPrompt('Build an accretion dilution model for Microsoft acquiring Salesforce at $95B');

  assert.equal(modelType, 'MERGER');
});

test('merger prompts extract acquirer, target, and purchase price', async () => {
  const result = await extractInputs(
    'Build an accretion dilution model for Microsoft acquiring Salesforce at $95B with 60% cash and 40% stock',
    'MERGER',
  );

  assert.equal(result.extractedInputs.modelType, 'MERGER');
  assert.equal(result.extractedInputs.acquirerTicker, 'MSFT');
  assert.equal(result.extractedInputs.targetTicker, 'CRM');
  assert.equal(result.extractedInputs.purchasePrice, 95_000);
  assert.equal(result.extractedInputs.cashPct, 0.6);
  assert.equal(result.extractedInputs.stockPct, 0.4);
});
