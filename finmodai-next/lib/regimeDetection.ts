/**
 * regimeDetection.ts
 *
 * Classifies the current market environment from three inputs:
 *   - volatility   (VIX-like proxy, 0–1 normalized)
 *   - index_trend  (signed momentum; positive = up, negative = down)
 *   - dispersion   (cross-asset return dispersion, 0–1)
 *
 * Outputs a regime label plus sizing and stop-loss adjustment multipliers
 * that can be applied directly to computed position sizes.
 *
 * Pure function — no side effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RegimeInput = {
  volatility:   number;  // 0–1 (0 = calm, 1 = extreme)
  index_trend:  number;  // signed; e.g. +0.05 = 5% uptrend, -0.03 = downtrend
  dispersion:   number;  // 0–1 cross-asset spread proxy
};

export type VolatilityLevel = 'low' | 'medium' | 'high';

export type RegimeResult = {
  regime:              'risk_on' | 'risk_off' | 'neutral';
  volatility_level:    VolatilityLevel;
  /**
   * Multiply computed position sizes by this factor.
   * risk_on = 1.0, neutral = 0.80, risk_off = 0.50
   */
  size_multiplier:     number;
  /**
   * Multiply stop-loss percentages by this factor.
   * Tighter in high vol (< 1), wider in low vol (> 1).
   */
  stop_loss_multiplier: number;
  confidence:          number;   // [0, 1] how confident we are in this regime
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function r3(n: number): number { return Math.round(n * 1e3) / 1e3; }

function classifyVol(vol: number): VolatilityLevel {
  if (vol >= 0.60) return 'high';
  if (vol >= 0.30) return 'medium';
  return 'low';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect market regime from volatility, trend, and dispersion signals.
 *
 * Classification rules (in priority order):
 *   1. high vol  → risk_off  (regardless of trend)
 *   2. low vol + positive trend + low dispersion → risk_on
 *   3. low/medium vol + negative trend → risk_off
 *   4. else → neutral
 */
export function detectRegime(input: RegimeInput): RegimeResult {
  const vol  = clamp(input.volatility,  0, 1);
  const trend = clamp(input.index_trend, -1, 1);
  const disp = clamp(input.dispersion,  0, 1);

  const volLevel = classifyVol(vol);

  let regime: RegimeResult['regime'];
  let confidence: number;

  if (volLevel === 'high') {
    regime     = 'risk_off';
    confidence = 0.5 + (vol - 0.60) / 0.80;  // stronger conviction at extreme vol
  } else if (volLevel === 'low' && trend > 0.05 && disp < 0.50) {
    regime     = 'risk_on';
    confidence = 0.4 + trend * 2 * 0.3 + (1 - disp) * 0.3;
  } else if (trend < -0.05) {
    regime     = 'risk_off';
    confidence = 0.4 + Math.abs(trend) * 0.6;
  } else {
    regime     = 'neutral';
    confidence = 0.5 - Math.abs(trend) * 0.3;
  }

  const size_multiplier: number =
    regime === 'risk_on'  ? 1.00 :
    regime === 'neutral'  ? 0.80 : 0.50;

  const stop_loss_multiplier: number =
    volLevel === 'high'   ? 0.75 :
    volLevel === 'medium' ? 1.00 : 1.25;

  return {
    regime,
    volatility_level:    volLevel,
    size_multiplier:     r3(size_multiplier),
    stop_loss_multiplier: r3(stop_loss_multiplier),
    confidence:          r3(clamp(confidence, 0, 1)),
  };
}

/**
 * Summarize regime as a one-line description (for UI tooltips).
 */
export function regimeSummary(r: RegimeResult): string {
  const volDesc = `${r.volatility_level} vol`;
  if (r.regime === 'risk_on')  return `Risk-On — ${volDesc}, size ×${r.size_multiplier}`;
  if (r.regime === 'risk_off') return `Risk-Off — ${volDesc}, size ×${r.size_multiplier}, stops ×${r.stop_loss_multiplier}`;
  return `Neutral — ${volDesc}, size ×${r.size_multiplier}`;
}
