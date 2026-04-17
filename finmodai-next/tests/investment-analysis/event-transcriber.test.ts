import assert from 'node:assert/strict';
import test from 'node:test';

import { transcribeEventForModeling } from '@/lib/model-events/transcribeEventForModeling';

test('transcriber maps rate-shock language into financing impacts and WACC pressure', () => {
  const result = transcribeEventForModeling({
    event: {
      sourceType: 'pasted_text',
      title: 'Fed signals higher-for-longer',
      rawEventText:
        'The Fed signaled higher-for-longer rates, tighter funding conditions, and a more restrictive refinancing backdrop.',
    },
    company: {
      companyName: 'Duration Software',
      ticker: 'DURA',
      sector: 'Software',
    },
    modelType: 'DCF',
  });

  assert.ok(result.transcription.transmissionChannels.includes('financing'));
  assert.ok(result.transcription.suggestedAssumptions.some((item) => item.driver === 'wacc' && item.direction === 'up'));
  assert.ok(result.transcription.suggestedImpacts.market.some((item) => item.key === 'rates'));
});

test('transcriber maps company demand shock into forecast drivers instead of discount-rate changes', () => {
  const result = transcribeEventForModeling({
    event: {
      sourceType: 'pasted_text',
      title: 'Retail demand weakens',
      rawEventText:
        'Weak demand, lower orders, and promotional pricing are pressuring sales and margins for the company.',
    },
    company: {
      companyName: 'ConsumerCo',
      ticker: 'SHOP',
      sector: 'Consumer',
    },
    modelType: 'THREE_STATEMENT',
  });

  assert.ok(result.transcription.suggestedAssumptions.some((item) => item.driver === 'revenue_growth' && item.direction === 'down'));
  assert.ok(result.transcription.suggestedAssumptions.some((item) => item.driver === 'operating_margin' && item.direction === 'down'));
  assert.equal(result.transcription.suggestedAssumptions.some((item) => item.driver === 'wacc'), false);
});

test('same category text with different channels produces different suggested drivers', () => {
  const demandShock = transcribeEventForModeling({
    event: {
      sourceType: 'pasted_text',
      title: 'Macro slowdown hits demand',
      rawEventText: 'Macro slowdown and weak demand are pressuring customer orders and revenue visibility.',
    },
    company: {
      companyName: 'Acme',
      ticker: 'ACME',
      sector: 'Industrials',
    },
  });

  const financingShock = transcribeEventForModeling({
    event: {
      sourceType: 'pasted_text',
      title: 'Macro slowdown tightens funding',
      rawEventText: 'Macro slowdown and tighter funding conditions are raising refinancing risk and capital costs.',
    },
    company: {
      companyName: 'Acme',
      ticker: 'ACME',
      sector: 'Industrials',
    },
  });

  assert.notDeepEqual(
    demandShock.transcription.suggestedAssumptions.map((item) => item.driver),
    financingShock.transcription.suggestedAssumptions.map((item) => item.driver),
  );
  assert.ok(demandShock.transcription.suggestedAssumptions.some((item) => item.driver === 'revenue_growth'));
  assert.ok(financingShock.transcription.suggestedAssumptions.some((item) => item.driver === 'wacc'));
});
