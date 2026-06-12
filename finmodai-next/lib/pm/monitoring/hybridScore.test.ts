import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHybridScore, signalFromHybridScore } from '@/lib/pm/monitoring/hybridScore';

const emptyMarket = {
  price: null,
  changePct: null,
  pe: null,
  forwardPe: null,
  high52w: null,
  low52w: null,
};

describe('buildHybridScore', () => {
  it('preserves LLM judgment when deterministic coverage is unavailable', () => {
    const result = buildHybridScore({
      analystKey: 'fundamentals',
      llmScore: 73,
      market: emptyMarket,
      asOf: '2026-06-12T00:00:00.000Z',
    });
    assert.equal(result.score, 73);
    assert.equal(result.deterministicScore, null);
    assert.equal(result.llmWeight, 1);
  });

  it('weights technical market evidence more heavily than LLM judgment', () => {
    const result = buildHybridScore({
      analystKey: 'technicals',
      llmScore: 30,
      market: {
        ...emptyMarket,
        price: 95,
        changePct: 2,
        high52w: 100,
        low52w: 50,
      },
      asOf: '2026-06-12T00:00:00.000Z',
    });
    assert.equal(result.deterministicWeight, 0.75);
    assert.ok(result.score > 60);
    assert.equal(signalFromHybridScore(result.score), 'bullish');
  });

  it('makes expensive valuation evidence visible in the final score', () => {
    const result = buildHybridScore({
      analystKey: 'valuation',
      llmScore: 80,
      market: {
        ...emptyMarket,
        pe: 55,
        forwardPe: 48,
      },
      asOf: '2026-06-12T00:00:00.000Z',
    });
    assert.equal(result.deterministicWeight, 0.75);
    assert.ok(result.score < 50);
    assert.deepEqual(result.deterministicInputs, ['trailing P/E', 'forward P/E']);
  });
});
