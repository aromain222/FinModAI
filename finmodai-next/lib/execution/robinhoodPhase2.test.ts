import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeRobinhoodPhase2Add,
  issueRobinhoodPhase2Authorization,
  verifyRobinhoodPhase2Authorization,
} from '@/lib/execution/robinhoodPhase2';
import type { InvestmentDecision } from '@/lib/pm/types';

const now = new Date('2026-07-11T17:00:00Z');

function decision(): InvestmentDecision {
  return {
    id: 'decision-1', ticker: 'NVDA', action: 'buy', recommendation: 'BUY', approvalStatus: 'pending', approvedBy: null,
    rationale: 'Sourced setup', evidence: [], linkedAlertId: null, confidence: 82,
    createdAt: '2026-07-11T16:50:00Z', updatedAt: '2026-07-11T16:50:00Z',
    liveExecutionGate: { phase: 'robinhood_phase2', eligible: true, agreement: 'unanimous', committeeDecision: 'work_up', committeeConfidence: 72, blockers: [] },
  };
}

function snapshot() {
  return {
    portfolioValue: 10_000, buyingPower: 1_000, tradingBlocked: false, marketOpen: true,
    quote: { symbol: 'NVDA', last: 190, bid: 189.95, ask: 190.05, observedAt: '2026-07-11T16:59:30Z', tradable: true, assetType: 'stock' as const },
    positions: [{ ticker: 'NVDA', marketValue: 1_000 }], openOrderTickers: [],
    todayOrderTickers: [], todayOrderCount: 0, todayOrderNotional: 0,
  };
}

test('authorizes a small Phase 2 add inside every hard limit', () => {
  const result = authorizeRobinhoodPhase2Add({ enabled: true, decision: decision(), requestedNotional: 25, snapshot: snapshot(), recentDecisions: [], now });
  assert.equal(result.authorized, true);
  assert.equal(result.maxAllowedNotional, 50);
  assert.deepEqual(result.order, { symbol: 'NVDA', side: 'buy', type: 'market', dollarAmount: '25.00', marketHours: 'regular_hours', refId: 'decision-1' });
});

test('fails closed for stale data, duplicate ticker activity, and disabled execution', () => {
  const stale = snapshot();
  stale.quote.observedAt = '2026-07-11T16:00:00Z';
  stale.openOrderTickers = ['NVDA'];
  const prior = decision();
  prior.id = 'prior';
  prior.executedAt = '2026-07-11T15:00:00Z';
  prior.executionBroker = 'robinhood';
  prior.executedNotional = 25;
  const result = authorizeRobinhoodPhase2Add({ enabled: false, decision: decision(), requestedNotional: 25, snapshot: stale, recentDecisions: [prior], now });
  assert.equal(result.authorized, false);
  assert.equal(result.order, null);
  assert.ok(result.reasons.some(reason => reason.includes('not true')));
  assert.ok(result.reasons.some(reason => reason.includes('stale')));
  assert.ok(result.reasons.some(reason => reason.includes('open broker order')));
  assert.ok(result.reasons.some(reason => reason.includes('one Robinhood action')));
});

test('0.5% portfolio sizing and 15% concentration caps cannot be raised by request', () => {
  const small = snapshot();
  small.portfolioValue = 2_000;
  small.positions = [{ ticker: 'NVDA', marketValue: 299 }];
  const result = authorizeRobinhoodPhase2Add({ enabled: true, decision: decision(), requestedNotional: 25, snapshot: small, recentDecisions: [], now });
  assert.equal(result.maxAllowedNotional, 10);
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.some(reason => reason.includes('allowance of $10.00')));
  assert.ok(result.reasons.some(reason => reason.includes('15%')));
});

test('broker day-to-date history and an expiring signed receipt prevent duplicate or oversized write-backs', () => {
  const alreadyTraded = snapshot();
  alreadyTraded.todayOrderTickers = ['NVDA'];
  alreadyTraded.todayOrderCount = 1;
  alreadyTraded.todayOrderNotional = 25;
  const blocked = authorizeRobinhoodPhase2Add({ enabled: true, decision: decision(), requestedNotional: 25, snapshot: alreadyTraded, recentDecisions: [], now });
  assert.equal(blocked.authorized, false);
  assert.ok(blocked.reasons.some(reason => reason.includes('one Robinhood action')));

  const authorizationId = issueRobinhoodPhase2Authorization({ secret: 'test-secret', decisionId: 'decision-1', ticker: 'NVDA', maxNotional: 25, now });
  const valid = verifyRobinhoodPhase2Authorization({ authorizationId, secret: 'test-secret', decisionId: 'decision-1', ticker: 'NVDA', now });
  assert.equal(valid.valid, true);
  if (valid.valid) assert.equal(valid.ticket.maxNotional, 25);
  const expired = verifyRobinhoodPhase2Authorization({ authorizationId, secret: 'test-secret', decisionId: 'decision-1', ticker: 'NVDA', now: new Date(now.getTime() + 5 * 60_000 + 1) });
  assert.deepEqual(expired, { valid: false, error: 'Authorization receipt has expired.' });
});
