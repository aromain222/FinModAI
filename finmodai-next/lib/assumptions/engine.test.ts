import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseClaim,
  assessPlausibility,
  computeAdjustedScore,
  applyAssumption,
  PLAUSIBILITY_SCALAR,
} from './engine';
import type { ScoreBreakdown } from '@/lib/ranking/types';

// ── Shared fixture ─────────────────────────────────────────────────────────

const BASE_BREAKDOWN: ScoreBreakdown = {
  forecastSignal:   7.0,
  catalystStrength: 6.5,
  momentum:         6.0,
  earningsSetup:    7.5,
  valuationSignal:  5.5,
  riskAdjustment:   6.0,
};

const BASE_INPUT = {
  ticker:       'NVDA',
  baseScore:    6.5,
  breakdown:    BASE_BREAKDOWN,
  horizonWeeks: 6,
};

// ── parseClaim ─────────────────────────────────────────────────────────────

test('parseClaim: positive direction from earnings beat', () => {
  const c = parseClaim('Earnings beat by 10%');
  assert.equal(c.direction, 'positive');
});

test('parseClaim: negative direction from guidance cut', () => {
  const c = parseClaim('Guidance cut disappoints investors');
  assert.equal(c.direction, 'negative');
});

test('parseClaim: routes earnings keywords to earningsSetup primary', () => {
  const c = parseClaim('Q3 earnings beat consensus by 12%');
  const primary = c.affectedFactors.find(f => f.weight === 'primary');
  assert.equal(primary?.factor, 'earningsSetup');
});

test('parseClaim: earnings claim adds forecastSignal as secondary', () => {
  const c = parseClaim('Earnings beat by 8%');
  const secondary = c.affectedFactors.find(f => f.factor === 'forecastSignal' && f.weight === 'secondary');
  assert.ok(secondary, 'forecastSignal should appear as secondary');
});

test('parseClaim: demand/revenue keywords → forecastSignal primary', () => {
  const c = parseClaim('Revenue grows 15%');
  const primary = c.affectedFactors.find(f => f.weight === 'primary');
  assert.equal(primary?.factor, 'forecastSignal');
});

test('parseClaim: risk keyword → riskAdjustment primary', () => {
  const c = parseClaim('Regulatory risk increases materially');
  const primary = c.affectedFactors.find(f => f.weight === 'primary');
  assert.equal(primary?.factor, 'riskAdjustment');
});

test('parseClaim: valuation keyword → valuationSignal primary', () => {
  const c = parseClaim('The stock is undervalued on reverse DCF');
  const primary = c.affectedFactors.find(f => f.weight === 'primary');
  assert.equal(primary?.factor, 'valuationSignal');
});

test('parseClaim: momentum keyword → momentum primary', () => {
  const c = parseClaim('Price momentum is breaking down');
  const primary = c.affectedFactors.find(f => f.weight === 'primary');
  assert.equal(primary?.factor, 'momentum');
});

test('parseClaim: catalyst keyword → catalystStrength primary', () => {
  const c = parseClaim('FDA approval announced for the new product');
  const primary = c.affectedFactors.find(f => f.weight === 'primary');
  assert.equal(primary?.factor, 'catalystStrength');
});

test('parseClaim: percentage extracted from text', () => {
  const c = parseClaim('Revenue beats by 25%');
  assert.equal(c.parsedPct, 25);
});

test('parseClaim: no percentage → parsedPct null', () => {
  const c = parseClaim('Demand doubles');
  assert.equal(c.parsedPct, null);
});

test('parseClaim: "doubles" → magnitude 3.0', () => {
  const c = parseClaim('Revenue doubles');
  assert.equal(c.magnitude, 3.0);
});

test('parseClaim: "slightly" → magnitude 0.5', () => {
  const c = parseClaim('Margins slightly improve');
  assert.equal(c.magnitude, 0.5);
});

test('parseClaim: small percentage → low magnitude', () => {
  const c = parseClaim('Earnings beat by 3%');
  assert.equal(c.magnitude, 0.5);
});

test('parseClaim: unknown text → defaults forecastSignal', () => {
  const c = parseClaim('things will be fine');
  assert.equal(c.affectedFactors[0].factor, 'forecastSignal');
});

// ── assessPlausibility ─────────────────────────────────────────────────────

