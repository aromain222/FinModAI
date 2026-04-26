/**
 * positionSizing.ts
 *
 * Computes risk-adjusted position size from signal quality and market regime.
 *
 *   size = clamp(base_size × confidence × signal_score / (1 + volatility), 0, 0.10)
 *
 * Pure function — no side effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SizingInput = {
  base_size:     number;  // target allocation fraction, e.g. 0.05 = 5%
  signal_score:  number;  // composite quality score [0, 1]
  confidence:    number;  // probability model confidence [0, 1]
  volatility:    number;  // realized or implied vol proxy [0, 1]
};

export type SizingResult = {
  size_pct:          number;  // final allocation [0, 0.10]
  size_multiplier:   number;  // applied adjustment vs base
  capped:            boolean; // true if hard cap was binding
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SIZE = 0.10;  // 10% hard cap — never exceeded

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function r4(n: number): number { return Math.round(n * 1e4) / 1e4; }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute risk-adjusted position size.
 *
 * Volatility is in the denominator: high vol → smaller position.
 * Both confidence and signal_score gate the allocation: a signal with 50%
 * confidence and 0.6 score on a 5% base yields 5% × 0.5 × 0.6 / (1+vol).
 */
export function computePositionSize(input: SizingInput): SizingResult {
  const { base_size, signal_score, confidence, volatility } = input;

  const raw = base_size * clamp(confidence, 0, 1) * clamp(signal_score, 0, 1) /
              (1 + clamp(volatility, 0, 1));

  const capped   = raw > MAX_SIZE;
  const size_pct = r4(clamp(raw, 0, MAX_SIZE));
  const multiplier = base_size > 0 ? r4(size_pct / base_size) : 0;

  return {
    size_pct,
    size_multiplier: multiplier,
    capped,
  };
}

/**
 * Quick scalar variant — returns only the final size fraction.
 */
export function positionSize(input: SizingInput): number {
  return computePositionSize(input).size_pct;
}
