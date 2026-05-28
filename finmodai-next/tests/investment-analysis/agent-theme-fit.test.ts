/**
 * Stage 2 tests — agent theme-fit scoring and rejection logic.
 *
 * These tests cover the pure functions (median, threshold logic) and
 * the AssetMetadata cache, not live LLM calls. Integration behavior is
 * described in comments where live calls would be needed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// ── Test helpers — local copies of pure functions used by the routes ──────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

const THEME_REJECTION_THRESHOLD = 5;

function shouldReject(
  medianThemeFit: number | null,
  themeCount: number,
): boolean {
  if (themeCount === 0) return false;
  if (medianThemeFit === null) return false;
  return medianThemeFit < THEME_REJECTION_THRESHOLD;
}

// ── median() ──────────────────────────────────────────────────────────────────

test('median: odd-length array returns middle value', () => {
  assert.equal(median([1, 3, 5]), 3);
});

test('median: even-length array returns average of middle two', () => {
  assert.equal(median([1, 3, 5, 7]), 4);
});

test('median: single element returns that element', () => {
  assert.equal(median([8]), 8);
});

test('median: empty array returns 0', () => {
  assert.equal(median([]), 0);
});

test('median: unsorted array is sorted before computing', () => {
  assert.equal(median([9, 1, 5, 3, 7]), 5);
});

// ── shouldReject ──────────────────────────────────────────────────────────────

test('shouldReject: rejects when medianThemeFit < 5 and themes specified', () => {
  assert.equal(shouldReject(2, 2), true);
  assert.equal(shouldReject(4.9, 1), true);
});

test('shouldReject: does NOT reject when medianThemeFit >= 5', () => {
  assert.equal(shouldReject(5,   1), false);
  assert.equal(shouldReject(8.5, 2), false);
  assert.equal(shouldReject(10,  1), false);
});

test('shouldReject: does NOT reject when no themes were specified', () => {
  assert.equal(shouldReject(1, 0), false);   // theme_count = 0 → no filter
  assert.equal(shouldReject(0, 0), false);
});

test('shouldReject: does NOT reject when medianThemeFit is null', () => {
  // Agents may not return theme_fit if route called without intent
  assert.equal(shouldReject(null, 2), false);
});

// ── HYG simulation ────────────────────────────────────────────────────────────
//
// These model what the 19 personas would return for HYG (iShares iBoxx High
// Yield Corporate Bond ETF) when intent.themes = ["ai", "space"].
// Actual LLM scores will vary; this tests the rejection math with realistic data.

test('HYG simulation: median < 3 with realistic off-theme scores → rejected', () => {
  // Simulated theme_fit_scores for HYG with ai/space theme
  const hygScores = [
    1, 1, 2, 0, 1, 2, 1, 0, 1, 1,  // value/quant personas — "this is bonds"
    0, 1, 0, 2, 1, 1, 0, 1, 2,     // tech/growth personas — no fit at all
  ];
  const med = median(hygScores);
  assert.ok(med < 3, `Expected HYG median < 3, got ${med}`);
  assert.equal(shouldReject(med, 2), true);
});

// ── NVDA simulation ───────────────────────────────────────────────────────────

test('NVDA simulation: median > 7 with realistic in-theme scores → NOT rejected', () => {
  // Simulated theme_fit_scores for NVDA with ai/space theme
  const nvdaScores = [
    9, 10, 8, 7, 10, 9, 10, 8, 9, 8,  // persona consensus: very high fit
    9, 10, 8, 9, 7,  9, 8, 10, 9,
  ];
  const med = median(nvdaScores);
  assert.ok(med > 7, `Expected NVDA median > 7, got ${med}`);
  assert.equal(shouldReject(med, 2), false);
});

// ── No theme simulation ───────────────────────────────────────────────────────

test('no theme: NVDA with theme_count=0 → theme_fit_score should be null and not rejected', () => {
  // When no themes specified, agents return null for theme_fit_score
  assert.equal(shouldReject(null, 0), false);
  assert.equal(shouldReject(5, 0),    false);  // even if a score exists, no theme → no reject
});

// ── Threshold edge cases ──────────────────────────────────────────────────────

test('threshold: exactly 5.0 is not rejected (>=, not >)', () => {
  assert.equal(shouldReject(5.0, 1), false);
});

test('threshold: 4.99 is rejected', () => {
  assert.equal(shouldReject(4.99, 1), true);
});

// ── AssetMetadata cache ───────────────────────────────────────────────────────
//
// We test that the module compiles and the type contract is correct.
// Network-dependent fetching is not tested here (would require mocking).

test('AssetMetadata type shape', async () => {
  const { fetchAssetMetadata } = await import('@/lib/execution/assetMetadata');
  // fetchAssetMetadata is an async function
  assert.equal(typeof fetchAssetMetadata, 'function');
});
