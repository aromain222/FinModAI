import assert from 'node:assert/strict';
import test from 'node:test';
import { forecastScenario, normalizeSleeveWeights } from './buildThesisSleeve';
import type { RankedStock } from '@/lib/ranking/types';

function rankedStock(overrides: Partial<RankedStock['meta']> = {}): RankedStock {
  return {
    ticker: 'TEST',
    score: 7.5,
    signal: 'green',
    horizonWeeks: 6,
    primaryReason: 'Positive estimate and catalyst setup.',
    mainRisk: 'Crowded positioning.',
    breakdown: {
      forecastSignal: 8,
      catalystStrength: 7,
      momentum: 6,
      earningsSetup: 7,
      valuationSignal: 5,
      riskAdjustment: 6,
    },
    meta: {
      scoredAt: '2026-07-13T12:00:00.000Z',
      dataSource: 'live',
      forecastReturnPct: 9,
      catalystCount: 0,
      catalysts: [],
      ...overrides,
    },
  };
}

test('normalizeSleeveWeights preserves requested cash and relative weights', () => {
  const weights = normalizeSleeveWeights([50, 30, 20], 15);
  assert.deepEqual(weights, [42.5, 25.5, 17]);
  assert.equal(weights.reduce((sum, value) => sum + value, 0), 85);
});

test('normalizeSleeveWeights handles invalid model weights without NaN', () => {
  const weights = normalizeSleeveWeights([Number.NaN, -2, 0], 10);
  assert.deepEqual(weights, [30, 30, 30]);
});

test('forecastScenario returns ordered risk-band scenarios', () => {
  const scenario = forecastScenario(rankedStock(), 45);
  assert.equal(scenario.baseReturnPct, 9);
  assert.ok(scenario.bearReturnPct !== null && scenario.bearReturnPct < 9);
  assert.ok(scenario.bullReturnPct !== null && scenario.bullReturnPct > 9);
  assert.match(scenario.source, /ranked forecast/i);
});

test('forecastScenario does not invent a prediction when provider forecast is absent', () => {
  const scenario = forecastScenario(rankedStock({ forecastReturnPct: null }), 45);
  assert.equal(scenario.bearReturnPct, null);
  assert.equal(scenario.baseReturnPct, null);
  assert.equal(scenario.bullReturnPct, null);
  assert.match(scenario.source, /no provider-backed forecast/i);
});
