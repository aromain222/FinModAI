import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreDebateClaims } from '@/lib/pm/debate/claimScoring';
import { buildPMDecisionPolicy } from '@/lib/pm/debate/pmDecisionPolicy';
import type { DebateRebuttal, FunctionalMemo } from '@/lib/pm/debate/types';
import type { ResearchPacket } from '@/lib/pm/research/researchPacketContract';

function packet(coveragePct = 80): ResearchPacket {
  const metric = (value: number | null) => ({ value, source: value === null ? null : 'test', asOf: '2026-07-11' });
  return {
    version: 1, ticker: 'TEST', companyName: 'Test Co', builtAt: '2026-07-11T00:00:00Z',
    horizon: { days: 45, startDate: '2026-07-11', endDate: '2026-08-25', label: '45 days' },
    company: { sector: 'Technology', industry: 'Software', exchange: 'NYSE', currency: 'USD' },
    market: { price: metric(100), marketCap: metric(1000), sharesOutstanding: metric(10) },
    fundamentals: { revenueLtm: metric(500), grossMarginPct: metric(70), ebitdaLtm: metric(100), ebitdaMarginPct: metric(20), netIncomeLtm: metric(80), netMarginPct: metric(16), cash: metric(50), totalDebt: metric(10), netDebtToEbitda: metric(-0.4), historicalRevenueGrowthPct: metric(20) },
    consensus: { revenueEstimateNtm: metric(600), epsEstimateNtm: metric(5), targetPrice: metric(120), targetUpsidePct: metric(20), analystCount: 10, rating: 'Buy' },
    earnings: { fiscalPeriod: 'Q2', reportEndDate: '2026-06-30', filedAt: '2026-07-01', lastFetchedAt: '2026-07-11', highlights: [], source: 'test' },
    pricePath: { expectedReturnPct: metric(10), lowerReturnPct: metric(-10), upperReturnPct: metric(20), momentum20dPct: metric(5), annualizedVolatilityPct: metric(40), methodology: 'test' },
    catalysts: [{ title: 'Earnings', source: 'test', publishedAt: '2026-07-11', url: null }],
    marketState: null,
    quality: { coveragePct, available: ['company_fundamentals', 'consensus_estimates', 'price_history_and_forecast'], missing: [], warnings: [] },
  };
}

function memo(key: 'fundamentals' | 'growth', channel: 'estimates' | 'catalyst'): FunctionalMemo {
  return { key, name: key, stance: 'bullish', score: 75, confidence: 80, thesis: 'Positive setup', reasoning: 'Evidence supports upside.', claims: [{ id: `${key}-1`, statement: 'Numbers can rise', channel, evidenceRefs: [channel === 'estimates' ? 'consensus.revenueEstimateNtm' : 'catalysts'], falsifier: 'Numbers fall', horizon: '45 days' }], risk: 'Execution', watch: 'Results', missingEvidence: [], degraded: false };
}

function rebuttal(targetKey: 'fundamentals' | 'growth'): DebateRebuttal {
  return { reviewerKey: targetKey === 'fundamentals' ? 'growth' : 'fundamentals', targetKey, challenges: [{ claimId: `${targetKey}-1`, verdict: 'supported', critique: 'Supported', missingEvidence: [], proposedRevision: 'Keep' }], invalidClaimIds: [], revisedStance: 'bullish', revisedConfidence: 80, revisedThesis: 'Positive setup', degraded: false };
}

test('PM policy permits a pitch only when evidence, mechanism, catalyst, and asymmetry all pass', () => {
  const research = packet();
  const memos = [memo('fundamentals', 'estimates'), memo('growth', 'catalyst')];
  const rebuttals = [rebuttal('fundamentals'), rebuttal('growth')];
  const claims = scoreDebateClaims(memos, rebuttals, research);
  const policy = buildPMDecisionPolicy({ memos, rebuttals, claims, packet: research });
  assert.equal(policy.decision, 'pitch_candidate');
  assert.equal(policy.action, 'buy');
  assert.equal(policy.sizing, 'Build');
  assert.deepEqual(policy.blockers, []);
});

test('PM policy refuses to upgrade a low-evidence setup with no surviving claims', () => {
  const research = packet(30);
  research.catalysts = [];
  const memos = [memo('fundamentals', 'estimates')];
  memos[0].claims[0].evidenceRefs = ['missingEvidence'];
  const claims = scoreDebateClaims(memos, [], research);
  const policy = buildPMDecisionPolicy({ memos, rebuttals: [], claims, packet: research });
  assert.equal(policy.action, 'hold');
  assert.notEqual(policy.decision, 'pitch_candidate');
  assert.ok(policy.blockers.includes('sufficient evidence'));
  assert.ok(policy.confidence < 60);
});
