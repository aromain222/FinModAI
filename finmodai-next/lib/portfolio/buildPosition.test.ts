import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RankedStock } from '@/lib/ranking/types';
import { buildPositionFromRankedStock } from '@/lib/portfolio/buildPosition';

const stock: RankedStock = {
  ticker: 'AAPL',
  score: 7.2,
  signal: 'green',
  horizonWeeks: 6,
  primaryReason: 'Earnings durability supports the thesis.',
  mainRisk: 'Valuation compression.',
  breakdown: {
    forecastSignal: 7,
    catalystStrength: 7,
    momentum: 7,
    earningsSetup: 7,
    valuationSignal: 6,
    riskAdjustment: 6,
  },
  meta: {
    forecastReturnPct: 8,
    catalystCount: 0,
    dataSource: 'live',
    scoredAt: '2026-06-11T12:00:00.000Z',
  },
};

describe('buildPositionFromRankedStock', () => {
  it('anchors position economics and timeline to the supplied purchase date', () => {
    const position = buildPositionFromRankedStock(
      stock,
      68.98,
      null,
      1000,
      '2025-06-11T12:00:00.000Z',
    );

    assert.equal(position.entryDate, '2025-06-11T12:00:00.000Z');
    assert.equal(position.timeline[0]?.date, position.entryDate);
    assert.equal(position.costBasis, 68_980);
    assert.equal(position.notionalUsd, 68_980);
    assert.equal(position.shares, 1000);
    assert.notEqual(position.addedAt, position.entryDate);
  });
});
