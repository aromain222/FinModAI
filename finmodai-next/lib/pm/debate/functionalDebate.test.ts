import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreDebateClaims } from '@/lib/pm/debate/claimScoring';
import { primaryRebuttalFor } from '@/lib/pm/debate/functionalDebate';
import type { DebateRebuttal, FunctionalMemo } from '@/lib/pm/debate/types';
import type { ResearchMetric, ResearchPacket } from '@/lib/pm/research/researchPacketContract';

const metric = (value: number | null): ResearchMetric => ({ value, source: value === null ? null : 'test', asOf: '2026-07-10' });

const packet = {
  horizon: { days: 45, label: '45-day / 1-3 month' },
  fundamentals: {
    revenueLtm: metric(100), historicalRevenueGrowthPct: metric(10), ebitdaMarginPct: metric(20),
    netMarginPct: metric(10), netDebtToEbitda: metric(1),
  },
  consensus: { revenueEstimateNtm: metric(110), epsEstimateNtm: metric(2), targetUpsidePct: metric(12) },
  pricePath: {
    expectedReturnPct: metric(8), lowerReturnPct: metric(-6), upperReturnPct: metric(15),
    momentum20dPct: metric(4), annualizedVolatilityPct: metric(22),
  },
  market: { price: metric(100) },
  earnings: { fiscalPeriod: 'Q2 2026' },
  catalysts: [{ title: 'Earnings', source: 'SEC', publishedAt: '2026-07-09', url: null }],
  marketState: null,
  quality: { available: ['company_fundamentals', 'consensus_estimates', 'price_history_and_forecast'], missing: ['positioning_and_options'], coveragePct: 75 },
} as ResearchPacket;

function memo(claimId: string, evidenceRefs: string[]): FunctionalMemo {
  return {
    key: 'fundamentals', name: 'Fundamentals', stance: 'bullish', score: 70, confidence: 70,
    thesis: 'Margins support the setup.', reasoning: 'Evidence-backed memo.',
    claims: [{ claimId, id: claimId, statement: 'Margins support estimates.', channel: 'estimates', evidenceRefs, falsifier: 'Margins fall.', horizon: '45 days' } as FunctionalMemo['claims'][number]],
    risk: 'Margins fall.', watch: 'Next report.', missingEvidence: [], degraded: false,
  };
}

function rebuttal(
  claimId: string,
  verdict: 'supported' | 'weak' | 'unsupported',
  reviewerKey: DebateRebuttal['reviewerKey'] = 'sentiment',
  revisedConfidence = 60,
): DebateRebuttal {
  return {
    reviewerKey, targetKey: 'fundamentals', revisedStance: 'bullish', revisedConfidence,
    revisedThesis: 'Revised.', degraded: false, invalidClaimIds: [],
    challenges: [{ claimId, verdict, critique: 'Checked.', missingEvidence: [], proposedRevision: 'Revise.' }],
  };
}

test('accepts sourced claims that survive rebuttal and rejects unsupported claims', () => {
  const supported = scoreDebateClaims([memo('supported', ['fundamentals.ebitdaMarginPct'])], [rebuttal('supported', 'supported')], packet)[0];
  const unsupported = scoreDebateClaims([memo('unsupported', ['positioning.optionsFlow'])], [rebuttal('unsupported', 'unsupported')], packet)[0];
  assert.equal(supported.accepted, true);
  assert.equal(unsupported.accepted, false);
  assert.ok(supported.score > unsupported.score);
});

test('claims citing only missingEvidence are not accepted', () => {
  const stub = scoreDebateClaims([memo('stub', ['missingEvidence'])], [], packet)[0];
  assert.equal(stub.accepted, false);
  assert.equal(stub.reviewed, false);
});

test('unreviewed claims are neutral, not penalized like weak ones', () => {
  const unreviewed = scoreDebateClaims([memo('c1', ['fundamentals.ebitdaMarginPct'])], [], packet)[0];
  const weak = scoreDebateClaims([memo('c1', ['fundamentals.ebitdaMarginPct'])], [rebuttal('c1', 'weak')], packet)[0];
  assert.equal(unreviewed.reviewed, false);
  assert.equal(weak.reviewed, true);
  assert.ok(unreviewed.score > weak.score);
});

test('harshest verdict governs when multiple reviewers challenge the same claim', () => {
  const scored = scoreDebateClaims(
    [memo('c1', ['fundamentals.ebitdaMarginPct'])],
    [rebuttal('c1', 'supported', 'growth'), rebuttal('c1', 'unsupported', 'sentiment')],
    packet,
  )[0];
  const supportedOnly = scoreDebateClaims(
    [memo('c1', ['fundamentals.ebitdaMarginPct'])],
    [rebuttal('c1', 'supported', 'growth')],
    packet,
  )[0];
  assert.ok(scored.score < supportedOnly.score);
  assert.equal(scored.accepted, false);
});

test('primaryRebuttalFor returns the most conservative reviewer', () => {
  const picked = primaryRebuttalFor(
    [rebuttal('c1', 'supported', 'growth', 80), rebuttal('c1', 'weak', 'sentiment', 35)],
    'fundamentals',
  );
  assert.equal(picked?.reviewerKey, 'sentiment');
  assert.equal(picked?.revisedConfidence, 35);
  assert.equal(primaryRebuttalFor([], 'fundamentals'), undefined);
});
