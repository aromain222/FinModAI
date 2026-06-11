import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { evaluateQuantSignal } from '@/lib/pm/monitoring/evaluateSignal';
import type { QuantScoreSnapshot } from '@/lib/pm/monitoring/types';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function snapshot(
  analystKey: QuantScoreSnapshot['analystKey'],
  score: number,
  signal: QuantScoreSnapshot['signal'] = 'neutral',
): QuantScoreSnapshot {
  return {
    id: crypto.randomUUID(),
    ticker: 'NVDA',
    analystKey,
    analystName: analystKey,
    score,
    signal,
    confidence: 75,
    reasoning: `${analystKey} moved`,
    watch: 'Next update',
    source: 'hedge_fund_monitoring',
    observedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

describe('evaluateQuantSignal', () => {
  it('does not create an event for the first historical score', () => {
    assert.equal(evaluateQuantSignal(null, snapshot('growth', 70, 'bullish')), null);
  });

  it('creates but does not escalate a change at the configured scout threshold', () => {
    process.env.QUANT_GROWTH_CHANGE_THRESHOLD = '15';
    process.env.QUANT_GROWTH_ESCALATION_THRESHOLD = '25';
    const event = evaluateQuantSignal(
      snapshot('growth', 75, 'bullish'),
      snapshot('growth', 60, 'neutral'),
    );
    assert.ok(event);
    assert.equal(event.kind, 'score_change');
    assert.equal(event.delta, -15);
    assert.equal(event.status, 'open');
    assert.equal(event.shouldEscalate, false);
  });

  it('escalates a sentiment drop beyond the configured escalation threshold', () => {
    process.env.QUANT_SENTIMENT_CHANGE_THRESHOLD = '10';
    process.env.QUANT_SENTIMENT_ESCALATION_THRESHOLD = '20';
    const event = evaluateQuantSignal(
      snapshot('sentiment', 72, 'bullish'),
      snapshot('sentiment', 50, 'neutral'),
    );
    assert.ok(event);
    assert.equal(event.delta, -22);
    assert.equal(event.status, 'escalated');
    assert.equal(event.severity, 'high');
  });

  it('treats a valuation overextension crossing as an escalation', () => {
    process.env.QUANT_VALUATION_OVEREXTENDED_SCORE = '30';
    const event = evaluateQuantSignal(
      snapshot('valuation', 45, 'neutral'),
      snapshot('valuation', 28, 'bearish'),
    );
    assert.ok(event);
    assert.equal(event.kind, 'valuation_overextended');
    assert.equal(event.shouldEscalate, true);
  });

  it('treats a technical trend break as an escalation', () => {
    process.env.QUANT_TECHNICAL_BREAK_SCORE = '35';
    const event = evaluateQuantSignal(
      snapshot('technicals', 58, 'bullish'),
      snapshot('technicals', 34, 'bearish'),
    );
    assert.ok(event);
    assert.equal(event.kind, 'technical_break');
    assert.equal(event.status, 'escalated');
    assert.equal(event.severity, 'critical');
  });
});
