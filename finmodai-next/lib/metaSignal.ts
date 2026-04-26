/**
 * metaSignal.ts
 *
 * Combines all analytical layers into a single final trading decision:
 *   - base signal from LLM + probability model
 *   - signal quality score from realized performance
 *   - market regime (risk_on / neutral / risk_off)
 *   - high-conviction probability boost
 *
 * Adjustment rules (applied in order):
 *   1. Low signal quality (score < threshold) → downgrade to neutral
 *   2. risk_off regime → halve long exposure; amplify short exposure
 *   3. risk_on regime → +20% size boost for longs
 *   4. bull_prob > 0.70 AND signal strong → additional boost
 *   5. Apply regime size_multiplier
 *   6. Hard-clamp to [0, 0.10]
 *
 * Pure function — no side effects.
 */

import type { SignalQualityResult } from './signalQuality';
import type { RegimeResult }        from './regimeDetection';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MetaSignalInput = {
  trading_signal: {
    direction:  'long' | 'short' | 'neutral';
    conviction: number;   // [0, 1]
    size_pct:   number;   // [0, 0.10]
  };
  probabilities: {
    bull:       number;
    base:       number;
    bear:       number;
    confidence: number;
  };
  signal_quality: Pick<SignalQualityResult, 'signal_score' | 'win_rate' | 'sample_size'>;
  regime: RegimeResult;
  /** Minimum signal_score to make a directional call. Default 0.40. */
  quality_threshold?: number;
};

export type FinalSignal = {
  direction:           'long' | 'short' | 'neutral';
  size:                number;   // final allocation fraction [0, 0.10]
  adjusted_confidence: number;   // [0, 1]
  adjustments:         string[]; // human-readable log of applied rules
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SIZE              = 0.10;
const DEFAULT_THRESHOLD     = 0.40;
const HIGH_PROB_THRESHOLD   = 0.70;
const STRONG_SIGNAL_FLOOR   = 0.60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function r4(n: number): number { return Math.round(n * 1e4) / 1e4; }
function r3(n: number): number { return Math.round(n * 1e3) / 1e3; }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Synthesize all layers into a final actionable signal.
 */
export function computeMetaSignal(input: MetaSignalInput): FinalSignal {
  const {
    trading_signal,
    probabilities,
    signal_quality,
    regime,
    quality_threshold = DEFAULT_THRESHOLD,
  } = input;

  const adjustments: string[] = [];

  // ── 1. Signal quality gate ─────────────────────────────────────────────────
  let direction  = trading_signal.direction;
  let size       = trading_signal.size_pct;
  let confidence = trading_signal.conviction;

  const hasEnoughSamples = signal_quality.sample_size >= 5;
  if (hasEnoughSamples && signal_quality.signal_score < quality_threshold) {
    direction  = 'neutral';
    size       = 0;
    confidence = 0.10;
    adjustments.push(
      `Quality gate: score ${(signal_quality.signal_score * 100).toFixed(0)}% < threshold ${(quality_threshold * 100).toFixed(0)}% → neutral`
    );
  }

  // ── 2. Regime: risk_off ────────────────────────────────────────────────────
  if (regime.regime === 'risk_off' && direction !== 'neutral') {
    if (direction === 'long') {
      size *= 0.5;
      confidence *= 0.8;
      adjustments.push('Risk-Off: long size ×0.50, confidence ×0.80');
    } else if (direction === 'short') {
      // Shorts are directionally correct in risk_off — slight boost
      size       = Math.min(size * 1.15, MAX_SIZE);
      adjustments.push('Risk-Off: short size ×1.15 (aligned with regime)');
    }
  }

  // ── 3. Regime: risk_on ────────────────────────────────────────────────────
  if (regime.regime === 'risk_on' && direction === 'long') {
    size = Math.min(size * 1.20, MAX_SIZE);
    adjustments.push('Risk-On: long size ×1.20');
  }

  // ── 4. High-probability boost ──────────────────────────────────────────────
  const bullDominant = probabilities.bull > HIGH_PROB_THRESHOLD && direction === 'long';
  const bearDominant = probabilities.bear > HIGH_PROB_THRESHOLD && direction === 'short';

  if ((bullDominant || bearDominant) && signal_quality.signal_score >= STRONG_SIGNAL_FLOOR) {
    size = Math.min(size * 1.25, MAX_SIZE);
    confidence = Math.min(confidence * 1.10, 1);
    const side = bullDominant ? `bull=${(probabilities.bull * 100).toFixed(0)}%` : `bear=${(probabilities.bear * 100).toFixed(0)}%`;
    adjustments.push(`High-prob boost (${side}, score ${(signal_quality.signal_score * 100).toFixed(0)}%): size ×1.25`);
  }

  // ── 5. Apply regime size multiplier ───────────────────────────────────────
  if (regime.size_multiplier !== 1.0 && direction !== 'neutral') {
    size *= regime.size_multiplier;
    adjustments.push(`Regime size multiplier: ×${regime.size_multiplier}`);
  }

  // ── 6. Final clamp ─────────────────────────────────────────────────────────
  const finalSize = r4(clamp(size, 0, MAX_SIZE));
  if (size > MAX_SIZE) adjustments.push('Hard-capped at 10%');

  if (adjustments.length === 0) adjustments.push('No adjustments applied');

  return {
    direction,
    size:                finalSize,
    adjusted_confidence: r3(clamp(confidence, 0, 1)),
    adjustments,
  };
}
