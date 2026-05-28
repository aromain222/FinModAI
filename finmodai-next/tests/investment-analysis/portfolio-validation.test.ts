/**
 * Stage 4 tests — final validation gate and async judge logic.
 *
 * Gate tests (validatePortfolio):
 *   A1 — theme_justification blocker
 *   A2 — non-equity ticker blocker (requires knownAssetClasses)
 *   A3 — count shortfall blocker
 *   C1 — weight-sum blocker
 *   C2 — sizing-range warning
 *   D1 — invalid label blocker
 *   clean — all rules pass → ok=true
 *
 * E3 pure-logic tests (cosineSimilarity / findNearDuplicates):
 *   identical vectors → similarity 1.0
 *   orthogonal vectors → similarity 0
 *   near-duplicate pair flagged
 *   dissimilar pair not flagged
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePortfolio } from '@/lib/execution/portfolioValidator';
import { cosineSimilarity, findNearDuplicates } from '@/lib/execution/asyncJudge';
import type { SynthesizedPortfolio, SynthesizedPosition } from '@/lib/execution/synthesisValidation';
import type { UserIntent } from '@/lib/execution/userIntent';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const noThemeIntent: UserIntent = {
  themes:         [],
  risk_profile:   'balanced',
  position_count: null,
  capital_usd:    null,
  asset_class:    'common_stock',
  raw_prompt:     'balanced portfolio',
};

const aiIntent: UserIntent = {
  ...noThemeIntent,
  themes:     ['ai'],
  raw_prompt: 'ai portfolio',
};

function pos(ticker: string, weight_pct: number, overrides: Partial<SynthesizedPosition> = {}): SynthesizedPosition {
  return {
    score:               8,
    action:              'Buy',
    sizing:              weight_pct >= 10 ? 'Full position' : weight_pct >= 6 ? 'Build' : 'Starter',
    shares:              0,
    dollar_amount:       0,
    thesis:              'Strong AI platform with durable moat.',
    theme_justification: 'AI semiconductor leader powering LLM inference.',
    risk:                'TSMC 3nm allocation cut by 20% could compress margins.',
    ticker,
    weight_pct,
    ...overrides,
  };
}

function portfolio(
  positions: SynthesizedPosition[],
  overrides: Partial<SynthesizedPortfolio> = {},
): SynthesizedPortfolio {
  return {
    narrative:         'Test portfolio.',
    total_capital_usd: null,
    cash_reserve_pct:  0,
    requested_count:   positions.length,
    delivered_count:   positions.length,
    shortfall_reason:  null,
    positions,
    ...overrides,
  };
}

// 5 valid positions × 20% = 100% — no gate interference
const cleanPositions = Array.from({ length: 5 }, (_, i) => pos(`T${i}`, 20));

// ── Gate tests: validatePortfolio ────────────────────────────────────────────

test('gate: clean portfolio → ok=true, no blockers', () => {
  const p = portfolio(cleanPositions);
  const { ok, blockers } = validatePortfolio(p, noThemeIntent);

  assert.equal(ok, true);
  assert.equal(blockers.length, 0);
});

test('gate C1: weight sum 87% (delta 13% > 2%) → BLOCKER', () => {
  // Weights summing to 87% should fail the gate even though Stage 3 would normalize them
  // (gate catches cases where Stage 3 was bypassed or normalization was incorrect)
  const positions = [20, 20, 20, 20, 7].map((w, i) => pos(`T${i}`, w));
  const p = portfolio(positions);
  const { ok, blockers } = validatePortfolio(p, noThemeIntent);

  assert.equal(ok, false);
  assert.ok(blockers.some(v => v.rule_id === 'C1'), 'Expected C1 blocker');
  assert.equal(blockers.find(v => v.rule_id === 'C1')?.severity, 'BLOCKER');
});

test('gate A2: non-equity ticker with knownAssetClasses → BLOCKER', () => {
  const positions = [pos('HYG', 20), ...Array.from({ length: 4 }, (_, i) => pos(`T${i}`, 20))];
  const p = portfolio(positions);
  const knownAssetClasses = new Map<string, 'common_stock' | 'etf' | 'unknown'>([
    ['HYG', 'etf'],
  ]);
  const { ok, blockers } = validatePortfolio(p, noThemeIntent, { knownAssetClasses });

  assert.equal(ok, false);
  assert.ok(blockers.some(v => v.rule_id === 'A2'), 'Expected A2 blocker');
  assert.ok(blockers.find(v => v.rule_id === 'A2')?.details.tickers?.toString().includes('HYG'));
});

test('gate A2: skipped when knownAssetClasses not provided', () => {
  // HYG in synthesis without knownAssetClasses — A2 cannot fire (screener handles ETF filtering)
  const positions = [pos('HYG', 20), ...Array.from({ length: 4 }, (_, i) => pos(`T${i}`, 20))];
  const p = portfolio(positions);
  const { blockers } = validatePortfolio(p, noThemeIntent);

  assert.ok(!blockers.some(v => v.rule_id === 'A2'), 'A2 should not fire without knownAssetClasses');
});

test('gate A3: delivered < requested with no shortfall_reason → BLOCKER', () => {
  const positions = Array.from({ length: 8 }, (_, i) => pos(`T${i}`, 12.5)); // 8 × 12.5 = 100%
  const p = portfolio(positions, { requested_count: 15, shortfall_reason: null });
  const { ok, blockers } = validatePortfolio(p, noThemeIntent);

  assert.equal(ok, false);
  assert.ok(blockers.some(v => v.rule_id === 'A3'), 'Expected A3 blocker');
});

test('gate A3: delivered < requested WITH shortfall_reason → no A3 blocker', () => {
  const positions = Array.from({ length: 8 }, (_, i) => pos(`T${i}`, 12.5));
  const p = portfolio(positions, {
    requested_count:  15,
    shortfall_reason: 'Only 8 qualifying names passed the score threshold.',
  });
  const { blockers } = validatePortfolio(p, noThemeIntent);

  assert.ok(!blockers.some(v => v.rule_id === 'A3'));
});

test('gate D1: invalid action label → BLOCKER', () => {
  const positions = [pos('NVDA', 20, { action: 'FullBull' as SynthesizedPosition['action'] })];
  const p = portfolio([...positions, ...Array.from({ length: 4 }, (_, i) => pos(`T${i}`, 20))]);
  const { ok, blockers } = validatePortfolio(p, noThemeIntent);

  assert.equal(ok, false);
  assert.ok(blockers.some(v => v.rule_id === 'D1'));
});

test('gate C2: Full position at 5% → warning (not blocker)', () => {
  // Weight 5% but labeled "Full position" — C2 is a warning, not a blocker
  const positions = [
    pos('NVDA', 5, { sizing: 'Full position' }),
    ...Array.from({ length: 4 }, (_, i) => pos(`T${i}`, 23.75)),
  ];
  // sum = 5 + 4×23.75 = 100%
  const p = portfolio(positions);
  const { ok, blockers, warnings } = validatePortfolio(p, noThemeIntent);

  assert.equal(ok, true, 'C2 is a warning, portfolio should still be ok');
  assert.equal(blockers.length, 0);
  assert.ok(warnings.some(v => v.rule_id === 'C2'));
});

test('gate A1: missing theme_justification with themes specified → BLOCKER', () => {
  const positions = [
    pos('NVDA', 20, { theme_justification: '' }),
    ...Array.from({ length: 4 }, (_, i) => pos(`T${i}`, 20)),
  ];
  const p = portfolio(positions);
  const { ok, blockers } = validatePortfolio(p, aiIntent);

  assert.equal(ok, false);
  assert.ok(blockers.some(v => v.rule_id === 'A1'));
});

test('gate: stage 3 bypass detected — 60% weight sum → BLOCKER on C1', () => {
  // 5 positions × 12% = 60%; Stage 3 would normally normalize this.
  // If Stage 3 is bypassed, the gate catches it.
  const positions = Array.from({ length: 5 }, (_, i) => pos(`T${i}`, 12));
  const p = portfolio(positions);
  const { ok, blockers } = validatePortfolio(p, noThemeIntent);

  assert.equal(ok, false);
  assert.ok(blockers.some(v => v.rule_id === 'C1'), 'Gate must catch bypassed Stage 3');
});

// ── E3 pure-logic tests ───────────────────────────────────────────────────────

test('E3 cosineSimilarity: identical vectors → ≈1.0', () => {
  const v = [1, 0, 0, 1];
  assert.ok(
    Math.abs(cosineSimilarity(v, v) - 1) < 1e-9,
    'Expected cosine similarity of identical vectors to be ≈1',
  );
});

test('E3 cosineSimilarity: orthogonal vectors → 0', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('E3 cosineSimilarity: empty vectors → 0 (no crash)', () => {
  assert.equal(cosineSimilarity([], []), 0);
});

test('E3 findNearDuplicates: identical embeddings flagged above threshold', () => {
  const tickers = ['NVDA', 'AMD'];
  const embeddings = [[1, 0, 0], [1, 0, 0]]; // identical → similarity 1.0
  const dupes = findNearDuplicates(tickers, embeddings, 0.85);

  assert.equal(dupes.length, 1);
  assert.deepEqual(dupes[0].tickers, ['NVDA', 'AMD']);
  assert.equal(dupes[0].similarity, 1);
});

test('E3 findNearDuplicates: dissimilar embeddings not flagged', () => {
  const tickers = ['NVDA', 'HYG'];
  const embeddings = [[1, 0, 0], [0, 1, 0]]; // orthogonal → similarity 0
  const dupes = findNearDuplicates(tickers, embeddings, 0.85);

  assert.equal(dupes.length, 0);
});

test('E3 findNearDuplicates: mixed portfolio — only close pair flagged', () => {
  const tickers = ['A', 'B', 'C'];
  // A and B are near-identical (sim ≈ 0.99), C is orthogonal
  const embeddings = [
    [0.99, 0.14, 0],
    [0.99, 0.14, 0],
    [0,    0,    1],
  ];
  const dupes = findNearDuplicates(tickers, embeddings, 0.85);

  assert.equal(dupes.length, 1);
  assert.deepEqual(dupes[0].tickers, ['A', 'B']);
});