test('assessPlausibility: "guaranteed" → extreme', () => {
  const claim = parseClaim('Earnings are guaranteed to beat');
  const result = assessPlausibility(claim, BASE_BREAKDOWN);
  assert.equal(result.level, 'extreme');
  assert.equal(result.scalar, PLAUSIBILITY_SCALAR.extreme);
  assert.ok(result.pushback !== null);
});

test('assessPlausibility: "zero risk" → extreme', () => {
  const claim = parseClaim('There is zero risk here');
  const result = assessPlausibility(claim, BASE_BREAKDOWN);
  assert.equal(result.level, 'extreme');
  assert.ok(result.pushback !== null);
});

test('assessPlausibility: "stock doubles" → extreme', () => {
  const claim = parseClaim('The stock doubles in the next month');
  const result = assessPlausibility(claim, BASE_BREAKDOWN);
  assert.equal(result.level, 'extreme');
});

test('assessPlausibility: "goes to zero" → extreme', () => {
  const claim = parseClaim('The stock goes to zero');
  const result = assessPlausibility(claim, BASE_BREAKDOWN);
  assert.equal(result.level, 'extreme');
});

test('assessPlausibility: 50%+ return → extreme via magnitude', () => {
  const claim = parseClaim('Revenue surges by 60%');
  const result = assessPlausibility(claim, BASE_BREAKDOWN);
  assert.equal(result.level, 'extreme');
});

test('assessPlausibility: moderate beat → high plausibility', () => {
  const claim = parseClaim('Earnings beat by 5%');
  const result = assessPlausibility(claim, BASE_BREAKDOWN);
  assert.equal(result.level, 'high');
  assert.equal(result.scalar, 1.0);
  assert.equal(result.pushback, null);
});

test('assessPlausibility: "slightly improves" → high', () => {
  const claim = parseClaim('Margins slightly improve');
  const result = assessPlausibility(claim, BASE_BREAKDOWN);
  assert.equal(result.level, 'high');
});

test('assessPlausibility: ceiling check fires when factor near max', () => {
  const highBreakdown: ScoreBreakdown = {
    ...BASE_BREAKDOWN,
    earningsSetup: 9.2, // near ceiling
  };
  const claim  = parseClaim('Earnings beat significantly');
  const result = assessPlausibility(claim, highBreakdown);
  assert.ok(result.level === 'low' || result.level === 'medium');
  assert.ok(result.pushback !== null);
});

test('assessPlausibility: high magnitude without extreme keywords → low', () => {
  const claim = parseClaim('Revenue grows sharply and considerably');
  // magnitude 2.0 → medium; "sharply" → 2.0
  const result = assessPlausibility(claim, BASE_BREAKDOWN);
  assert.ok(result.level === 'medium' || result.level === 'low');
});

// ── computeAdjustedScore ───────────────────────────────────────────────────

test('computeAdjustedScore: positive assumption raises score', () => {
  const claim = parseClaim('Earnings beat by 8%');
  const plaus = assessPlausibility(claim, BASE_BREAKDOWN);
  const { adjustedScore } = computeAdjustedScore(BASE_BREAKDOWN, claim, plaus);
  assert.ok(adjustedScore >= BASE_INPUT.baseScore, 'Positive assumption should not lower score');
});

test('computeAdjustedScore: negative assumption lowers score', () => {
  const claim = parseClaim('Guidance cut disappoints');
  const plaus = assessPlausibility(claim, BASE_BREAKDOWN);
  const { adjustedScore } = computeAdjustedScore(BASE_BREAKDOWN, claim, plaus);
  assert.ok(adjustedScore <= BASE_INPUT.baseScore, 'Negative assumption should not raise score');
});

test('computeAdjustedScore: extreme plausibility produces tiny delta', () => {
  const claim = parseClaim('Revenue doubles guaranteed');
  const plaus = assessPlausibility(claim, BASE_BREAKDOWN);
  const { adjustedScore } = computeAdjustedScore(BASE_BREAKDOWN, claim, plaus);
  const delta = Math.abs(adjustedScore - BASE_INPUT.baseScore);
  assert.ok(delta < 0.5, `Extreme plausibility should cap delta; got ${delta}`);
});

