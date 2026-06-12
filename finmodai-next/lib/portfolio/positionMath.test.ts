import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActivePosition } from '@/lib/portfolio/types';
import { positionEconomics, positionTotalCostBasis } from '@/lib/portfolio/positionMath';

function position(overrides: Partial<ActivePosition> = {}): ActivePosition {
  return {
    id: 'aapl',
    ticker: 'AAPL',
    entryDate: '2026-06-11T12:00:00.000Z',
    entryPrice: 68.98,
    currentPrice: 295.63,
    shares: 1000,
    costBasis: 68.98,
    notionalUsd: 68.98,
    entryScore: 5,
    currentScore: 5.3,
    entrySignal: 'yellow',
    currentSignal: 'yellow',
    status: 'working',
    thesisDrift: 'stable',
    thesisSummary: '',
    currentStance: '',
    nextCatalyst: '',
    keyRisks: '',
    watchItems: [],
    timeline: [],
    addedAt: '2026-06-11T12:00:00.000Z',
    ...overrides,
  };
}

describe('position economics', () => {
  it('repairs legacy records that stored per-share price as total cost basis', () => {
    assert.equal(positionTotalCostBasis(position()), 68_980);
    const result = positionEconomics(position(), 295.63);
    assert.equal(result.marketValue, 295_630);
    assert.equal(result.pnlUsd, 226_650);
    assert.ok(Math.abs(result.pnlPct - 328.57) < 0.01);
  });

  it('preserves a valid total cost basis', () => {
    assert.equal(positionTotalCostBasis(position({ costBasis: 68_980, notionalUsd: 68_980 })), 68_980);
  });
});
