import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveEventLinkedModelAdjustment } from '@/lib/model-events/deriveEventLinkedModelAdjustment';

test('deriveEventLinkedModelAdjustment uses transmission path, not category alone, for driver deltas', async () => {
  const result = await deriveEventLinkedModelAdjustment({
    event: {
      sourceType: 'pasted_text',
      title: 'Enterprise demand slows',
      rawEventText: 'Enterprise spending slowdown and weak demand point to a broader macro slowdown for software budgets.',
    },
    company: {
      companyName: 'Acme Software',
      ticker: 'ACME',
      sector: 'Software',
      industry: 'Application software',
    },
    currentAssumptions: {
      revenue_growth: 0.12,
      operating_margin: 0.24,
      wacc: 0.095,
      terminal_growth_rate: 0.025,
    },
    modelType: 'DCF',
  });

  assert.equal(result.eventCategory, 'macro_slowdown');
  assert.equal(result.changes.cogs_percentage.old, null);
  assert.equal(result.changes.opex_percentage.old, null);
  assert.equal(result.changes.multiple.old, null);
  assert.ok(result.changedDrivers.some((change) => change.driver === 'revenue_growth'));
  assert.ok(result.changedDrivers.some((change) => change.driver === 'operating_margin') === false);
  assert.ok(result.normalizedOverrides.revenue_growth !== undefined);
  assert.equal(result.normalizedOverrides.wacc, undefined);
  assert.equal(result.blockingErrors.length, 0);
  assert.ok(result.transcription.transmissionChannels.includes('demand'));
  assert.equal(result.transcription.suggestedAssumptions.some((item) => item.driver === 'wacc'), false);
});
