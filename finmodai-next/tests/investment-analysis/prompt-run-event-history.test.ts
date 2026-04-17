import assert from 'node:assert/strict';
import test from 'node:test';

import {
  toPromptRunEventAdjustmentSummary,
  toPromptRunEventContext,
} from '@/lib/model-generator/runHistory';

test('prompt run event context keeps compact source metadata only', () => {
  const context = toPromptRunEventContext({
    sourceType: 'feed_item',
    eventId: 'evt-123',
    title: 'Fed signals slower cuts',
    rawEventText: 'This should not be persisted into compact run history context.',
    publishedAt: '2026-04-17T13:00:00.000Z',
    sourceUrl: 'https://example.com/fed-story',
    sourceLabel: 'Reuters',
  });

  assert.deepEqual(context, {
    sourceType: 'feed_item',
    eventId: 'evt-123',
    title: 'Fed signals slower cuts',
    publishedAt: '2026-04-17T13:00:00.000Z',
    sourceUrl: 'https://example.com/fed-story',
    sourceLabel: 'Reuters',
  });
});

test('prompt run event adjustment summary compacts changed-driver history', () => {
  const summary = toPromptRunEventAdjustmentSummary({
    normalizedEventSummary: 'Rates stayed higher for longer, pressuring valuation multiples.',
    eventCategory: 'macro_shift',
    confidence: 'high',
    scenarioBias: 'bearish',
    changedDrivers: [
      {
        driver: 'wacc',
        label: 'WACC',
        old: 0.09,
        new: 0.095,
        rationale: 'Ignored in compact history payload.',
      },
    ],
    warnings: ['Review rate sensitivity before relying on the valuation delta.'],
    blockingErrors: [],
    transcription: {
      eventSummary: 'Rates stayed higher for longer, pressuring valuation multiples.',
      whatChanged: 'The discount-rate backdrop tightened.',
      whyItMatters: 'The valuation effect shows up through discount rates and terminal sensitivity.',
      transmissionChannels: ['financing', 'structural_outlook'],
      companyExposure: 'Exposure looks more macro than company-specific, so the model effect stays conservative.',
      suggestedImpacts: {
        business: [],
        market: [],
        model: [],
      },
      suggestedAssumptions: [
        {
          driver: 'wacc',
          label: 'WACC',
          direction: 'up',
          magnitude: 'medium',
          rationale: 'Higher required returns should move WACC first.',
        },
      ],
      confidence: 'high',
      warnings: ['Macro signal only.'],
    },
  });

  assert.deepEqual(summary, {
    normalizedEventSummary: 'Rates stayed higher for longer, pressuring valuation multiples.',
    eventCategory: 'macro_shift',
    confidence: 'high',
    scenarioBias: 'bearish',
    changedDrivers: [
      {
        driver: 'wacc',
        label: 'WACC',
        old: 0.09,
        new: 0.095,
      },
    ],
    warnings: ['Review rate sensitivity before relying on the valuation delta.'],
    blockingErrors: [],
    transcription: {
      eventSummary: 'Rates stayed higher for longer, pressuring valuation multiples.',
      whatChanged: 'The discount-rate backdrop tightened.',
      whyItMatters: 'The valuation effect shows up through discount rates and terminal sensitivity.',
      transmissionChannels: ['financing', 'structural_outlook'],
      companyExposure: 'Exposure looks more macro than company-specific, so the model effect stays conservative.',
      suggestedImpacts: {
        business: [],
        market: [],
        model: [],
      },
      suggestedAssumptions: [
        {
          driver: 'wacc',
          label: 'WACC',
          direction: 'up',
          magnitude: 'medium',
          rationale: 'Higher required returns should move WACC first.',
        },
      ],
      confidence: 'high',
      warnings: ['Macro signal only.'],
    },
  });
});