test('computeAdjustedScore: factorDeltas cover affected factors', () => {
  const claim  = parseClaim('Earnings beat by 10%');
  const plaus  = assessPlausibility(claim, BASE_BREAKDOWN);
  const { factorDeltas } = computeAdjustedScore(BASE_BREAKDOWN, claim, plaus);
  assert.ok('earningsSetup' in factorDeltas, 'earningsSetup should have a delta');
});

test('computeAdjustedScore: adjusted score stays within [1, 10]', () => {
  // Force ceiling scenario
  const maxBreakdown: ScoreBreakdown = {
    forecastSignal: 10, catalystStrength: 10, momentum: 10,
    earningsSetup: 10, valuationSignal: 10, riskAdjustment: 10,
  };
  const claim = parseClaim('Revenue surges dramatically');
  const plaus = assessPlausibility(claim, maxBreakdown);
  const { adjustedScore } = computeAdjustedScore(maxBreakdown, claim, plaus);
  assert.ok(adjustedScore <= 10, `Score must not exceed 10; got ${adjustedScore}`);

  // Floor scenario
  const minBreakdown: ScoreBreakdown = {
    forecastSignal: 1, catalystStrength: 1, momentum: 1,
    earningsSetup: 1, valuationSignal: 1, riskAdjustment: 1,
  };
  const claim2 = parseClaim('Earnings collapse, guidance cut');
  const plaus2 = assessPlausibility(claim2, minBreakdown);
  const { adjustedScore: low } = computeAdjustedScore(minBreakdown, claim2, plaus2);
  assert.ok(low >= 1, `Score must not go below 1; got ${low}`);
});

// ── applyAssumption (integration) ─────────────────────────────────────────

test('applyAssumption: returns all required fields', () => {
  const result = applyAssumption({ ...BASE_INPUT, assumption: 'Earnings beat by 10%' });
  assert.ok(typeof result.adjustedScore    === 'number');
  assert.ok(typeof result.delta            === 'number');
  assert.ok(typeof result.plausibility     === 'string');
  assert.ok(typeof result.plausibilityScalar === 'number');
  assert.ok(Array.isArray(result.affectedFactors));
  assert.ok(typeof result.adjustedBreakdown === 'object');
  assert.ok(typeof result.explanation      === 'string');
  // pushback may be null or string
  assert.ok(result.pushback === null || typeof result.pushback === 'string');
});

test('applyAssumption: explanation contains ticker name', () => {
  const result = applyAssumption({ ...BASE_INPUT, assumption: 'Revenue grows 15%' });
  assert.ok(result.explanation.includes('NVDA'));
});

test('applyAssumption: explanation contains horizon', () => {
  const result = applyAssumption({ ...BASE_INPUT, assumption: 'Earnings beat', horizonWeeks: 8 });
  assert.ok(result.explanation.includes('8-week'));
});

test('applyAssumption: unrealistic claim returns non-null pushback', () => {
  const result = applyAssumption({ ...BASE_INPUT, assumption: 'The stock goes to zero' });
  assert.ok(result.pushback !== null);
  assert.equal(result.plausibility, 'extreme');
});

test('applyAssumption: realistic claim has null pushback', () => {
  const result = applyAssumption({ ...BASE_INPUT, assumption: 'Earnings beat by 5%' });
  assert.equal(result.pushback, null);
});

test('applyAssumption: delta rounds to 1 decimal place', () => {
  const result = applyAssumption({ ...BASE_INPUT, assumption: 'Revenue grows slightly' });
  const decimals = (result.delta.toString().split('.')[1] ?? '').length;
  assert.ok(decimals <= 1, `Delta should have at most 1 decimal; got ${result.delta}`);
});

test('applyAssumption: negative assumption lowers adjustedScore below base', () => {
  const result = applyAssumption({ ...BASE_INPUT, assumption: 'Competition intensifies significantly' });
  assert.ok(result.adjustedScore <= BASE_INPUT.baseScore);
  assert.ok(result.delta <= 0);
});

test('applyAssumption: plausibilityScalar matches level', () => {
  const result = applyAssumption({ ...BASE_INPUT, assumption: 'Revenue guaranteed to double' });
  assert.equal(result.plausibilityScalar, PLAUSIBILITY_SCALAR[result.plausibility]);
});
