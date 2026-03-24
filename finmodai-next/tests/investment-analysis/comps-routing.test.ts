import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { extractInputs } from '@/lib/model-generator/extractInputs';

test('compare-as-investment prompts classify into COMPS', () => {
  const modelType = classifyPrompt('Compare AMD vs Nvidia as investments');

  assert.equal(modelType, 'COMPS');
});

test('compare prompts seed the explicit second company into the comps peer set', async () => {
  const result = await extractInputs('Compare AMD vs Nvidia as investments', 'COMPS');

  assert.equal(result.extractedInputs.modelType, 'COMPS');
  assert.equal(result.extractedInputs.ticker, 'AMD');
  assert.ok(
    result.extractedInputs.peers.some((peer) => peer.ticker === 'NVDA'),
    'expected NVDA to be included explicitly in the peer set',
  );
});
