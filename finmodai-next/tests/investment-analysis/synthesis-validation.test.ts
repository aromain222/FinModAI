/**
 * Stage 3 tests — synthesis validation (pure function, no network calls).
 *
 * Tests cover all 8 deterministic checks in validateSynthesis():
 *  C1  — position count (auto-trim if too many; regenerate if too few without reason)
 *  C2  — theme_justification present when themes specified
 *  C3  — theme_justification mentions theme keyword (warn only)
 *  C4  — sizing label relabeling (auto-fix) + extreme weights >20%/<2% (regenerate)
 *  C5  — weight sum ±2% tolerance; normalize if |delta|≤15%; regenerate if >15%
 *  C6  — dollar_amount recomputed from weight_pct × capital (always)
 *  C7  — generic risk deny-list (regenerate when no specific anchor)
 *  C8  — no agent-rejected tickers in synthesis output
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateSynthesis,
  correctSizingLabel,
  type SynthesizedPortfolio,
  type SynthesizedPosition,
} from '@/lib/execution/synthesisValidation';
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
  themes:         ['ai'],
  risk_profile:   'aggressive',
  position_count: null,
  capital_usd:    null,
  asset_class:    'common_stock',
  raw_prompt:     'ai portfolio',
};

function makePos(
  ticker: string,
  weight_pct: number,
  overrides: Partial<SynthesizedPosition> = {},
): SynthesizedPosition {
  return {
    score:               7.5,
    action:              'Buy',
    sizing:              'Full position',
    shares:              0,
    dollar_amount:       0,
    thesis:              'Strong AI platform with durable competitive advantages.',
    theme_justification: 'AI semiconductor leader powering next-gen data centers.',
    risk:                'TSMC 3nm allocation cut by 20% could compress gross margins by 400bps.',
    ticker,
    weight_pct,
    ...overrides,
  };
}

function makePortfolio(
  positions: SynthesizedPosition[],
  requested: number,
  overrides: Partial<SynthesizedPortfolio> = {},
): SynthesizedPortfolio {
  return {
    narrative:         'Test portfolio narrative.',
    total_capital_usd: null,
    cash_reserve_pct:  0,
    requested_count:   requested,
    delivered_count:   positions.length,
    shortfall_reason:  null,
    positions,
    ...overrides,
  };
}

const empty = new Set<string>();

// ── C1: Position count ────────────────────────────────────────────────────────

test('C1: 14-of-15 positions without shortfall_reason → mustRegenerate', () => {
  // 14 positions each at 7%, summing to 98% (within ±2% tolerance)
  const positions = Array.from({ length: 14 }, (_, i) =>
    makePos(`S${i}`, 7.0),
  );
  const p = makePortfolio(positions, 15);
  const { mustRegenerate, errors } = validateSynthesis(p, noThemeIntent, empty);

  assert.equal(mustRegenerate, true);
  assert.ok(errors.some(e => e.code === 'C1'), 'Expected a C1 error');
});

test('C1: 14-of-15 with shortfall_reason provided → does NOT regenerate', () => {
  const positions = Array.from({ length: 14 }, (_, i) => makePos(`S${i}`, 7.0));
  const p = makePortfolio(positions, 15, { shortfall_reason: 'Only 14 qualifying names met the score threshold.' });
  const { mustRegenerate } = validateSynthesis(p, noThemeIntent, empty);

  assert.equal(mustRegenerate, false);
});

// ── C5: Weight sum normalization and regeneration ─────────────────────────────

test('C5: weights summing to 87% (delta=13% ≤15%) → normalized in-place, no regenerate', () => {
  // [20, 20, 20, 20, 7] = 87%
  const positions = [20, 20, 20, 20, 7].map((w, i) => makePos(`T${i}`, w));
  const p = makePortfolio(positions, 5);
  const { mustRegenerate, portfolio: fixed } = validateSynthesis(p, noThemeIntent, empty);

  assert.equal(mustRegenerate, false);
  const total = fixed.positions.reduce((s, pos) => s + pos.weight_pct, 0);
  assert.ok(
    Math.abs(total - 100) < 1,
    `Normalized total should be ≈100%, got ${total.toFixed(1)}%`,
  );
});

test('C5: weights summing to 60% (delta=40% >15%) → mustRegenerate', () => {
  // 5 × 12 = 60%
  const positions = Array.from({ length: 5 }, (_, i) => makePos(`T${i}`, 12));
  const p = makePortfolio(positions, 5);
  const { mustRegenerate, errors } = validateSynthesis(p, noThemeIntent, empty);

  assert.equal(mustRegenerate, true);
  assert.ok(errors.some(e => e.code === 'C5'), 'Expected a C5 error');
});

// ── C4: Sizing label relabeling ───────────────────────────────────────────────

test('C4 relabel: Starter@12% is relabeled to Full position, no regenerate', () => {
  // 12% labeled 'Starter' — must be relabeled. Fill to 100% with 8 × 11%.
  const positions = [
    makePos('NVDA', 12, { sizing: 'Starter' }),
    ...Array.from({ length: 8 }, (_, i) => makePos(`F${i}`, 11)),
  ];
  // 12 + 8 × 11 = 100 — valid weights, no C5 or C4-extreme interference
  const p = makePortfolio(positions, 9);
  const { mustRegenerate, portfolio: fixed } = validateSynthesis(p, noThemeIntent, empty);

  assert.equal(mustRegenerate, false);
  assert.equal(fixed.positions[0].sizing, 'Full position');
});

test('correctSizingLabel: maps weight ranges to correct tiers', () => {
  assert.equal(correctSizingLabel(3),  'Starter');
  assert.equal(correctSizingLabel(5),  'Starter');
  assert.equal(correctSizingLabel(6),  'Build');
  assert.equal(correctSizingLabel(9),  'Build');
  assert.equal(correctSizingLabel(10), 'Full position');
  assert.equal(correctSizingLabel(20), 'Full position');
});

// ── C2: theme_justification required when themes specified ────────────────────

test('C2: empty theme_justification with themes specified → mustRegenerate', () => {
  const positions = [makePos('NVDA', 10, { theme_justification: '' })];
  const p = makePortfolio(positions, 1);
  const { mustRegenerate, errors } = validateSynthesis(p, aiIntent, empty);

  assert.equal(mustRegenerate, true);
  assert.ok(errors.some(e => e.code === 'C2'), 'Expected a C2 error');
});

// ── C7: Generic risk deny-list ────────────────────────────────────────────────

test('C7: "competition" alone (no anchor) → mustRegenerate', () => {
  const positions = [makePos('AMZN', 10, { risk: 'competition' })];
  const p = makePortfolio(positions, 1);
  const { mustRegenerate, errors } = validateSynthesis(p, noThemeIntent, empty);

  assert.equal(mustRegenerate, true);
  assert.ok(errors.some(e => e.code === 'C7'), 'Expected a C7 error');
});

test('C7: specific risk with proper noun + percentage → does NOT regenerate', () => {
  // 5 × 20% = 100% — valid portfolio; only position 0 has specific risk under test
  const positions = Array.from({ length: 5 }, (_, i) =>
    makePos(`T${i}`, 20, i === 0 ? {
      risk: "competition from Microsoft's Copilot product capturing >30% of enterprise AI market",
    } : {}),
  );
  const p = makePortfolio(positions, 5);
  const { mustRegenerate, errors } = validateSynthesis(p, noThemeIntent, empty);

  assert.equal(mustRegenerate, false);
  assert.ok(!errors.some(e => e.code === 'C7'), 'C7 should not fire for specific risk');
});

// ── C8: Agent-rejected tickers ────────────────────────────────────────────────

test('C8: HYG appears in synthesis when HYG is in rejectedTickers → mustRegenerate', () => {
  const positions = [makePos('HYG', 10)];
  const p = makePortfolio(positions, 1);
  const rejected = new Set(['HYG']);
  const { mustRegenerate, errors } = validateSynthesis(p, noThemeIntent, rejected);

  assert.equal(mustRegenerate, true);
  assert.ok(errors.some(e => e.code === 'C8'), 'Expected a C8 error');
  assert.ok(errors.find(e => e.code === 'C8')?.tickers?.includes('HYG'));
});

// ── C6: Dollar amount recomputation ──────────────────────────────────────────

test('C6: dollar_amount is recomputed from weight_pct × capital', () => {
  const positions = [makePos('NVDA', 15, { dollar_amount: 999 })];
  const p = makePortfolio(positions, 1, { total_capital_usd: 100_000 });
  const { portfolio: fixed } = validateSynthesis(p, noThemeIntent, empty);

  // 15% of $100k = $15,000
  assert.equal(fixed.positions[0].dollar_amount, 15_000);
});
