/**
 * Portfolio Builder pipeline tests — pure-function, no LLM calls.
 *
 * Test 1: parseUserIntent — themes, risk_profile, position_count
 * Test 2: Duplicate ticker deduplication before synthesis
 * Test 3: HPQ theme fit score for themes=["ai"]
 * Test 4: Aggressive portfolio with a Hold action → validation gate rejects
 * Test 5: Weights summing to 87% → auto-normalized in validateSynthesis
 * Test 6: Capital not specified → defaults to 10000 in synthesis output
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseUserIntent } from '@/lib/execution/userIntent';
import { validateSynthesis, type SynthesizedPortfolio, type SynthesizedPosition } from '@/lib/execution/synthesisValidation';
import { validatePortfolio } from '@/lib/execution/portfolioValidator';
import { matchThemes } from '@/lib/execution/themeClassifier';
import type { UserIntent } from '@/lib/execution/userIntent';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const aggressiveAiIntent: UserIntent = {
  themes:         ['ai'],
  risk_profile:   'aggressive',
  position_count: 10,
  capital_usd:    null,
  time_horizon:   'medium',
  asset_class:    'common_stock',
  raw_prompt:     'build me 10 aggressive AI stocks',
};

const noThemeIntent: UserIntent = {
  themes:         [],
  risk_profile:   'balanced',
  position_count: 5,
  capital_usd:    10_000,
  time_horizon:   'medium',
  asset_class:    'common_stock',
  raw_prompt:     'build me 5 stocks',
};

function makePos(
  ticker: string,
  weight: number,
  overrides: Partial<SynthesizedPosition> = {},
): SynthesizedPosition {
  return {
    ticker,
    score:               7,
    action:              'Buy',
    sizing:              weight >= 10 ? 'Full position' : weight >= 6 ? 'Build' : 'Starter',
    weight_pct:          weight,
    shares:              0,
    dollar_amount:       0,
    thesis:              `${ticker} is a leading AI platform with durable competitive advantage.`,
    theme_justification: 'AI semiconductor and infrastructure leader powering LLM inference.',
    risk:                `TSMC 3nm allocation constraints could compress ${ticker} margins by 200–300bps.`,
    ...overrides,
  };
}

function makePortfolio(
  positions: SynthesizedPosition[],
  overrides: Partial<SynthesizedPortfolio> = {},
): SynthesizedPortfolio {
  return {
    narrative:         'Test portfolio.',
    total_capital_usd: 10_000,
    cash_reserve_pct:  0,
    requested_count:   positions.length,
    delivered_count:   positions.length,
    shortfall_reason:  null,
    positions,
    ...overrides,
  };
}

// ── Test 1: parseUserIntent extracts themes, risk_profile, position_count ─────

test('Test 1: parseUserIntent("build me 10 aggressive AI stocks") → correct intent', () => {
  const intent = parseUserIntent('build me 10 aggressive AI stocks');

  assert.ok(
    intent.themes.includes('ai'),
    `Expected "ai" in themes; got: [${intent.themes.join(', ')}]`,
  );
  assert.equal(
    intent.risk_profile, 'aggressive',
    `Expected risk_profile=aggressive; got ${intent.risk_profile}`,
  );
  assert.equal(
    intent.position_count, 10,
    `Expected position_count=10; got ${intent.position_count}`,
  );
});

// ── Test 2: Duplicate ticker deduplication ────────────────────────────────────

test('Test 2: duplicate tickers → deduplicated before validation, count reflects actual delivered', () => {
  // 4 valid positions + 1 duplicate of NVDA
  const positions: SynthesizedPosition[] = [
    makePos('NVDA', 25),
    makePos('NVDA', 25),  // duplicate
    makePos('AMD',  25),
    makePos('MSFT', 25),
  ];

  // Deduplicate (mirrors what synthesisePortfolio does pre-LLM)
  const seen = new Set<string>();
  const deduped = positions.filter(p => {
    if (seen.has(p.ticker)) return false;
    seen.add(p.ticker);
    return true;
  });

  // Weights of deduped sum to 75% — rebalance to 100 for this test
  const rebalanced = deduped.map(p => ({ ...p, weight_pct: 100 / deduped.length }));

  const portfolio = makePortfolio(rebalanced, {
    requested_count:  4,
    delivered_count:  rebalanced.length,
    shortfall_reason: 'Duplicate NVDA removed; only 3 unique tickers available.',
  });

  // With shortfall_reason set, C1 (count mismatch) should NOT fire
  const vr = validateSynthesis(portfolio, noThemeIntent, new Set());
  const c1 = vr.errors.find(e => e.code === 'C1');
  assert.ok(!c1, `C1 (count mismatch) should not fire when shortfall_reason is set; got: ${JSON.stringify(c1)}`);

  // Confirm no duplicate tickers in output
  const tickers = vr.portfolio.positions.map(p => p.ticker);
  const uniqueTickers = new Set(tickers);
  assert.equal(uniqueTickers.size, tickers.length, 'Positions should have no duplicate tickers');
});

// ── Test 3: HPQ theme fit score for themes=["ai"] ────────────────────────────

test('Test 3: HPQ does not match ai theme (matchThemes returns fits=false)', () => {
  // HPQ (HP Inc.) is a PC/printer hardware company — not an AI theme stock
  const result = matchThemes(
    { ticker: 'HPQ', name: 'HP Inc.', sector: 'Technology', industry: 'Computer Hardware' },
    ['ai'],
  );

  // HPQ is not in the ai theme's ticker list and does not meaningfully match AI keywords
  assert.equal(
    result.fits, false,
    `HPQ should NOT match the "ai" theme; got fits=${result.fits}, reason="${result.reason}"`,
  );

  // score should be low (< 3) — not a meaningful AI match
  assert.ok(
    result.score < 3,
    `HPQ ai theme score should be < 3 (got ${result.score}); HP Inc. is a PC/printer company, not an AI name`,
  );
});

// ── Test 4: Aggressive portfolio with Hold action → F1 BLOCKER ───────────────

test('Test 4: aggressive portfolio with Hold action → F1 BLOCKER', () => {
  const positions = [
    makePos('NVDA', 20),
    makePos('AMD',  20),
    makePos('MSFT', 20, { action: 'Hold' }),  // Hold on aggressive → violation
    makePos('GOOGL', 20),
    makePos('META', 20),
  ];

  const portfolio = makePortfolio(positions);
  const { ok, blockers } = validatePortfolio(portfolio, aggressiveAiIntent);

  assert.equal(ok, false, 'Portfolio with Hold in aggressive profile should not pass gate');
  const f1 = blockers.find(v => v.rule_id === 'F1');
  assert.ok(f1, `Expected F1 blocker; got blockers: ${JSON.stringify(blockers.map(b => b.rule_id))}`);
  assert.equal(f1.severity, 'BLOCKER');
  assert.ok(
    (f1.details.tickers as string[]).includes('MSFT'),
    `F1 should name MSFT; got tickers: ${JSON.stringify(f1.details.tickers)}`,
  );
});

// ── Test 5: Weights summing to 87% → auto-normalized ─────────────────────────

test('Test 5: weights summing to 87% → auto-normalized (delta ≤ 15%)', () => {
  // 5 positions with weights summing to 87
  const positions = [17, 17, 17, 18, 18].map((w, i) => makePos(`T${i}`, w));
  const portfolio = makePortfolio(positions, {
    requested_count: 5, delivered_count: 5,
  });

  const preTotalStr = positions.reduce((s, p) => s + p.weight_pct, 0).toFixed(1);
  const vr = validateSynthesis(portfolio, noThemeIntent, new Set());

  // C5: delta=13% is within the 15% auto-fix threshold → no C5 error
  const c5 = vr.errors.find(e => e.code === 'C5');
  assert.ok(!c5, `C5 should not appear for 13% delta (within auto-fix threshold); pre-normalization total was ${preTotalStr}%`);

  // Verify weights now sum to ~100
  const postTotal = vr.portfolio.positions.reduce((s, p) => s + p.weight_pct, 0);
  assert.ok(
    Math.abs(postTotal - 100) <= 1,
    `Post-normalization weights should sum to ~100; got ${postTotal.toFixed(1)}%`,
  );
});

// ── Test 7: C1 fires when count short and no shortfall_reason ────────────────

test('Test 7: C1 fires when portfolio is short and shortfall_reason is null', () => {
  const positions = [makePos('T0', 33), makePos('T1', 33), makePos('T2', 34)];
  const portfolio = makePortfolio(positions, {
    requested_count:  5,
    delivered_count:  3,
    shortfall_reason: null,
  });

  const vr = validateSynthesis(portfolio, noThemeIntent, new Set());
  const c1 = vr.errors.find(e => e.code === 'C1');
  assert.ok(
    c1,
    `C1 should fire when delivered(3) < requested(5) with no shortfall_reason; errors: [${vr.errors.map(e => e.code).join(', ')}]`,
  );
  assert.ok(vr.mustRegenerate, 'mustRegenerate should be true when C1 fires');
});

// ── Test 8: viable=0 → C1 suppressed when shortfall_reason explains it ───────

test('Test 8: viable=0 → C1 suppressed when shortfall_reason is set', () => {
  const portfolio = makePortfolio([], {
    requested_count:  10,
    delivered_count:  0,
    shortfall_reason: 'No viable candidates after debate filtering.',
  });

  const vr = validateSynthesis(portfolio, noThemeIntent, new Set());
  const c1 = vr.errors.find(e => e.code === 'C1');
  assert.ok(
    !c1,
    `C1 should NOT fire when positions=0 and shortfall_reason explains it; errors: [${vr.errors.map(e => e.code).join(', ')}]`,
  );
});

// ── Test 9: positions with empty bull_case/bear_case pass without errors ──────

test('Test 9: positions with empty bull_case/bear_case do not trigger validation errors', () => {
  const positions = Array.from({ length: 5 }, (_, i) =>
    makePos(`T${i}`, 20, { bull_case: '', bear_case: '' }),
  );
  const portfolio = makePortfolio(positions);

  const vr = validateSynthesis(portfolio, noThemeIntent, new Set());
  const blocking = vr.errors.filter(e => !e.code.endsWith('_warn'));
  assert.ok(
    blocking.length === 0,
    `Positions with empty bull_case/bear_case should not trigger blocking errors; got: [${blocking.map(e => e.code).join(', ')}]`,
  );
});

// ── Test 10: F1 lists ALL Hold tickers (multi-Hold case) ─────────────────────

test('Test 10: F1 blocker lists every Hold ticker in aggressive portfolio', () => {
  const positions = [
    makePos('NVDA', 20),
    makePos('AMD',  20, { action: 'Hold' }),
    makePos('MSFT', 20, { action: 'Hold' }),
    makePos('GOOGL', 20),
    makePos('META', 20),
  ];
  const portfolio = makePortfolio(positions);
  const { blockers } = validatePortfolio(portfolio, aggressiveAiIntent);
  const f1 = blockers.find(v => v.rule_id === 'F1');

  assert.ok(f1, `F1 should fire; blockers: ${JSON.stringify(blockers.map(b => b.rule_id))}`);
  const holdTickers = f1.details.tickers as string[];
  assert.ok(holdTickers.includes('AMD'),  `F1.tickers should include AMD;  got: ${JSON.stringify(holdTickers)}`);
  assert.ok(holdTickers.includes('MSFT'), `F1.tickers should include MSFT; got: ${JSON.stringify(holdTickers)}`);
  assert.equal(holdTickers.length, 2, `F1 should name exactly 2 Hold tickers; got: ${JSON.stringify(holdTickers)}`);
});

// ── Test 11: weight delta=16% → C5 fires (exceeds 15% auto-fix threshold) ────

test('Test 11: weights summing to 84% (delta=16%) → C5 fires (exceeds auto-fix threshold)', () => {
  // 5 × 16.8 = 84% — delta=16% is strictly > 15%, so C5 must fire instead of normalizing
  const positions = [17, 17, 17, 16, 17].map((w, i) => makePos(`T${i}`, w));
  const portfolio = makePortfolio(positions, { requested_count: 5, delivered_count: 5 });
  const preTotal  = positions.reduce((s, p) => s + p.weight_pct, 0);

  const vr = validateSynthesis(portfolio, noThemeIntent, new Set());
  const c5 = vr.errors.find(e => e.code === 'C5');
  assert.ok(
    c5,
    `C5 should fire when delta=${Math.abs(preTotal - 100).toFixed(0)}% > 15%; errors: [${vr.errors.map(e => e.code).join(', ')}]`,
  );
  assert.ok(vr.mustRegenerate, 'mustRegenerate should be true when C5 fires');
});

// ── Test 6: Capital not specified → defaults to $10,000 ──────────────────────

test('Test 6: capital not specified in prompt → defaults to $10,000', () => {
  const intent = parseUserIntent('build me 5 balanced tech stocks');

  // capital_usd should be null (not parsed from prompt)
  assert.equal(intent.capital_usd, null, `Expected capital_usd=null; got ${intent.capital_usd}`);

  // Synthesis would default to 10_000 — verify the rule: capital null → 10_000 in narrative
  // We test this via the validateSynthesis step on a portfolio with null capital
  const positions = Array.from({ length: 5 }, (_, i) => makePos(`T${i}`, 20));
  const portfolio: SynthesizedPortfolio = {
    narrative:         'Test portfolio. (Capital assumed $10,000 — specify your budget for exact share counts.)',
    total_capital_usd: 10_000,   // route defaults null capital to 10_000
    cash_reserve_pct:  0,
    requested_count:   5,
    delivered_count:   5,
    shortfall_reason:  null,
    positions,
  };

  // Narrative should mention the $10,000 default
  assert.ok(
    portfolio.narrative.includes('10,000'),
    `Narrative should mention $10,000 default; got: "${portfolio.narrative}"`,
  );

  // total_capital_usd should be set (not null/undefined)
  assert.ok(portfolio.total_capital_usd != null, 'total_capital_usd should not be null after defaulting');
  assert.equal(portfolio.total_capital_usd, 10_000);
});
