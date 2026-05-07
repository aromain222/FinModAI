import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExpectedMoveContext, formatExpectedMoveRange } from './expectedMove';
import type { RankedStock } from './types';

function stockFixture(overrides: Partial<RankedStock> = {}): RankedStock {
  return {
    ticker: 'TEST',
    score: 6.5,
    signal: 'yellow',
    horizonWeeks: 6,
    primaryReason: 'Test reason',
    mainRisk: 'Test risk',
    breakdown: {
      forecastSignal: 7.5,
      catalystStrength: 8.0,
      momentum: 7.0,
      earningsSetup: 6.5,
      valuationSignal: 5.0,
      riskAdjustment: 5.0,
    },
    meta: {
      forecastReturnPct: 8,
      catalystCount: 2,
      dataSource: 'live',
      scoredAt: '2026-05-07T00:00:00.000Z',
    },
    ...overrides,
  };
}

test('buildExpectedMoveContext returns ordered swing ranges without exact targets', () => {
  const context = buildExpectedMoveContext(stockFixture());

  assert.ok(context.baseLowPct <= context.baseHighPct);
  assert.ok(context.bullPct >= context.baseHighPct);
  assert.ok(context.riskPct < 0);
  assert.match(context.summary, /Driven by/);
});

test('buildExpectedMoveContext widens downside risk for weak risk and valuation factors', () => {
  const strongRisk = buildExpectedMoveContext(stockFixture({
    breakdown: {
      forecastSignal: 7.5,
      catalystStrength: 8.0,
      momentum: 7.0,
      earningsSetup: 6.5,
      valuationSignal: 6.5,
      riskAdjustment: 7.5,
    },
  }));
  const weakRisk = buildExpectedMoveContext(stockFixture({
    breakdown: {
      forecastSignal: 7.5,
      catalystStrength: 8.0,
      momentum: 7.0,
      earningsSetup: 6.5,
      valuationSignal: 3.5,
      riskAdjustment: 3.0,
    },
  }));

  assert.ok(Math.abs(weakRisk.riskPct) > Math.abs(strongRisk.riskPct));
});

test('formatExpectedMoveRange uses directional percentages', () => {
  assert.equal(formatExpectedMoveRange(8, 14), '+8% to +14%');
  assert.equal(formatExpectedMoveRange(-6, 3), '-6% to +3%');
});
