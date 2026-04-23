import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCurrentAssumptionsFromGeneratedModel,
  buildSmartAssumptionRequestFromGeneratedModel,
  getGeneratedModelIdentity,
  supportsSmartAssumptionAdjustment,
} from '@/lib/analyst/modelAdjustmentHelpers';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/types';

function makeGeneratedModelPayload(
  extractedInputs: Record<string, unknown>,
  overrides: Partial<AnalystGeneratedModelPayload> = {},
): AnalystGeneratedModelPayload {
  return {
    prompt: 'Build a DCF model',
    modelType: 'DCF',
    title: 'Fallback Model Title',
    tabs: ['Cover', 'Assumptions'],
    keyOutputs: ['Enterprise Value'],
    scenarioContext: null,
    extractedInputs,
    defaultsUsed: {},
    provenanceSummary: {
      sourceType: 'cached_real',
      asOfDate: '2026-03-24',
      sources: ['fmp'],
      fallbackUsed: false,
    },
    comparisonSummary: null,
    recentRun: null,
    narrativeBlocks: [],
    ...overrides,
  };
}

test('buildCurrentAssumptionsFromGeneratedModel pulls the writable scalar snapshot from arrays', () => {
  const payload = makeGeneratedModelPayload({
    revenueGrowth: [0.12, 0.1, 0.08],
    ebitMargin: [0.15, 0.16, 0.17],
    wacc: 0.09,
    terminalGrowth: 0.025,
  });

  assert.deepEqual(buildCurrentAssumptionsFromGeneratedModel(payload), {
    revenue_growth: 0.12,
    operating_margin: 0.15,
    wacc: 0.09,
    terminal_growth_rate: 0.025,
  });
});

test('buildCurrentAssumptionsFromGeneratedModel falls back to EBITDA margin and nulls missing fields', () => {
  const payload = makeGeneratedModelPayload({
    ebitdaMargin: [0.28, 0.29],
    wacc: null,
  });

  assert.deepEqual(buildCurrentAssumptionsFromGeneratedModel(payload), {
    revenue_growth: null,
    operating_margin: 0.28,
    wacc: null,
    terminal_growth_rate: null,
  });
});

test('getGeneratedModelIdentity prefers extracted company identity and normalizes ticker', () => {
  const payload = makeGeneratedModelPayload({
    companyName: 'Tesla, Inc.',
    ticker: 'tsla',
  });

  assert.deepEqual(getGeneratedModelIdentity(payload), {
    companyName: 'Tesla, Inc.',
    ticker: 'TSLA',
  });
});

test('getGeneratedModelIdentity falls back to payload title when companyName is absent', () => {
  const payload = makeGeneratedModelPayload({
    revenueGrowth: [0.1],
  });

  assert.deepEqual(getGeneratedModelIdentity(payload), {
    companyName: 'Fallback Model Title',
    ticker: null,
  });
});

test('buildSmartAssumptionRequestFromGeneratedModel assembles the exact request envelope', () => {
  const payload = makeGeneratedModelPayload({
    companyName: 'Tesla, Inc.',
    ticker: 'TSLA',
    revenueGrowth: [0.12, 0.1],
    ebitMargin: [0.15, 0.16],
    wacc: 0.09,
    terminalGrowth: 0.025,
  });

  assert.deepEqual(buildSmartAssumptionRequestFromGeneratedModel(payload), {
    company: {
      companyName: 'Tesla, Inc.',
      ticker: 'TSLA',
    },
    currentAssumptions: {
      revenue_growth: 0.12,
      operating_margin: 0.15,
      wacc: 0.09,
      terminal_growth_rate: 0.025,
    },
    modelType: 'DCF',
  });
});

test('supportsSmartAssumptionAdjustment only returns true when the model exposes writable fields', () => {
  const writablePayload = makeGeneratedModelPayload({
    revenueGrowth: [0.12, 0.1],
    wacc: 0.09,
  });
  const nonWritablePayload = makeGeneratedModelPayload({
    companyName: 'Tesla, Inc.',
    ticker: 'TSLA',
    sharesOutstanding: 3800000000,
  });

  assert.equal(supportsSmartAssumptionAdjustment(writablePayload), true);
  assert.equal(supportsSmartAssumptionAdjustment(nonWritablePayload), false);
});
