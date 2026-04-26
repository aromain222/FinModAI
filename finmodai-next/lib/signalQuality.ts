/**
 * signalQuality.ts
 *
 * Scores a signal stream based on realized performance:
 *   score = 0.5 × accuracy + 0.3 × norm_avg_return + 0.2 × consistency
 *
 * - accuracy:    fraction of directional calls that were correct
 * - avg_return:  mean realized return of directional trades (normalized to [0,1])
 * - consistency: 1 − normalized coefficient of variation of returns
 *
 * Pure function — no side effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalRecord = {
  predicted:     'long' | 'short' | 'neutral';
  actual_return: number;   // signed fraction, e.g. 0.05 = +5%
  correct:       boolean;  // true if direction matched price move
};

export type SignalQualityResult = {
  signal_score:  number;   // composite [0, 1]
  accuracy:      number;   // fraction correct [0, 1]
  win_rate:      number;   // fraction with positive return [0, 1]
  avg_return:    number;   // mean return (raw fraction)
  consistency:   number;   // [0, 1] — 1 = perfectly consistent
  sample_size:   number;
};

// ── Math helpers ──────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mu = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function r3(n: number): number { return Math.round(n * 1e3) / 1e3; }

/**
 * Normalize avg_return (raw fraction) to [0, 1].
 * Maps the range [-0.10, +0.10] linearly; clamps outside.
 */
function normalizeReturn(r: number): number {
  return clamp01((r + 0.10) / 0.20);
}

/**
 * Consistency: 1 − CV (coefficient of variation), capped at [0, 1].
 * High consistency = low dispersion of returns relative to their mean.
 * Uses a 10% base std as the normalizer so a 0% std = 1.0, 10% std = 0.0.
 */
function computeConsistency(returns: number[]): number {
  if (returns.length < 2) return 0.5;
  const sd = stdDev(returns);
  return clamp01(1 - sd / 0.10);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a composite quality score from a series of signal records.
 * Only directional records (long / short) are counted.
 */
export function computeSignalQuality(records: SignalRecord[]): SignalQualityResult {
  const directional = records.filter((r) => r.predicted !== 'neutral');

  if (directional.length === 0) {
    return {
      signal_score: 0,
      accuracy:     0,
      win_rate:     0,
      avg_return:   0,
      consistency:  0,
      sample_size:  0,
    };
  }

  const returns  = directional.map((r) => r.actual_return);
  const correct  = directional.filter((r) => r.correct).length;
  const wins     = returns.filter((r) => r > 0).length;

  const accuracy    = r3(correct / directional.length);
  const avgReturn   = r3(mean(returns));
  const winRate     = r3(wins / directional.length);
  const consistency = r3(computeConsistency(returns));

  const signalScore = r3(
    0.5 * accuracy +
    0.3 * normalizeReturn(avgReturn) +
    0.2 * consistency
  );

  return {
    signal_score: signalScore,
    accuracy,
    win_rate:     winRate,
    avg_return:   avgReturn,
    consistency,
    sample_size:  directional.length,
  };
}

/**
 * Derive a signal quality label from the composite score.
 */
export function signalQualityLabel(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 0.70) return 'excellent';
  if (score >= 0.55) return 'good';
  if (score >= 0.40) return 'fair';
  return 'poor';
}
