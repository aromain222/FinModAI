/**
 * Trading agent consensus tests — pure synthesis logic that combines the
 * consulted CapitalBase agents (research debate + investment committee)
 * into a single trade decision. No live LLM or network calls.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { actionForStance, synthesizeConsensus } from '@/lib/pm/tradingAgent/synthesize';
import { deriveDebateConfidence, stanceFromDecisionWord } from '@/lib/pm/tradingAgent/consultAgents';
import { buildScanStory, selectionScore, selectPicks } from '@/lib/pm/tradingAgent/scanUniverse';
import { resolvePersonality, listPersonalities } from '@/lib/pm/tradingAgent/personality';
import { sizePosition } from '@/lib/pm/tradingAgent/sizing';
import { disciplineFromPnL } from '@/lib/pm/tradingAgent/learning';
import { executedByAgentToday } from '@/lib/pm/tradingAgent/runTradingAgent';
import type { AgentConsultation, ScanCandidate, TradeConsensus } from '@/lib/pm/tradingAgent/types';

function consultation(overrides: Partial<AgentConsultation>): AgentConsultation {
  return {
    agent: 'tradingagents',
    agentName: 'TradingAgents Research Debate',
    ok: true,
    stance: 'neutral',
    confidence: 60,
    summary: 'test consultation',
    evidence: [],
    ...overrides,
  };
}

const committee = (overrides: Partial<AgentConsultation>): AgentConsultation =>
  consultation({ agent: 'hedge_fund_committee', agentName: 'Senior Investment Committee', ...overrides });

test('unanimous bullish agents produce a buy with averaged confidence', () => {
  const consensus = synthesizeConsensus(
    [consultation({ stance: 'bullish', confidence: 80 }), committee({ stance: 'bullish', confidence: 70 })],
    false,
  );
  assert.equal(consensus.agreement, 'unanimous');
  assert.equal(consensus.stance, 'bullish');
  assert.equal(consensus.action, 'buy');
  assert.equal(consensus.confidence, 75);
});

test('unanimous bullish on an existing position becomes add', () => {
  const consensus = synthesizeConsensus(
    [consultation({ stance: 'bullish', confidence: 80 }), committee({ stance: 'bullish', confidence: 80 })],
    true,
  );
  assert.equal(consensus.action, 'add');
});

test('split reads force a defensive hold with halved confidence', () => {
  const consensus = synthesizeConsensus(
    [consultation({ stance: 'bullish', confidence: 80 }), committee({ stance: 'bearish', confidence: 60 })],
    false,
  );
  assert.equal(consensus.agreement, 'split');
  assert.equal(consensus.action, 'hold');
  assert.equal(consensus.confidence, 35);
});

test('bearish consensus without a position never sells (no shorting path)', () => {
  const consensus = synthesizeConsensus(
    [consultation({ stance: 'bearish', confidence: 75 }), committee({ stance: 'bearish', confidence: 85 })],
    false,
  );
  assert.equal(consensus.stance, 'bearish');
  assert.equal(consensus.action, 'hold');
});

test('bearish consensus on a held position trims it', () => {
  const consensus = synthesizeConsensus(
    [consultation({ stance: 'bearish', confidence: 75 }), committee({ stance: 'bearish', confidence: 85 })],
    true,
  );
  assert.equal(consensus.action, 'trim');
});

test('direction plus neutral is a dampened majority, not unanimous', () => {
  const consensus = synthesizeConsensus(
    [consultation({ stance: 'bullish', confidence: 80 }), committee({ stance: 'neutral', confidence: 50 })],
    false,
  );
  assert.equal(consensus.agreement, 'majority');
  assert.equal(consensus.action, 'buy');
  assert.equal(consensus.confidence, 64); // 80 * 0.8
});

test('a single responding agent cannot be unanimous', () => {
  const consensus = synthesizeConsensus(
    [
      consultation({ stance: 'bullish', confidence: 90 }),
      committee({ ok: false, stance: 'neutral', confidence: 0, error: 'timeout' }),
    ],
    false,
  );
  assert.equal(consensus.agreement, 'majority');
  assert.equal(consensus.confidence, 72); // 90 * 0.8
  assert.match(consensus.rationale, /did not respond/);
});

test('no responding agents yields no_signal and no trade', () => {
  const consensus = synthesizeConsensus(
    [
      consultation({ ok: false, confidence: 0, error: 'timeout' }),
      committee({ ok: false, confidence: 0, error: 'timeout' }),
    ],
    false,
  );
  assert.equal(consensus.agreement, 'no_signal');
  assert.equal(consensus.action, 'watch');
  assert.equal(consensus.confidence, 0);
});

test('all-neutral agents watch new names and hold existing ones', () => {
  const flat = [consultation({ stance: 'neutral' }), committee({ stance: 'neutral' })];
  assert.equal(synthesizeConsensus(flat, false).action, 'watch');
  assert.equal(synthesizeConsensus(flat, true).action, 'hold');
});

test('actionForStance maps stances against the current book', () => {
  assert.equal(actionForStance('bullish', false), 'buy');
  assert.equal(actionForStance('bullish', true), 'add');
  assert.equal(actionForStance('bearish', true), 'trim');
  assert.equal(actionForStance('bearish', false), 'hold');
  assert.equal(actionForStance('neutral', false), 'watch');
});

test('stanceFromDecisionWord normalizes agent decision vocabulary', () => {
  assert.equal(stanceFromDecisionWord('Buy'), 'bullish');
  assert.equal(stanceFromDecisionWord('Overweight'), 'bullish');
  assert.equal(stanceFromDecisionWord('Sell'), 'bearish');
  assert.equal(stanceFromDecisionWord('Underweight'), 'bearish');
  assert.equal(stanceFromDecisionWord('Hold'), 'neutral');
  assert.equal(stanceFromDecisionWord('unknown-word'), 'neutral');
});

// ── Autonomous scan selection ────────────────────────────────────────────────

function candidate(overrides: Partial<ScanCandidate>): ScanCandidate {
  return {
    ticker: 'TEST',
    source: 'rank',
    rankScore: null,
    primaryReason: null,
    valuation: null,
    ...overrides,
  };
}

function consensusOf(overrides: Partial<TradeConsensus>): TradeConsensus {
  return {
    stance: 'bullish',
    action: 'buy',
    confidence: 70,
    agreement: 'unanimous',
    rationale: 'test consensus',
    ...overrides,
  };
}

test('selectPicks only invests in bullish buy/add reads above the confidence floor', () => {
  const picks = selectPicks(
    [
      { candidate: candidate({ ticker: 'GOOD' }), consensus: consensusOf({ confidence: 75 }) },
      { candidate: candidate({ ticker: 'WEAK' }), consensus: consensusOf({ confidence: 40 }) },
      { candidate: candidate({ ticker: 'BEAR' }), consensus: consensusOf({ stance: 'bearish', action: 'trim' }) },
      { candidate: candidate({ ticker: 'FLAT' }), consensus: consensusOf({ stance: 'neutral', action: 'watch' }) },
    ],
    3,
  );
  assert.deepEqual(picks.map(p => p.analysis.candidate.ticker), ['GOOD']);
});

test('selectPicks orders by consensus, valuation, and ranked-board score', () => {
  const undervalued = candidate({
    ticker: 'CHEAP',
    rankScore: 8,
    valuation: { signal: 'undervalued', impliedUpside: 15, summary: 'trading below intrinsic value' },
  });
  const overvalued = candidate({
    ticker: 'RICH',
    rankScore: 8,
    valuation: { signal: 'overvalued', impliedUpside: -10, summary: 'priced beyond expectations' },
  });
  const picks = selectPicks(
    [
      { candidate: overvalued, consensus: consensusOf({ confidence: 75 }) },
      { candidate: undervalued, consensus: consensusOf({ confidence: 75 }) },
    ],
    2,
  );
  assert.equal(picks[0].analysis.candidate.ticker, 'CHEAP');
  assert.ok(picks[0].selectionScore > picks[1].selectionScore);
});

test('selectPicks respects maxPicks after sorting', () => {
  const picks = selectPicks(
    [
      { candidate: candidate({ ticker: 'A' }), consensus: consensusOf({ confidence: 60 }) },
      { candidate: candidate({ ticker: 'B' }), consensus: consensusOf({ confidence: 90 }) },
      { candidate: candidate({ ticker: 'C' }), consensus: consensusOf({ confidence: 75 }) },
    ],
    2,
  );
  assert.deepEqual(picks.map(p => p.analysis.candidate.ticker), ['B', 'C']);
});

test('selectionScore rewards undervaluation and unanimity, punishes overvaluation', () => {
  const base = { candidate: candidate({}), consensus: consensusOf({ confidence: 70 }) };
  const cheap = {
    candidate: candidate({ valuation: { signal: 'undervalued' as const, impliedUpside: 12, summary: 's' } }),
    consensus: consensusOf({ confidence: 70 }),
  };
  const rich = {
    candidate: candidate({ valuation: { signal: 'overvalued' as const, impliedUpside: -8, summary: 's' } }),
    consensus: consensusOf({ confidence: 70 }),
  };
  const majority = { candidate: candidate({}), consensus: consensusOf({ confidence: 70, agreement: 'majority' }) };
  assert.ok(selectionScore(cheap) > selectionScore(base));
  assert.ok(selectionScore(rich) < selectionScore(base));
  assert.ok(selectionScore(majority) < selectionScore(base));
});

test('buildScanStory names the universe, every candidate, and the picks', () => {
  const scanned = [
    {
      candidate: candidate({ ticker: 'NVDA' }),
      consultations: [],
      consensus: consensusOf({ confidence: 80 }),
      context: { holdsPosition: false, currentPrice: null, notionalExposure: null, quantScoreSummary: null },
      story: '',
    },
    {
      candidate: candidate({ ticker: 'RICH' }),
      consultations: [],
      consensus: consensusOf({ stance: 'neutral', action: 'watch', agreement: 'split', confidence: 30 }),
      context: { holdsPosition: false, currentPrice: null, notionalExposure: null, quantScoreSummary: null },
      story: '',
    },
  ];
  const story = buildScanStory('rank', scanned, [
    { ticker: 'NVDA', selectionScore: 92, selectionReason: 'unanimous bullish consensus at 80/100' },
  ]);
  assert.match(story, /ranked opportunity board/);
  assert.match(story, /NVDA: SELECTED/);
  assert.match(story, /RICH: passed over/);
  assert.match(story, /chose NVDA/);
});

// ── Position sizing, personality, learning ───────────────────────────────────

const operator = resolvePersonality('operator');

test('sizePosition scales allocation with conviction and agreement', () => {
  const strong = sizePosition({
    equity: 10_000,
    consensus: consensusOf({ confidence: 90, agreement: 'unanimous' }),
    personality: operator,
  });
  const weak = sizePosition({
    equity: 10_000,
    consensus: consensusOf({ confidence: 60, agreement: 'majority' }),
    personality: operator,
  });
  // 5% base × 0.9 × 1.2 = 5.4% of 10k = $540; 5% × 0.6 × 0.85 = 2.55% = $255.
  assert.equal(strong.notional, 540);
  assert.equal(weak.notional, 255);
  assert.ok(strong.allocationPct > weak.allocationPct);
});

test('sizePosition tilts on valuation and never exceeds the personality cap', () => {
  const cheap = sizePosition({
    equity: 10_000,
    consensus: consensusOf({ confidence: 90, agreement: 'unanimous' }),
    personality: operator,
    valuationSignal: 'undervalued',
  });
  const rich = sizePosition({
    equity: 10_000,
    consensus: consensusOf({ confidence: 90, agreement: 'unanimous' }),
    personality: operator,
    valuationSignal: 'overvalued',
  });
  assert.ok(cheap.notional > rich.notional);
  const hunterMax = sizePosition({
    equity: 1_000_000,
    consensus: consensusOf({ confidence: 100, agreement: 'unanimous' }),
    personality: resolvePersonality('hunter'),
    valuationSignal: 'undervalued',
  });
  // 7% × 1.0 × 1.2 × 1.25 = 10.5% raw, capped well below by...
  assert.ok(hunterMax.allocationPct <= resolvePersonality('hunter').maxPositionPct);
});

test('sizePosition respects existing exposure headroom and skips dust orders', () => {
  const nearCap = sizePosition({
    equity: 10_000,
    consensus: consensusOf({ confidence: 90, agreement: 'unanimous' }),
    personality: operator,
    currentExposureUsd: 990, // cap is 10% of 10k = $1,000 → $10 headroom
  });
  assert.equal(nearCap.notional, 0);
  assert.match(nearCap.reasoning, /skipping/);

  const bearish = sizePosition({
    equity: 10_000,
    consensus: consensusOf({ stance: 'bearish', action: 'trim' }),
    personality: operator,
  });
  assert.equal(bearish.notional, 0);
});

test('personalities resolve from request, then env default, and differ in risk contract', () => {
  assert.equal(resolvePersonality('steward').key, 'steward');
  assert.equal(resolvePersonality('nonsense').key, 'operator');
  assert.equal(resolvePersonality(undefined).key, 'operator');
  const [steward, , hunter] = [
    resolvePersonality('steward'),
    resolvePersonality('operator'),
    resolvePersonality('hunter'),
  ];
  assert.ok(steward.minPickConfidence > hunter.minPickConfidence);
  assert.ok(steward.maxPositionPct < hunter.maxPositionPct);
  assert.equal(steward.executionAgreement, 'unanimous');
  assert.equal(hunter.executionAgreement, 'majority');
  assert.equal(listPersonalities().length, 3);
});

test('disciplineFromPnL raises the bar on losses, never rewards a hot streak', () => {
  const flatBook = { realizedUSD: 0, unrealizedUSD: 0, totalUSD: 0, openPositions: 0, totalFills: 0 };
  assert.equal(disciplineFromPnL(flatBook, 0), 0);
  // Too few fills to grade, even if losing.
  assert.equal(disciplineFromPnL({ ...flatBook, totalFills: 2, totalUSD: -500 }, 5_000), 0);
  // Modest loss → +5.
  assert.equal(disciplineFromPnL({ ...flatBook, totalFills: 10, totalUSD: -100 }, 10_000), 5);
  // Heavy loss (≥5% of cost basis) → +10.
  assert.equal(disciplineFromPnL({ ...flatBook, totalFills: 10, totalUSD: -600 }, 10_000), 10);
  // Winning book does not lower the bar.
  assert.equal(disciplineFromPnL({ ...flatBook, totalFills: 10, totalUSD: 900 }, 10_000), 0);
});

test('selectPicks honors a personality-raised confidence floor', () => {
  const analyses = [
    { candidate: candidate({ ticker: 'MID' }), consensus: consensusOf({ confidence: 60 }) },
    { candidate: candidate({ ticker: 'HIGH' }), consensus: consensusOf({ confidence: 80 }) },
  ];
  assert.equal(selectPicks(analyses, 3).length, 2);
  assert.deepEqual(selectPicks(analyses, 3, 65).map(p => p.analysis.candidate.ticker), ['HIGH']);
});

test('executedByAgentToday counts only this agent\'s fills from today', () => {
  const now = new Date('2026-07-01T18:00:00Z');
  const decisions = [
    { approvedBy: 'capitalbase_trading_agent', executedAt: '2026-07-01T14:00:00Z' }, // counts
    { approvedBy: 'capitalbase_trading_agent', executedAt: '2026-07-01T17:30:00Z' }, // counts
    { approvedBy: 'capitalbase_trading_agent', executedAt: '2026-06-30T14:00:00Z' }, // yesterday
    { approvedBy: 'pm', executedAt: '2026-07-01T15:00:00Z' },                        // human-approved
    { approvedBy: 'robinhood_mcp', executedAt: '2026-07-01T15:00:00Z' },             // external broker
    { approvedBy: 'capitalbase_trading_agent', executedAt: undefined },              // never executed
  ];
  assert.equal(executedByAgentToday(decisions, now), 2);
});

test('debate confidence rewards sane targets and punishes off-theme picks', () => {
  const base = {
    ticker: 'TEST',
    decision: 'Buy',
    summary: null,
    thesis: null,
    price_target: 120,
    time_horizon: null,
    reports: { market: null, fundamentals: null, sentiment: null, news: null },
    theme_fit_score: null,
    theme_fit_reason: '',
    business_consistency: true,
  };
  const sane = deriveDebateConfidence({ ...base, target_validity: 'valid' as const, theme_fit_score: 8 });
  const offTheme = deriveDebateConfidence({ ...base, target_validity: 'invalid' as const, theme_fit_score: 2, business_consistency: false });
  assert.ok(sane > 70, `expected sane read above 70, got ${sane}`);
  assert.ok(offTheme < 30, `expected off-theme read below 30, got ${offTheme}`);
  assert.ok(sane <= 100 && offTheme >= 0);
});
