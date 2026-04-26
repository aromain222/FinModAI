/**
 * probabilityModel.ts
 *
 * Deterministic, LLM-free probability engine for bull / base / bear scenarios.
 * Reproducible: same inputs always produce the same output.
 *
 * Model:
 *   1. Event momentum  = Σ(event_scores), clamped [0, 5]
 *   2. Score each scenario via linear combination of inputs
 *   3. Softmax → probability distribution
 *   4. Volatility widens tails and compresses base
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProbabilityInput {
  /** (updated_valuation - current_price) / |current_price| — decimal */
  valuation_gap: number;
  /** One score per event: marginal_delta_pct × decay_weight (can be negative) */
  event_scores: number[];
  /** scenarios.upside.valuation_delta_pct − scenarios.downside.valuation_delta_pct */
  scenario_skew: number;
  /** Optional realized / implied vol proxy, 0–1 (default 0.5) */
  volatility?: number;
}

export interface ScenarioProbabilities {
  bull_prob: number;  // 0–1
  base_prob: number;  // 0–1
  bear_prob: number;  // 0–1
}

// ── Internals ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function softmax(scores: [number, number, number]): [number, number, number] {
  // Numerically stable: subtract max before exp
  const max  = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max)) as [number, number, number];
  const sum  = exps[0] + exps[1] + exps[2];
  if (sum === 0) return [1 / 3, 1 / 3, 1 / 3];
  return [exps[0] / sum, exps[1] / sum, exps[2] / sum];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute scenario probabilities from model and event inputs.
 *
 * Scoring rationale:
 *   bull_score  = 1.2·vg + 0.8·m + 0.6·skew
 *     → rises when model is cheap (positive gap), events are positive, or
 *       upside scenario dominates
 *   bear_score  = −1.2·vg + 0.8·m − 0.6·skew
 *     → rises when model is expensive (negative gap), events are negative,
 *       or downside scenario dominates
 *   base_score  = 1.0 − |vg|
 *     → highest when valuation gap is near zero (already fairly priced)
 *
 * Note: both bull and bear share the +0.8·m term because high event momentum
 * (regardless of sign) means the market is moving — it amplifies whichever
 * direction the gap + skew already points toward after softmax.
 */
export function computeProbabilities(input: ProbabilityInput): ScenarioProbabilities {
  const { valuation_gap, event_scores, scenario_skew, volatility = 0.5 } = input;

  // 1. Event momentum: sum of weighted scores, clamped to [0, 5]
  const raw_momentum = event_scores.reduce((a, b) => a + b, 0);
  const m = clamp(raw_momentum, 0, 5);

  // 2. Normalise inputs
  const vg   = clamp(valuation_gap, -0.5, 0.5);
  const skew = clamp(scenario_skew, -2, 2);
  const vol  = clamp(volatility, 0, 1);

  // 3. Raw scenario scores
  const bull_score = 1.2 * vg + 0.8 * m + 0.6 * skew;
  const bear_score = -1.2 * vg + 0.8 * m - 0.6 * skew;
  const base_score = 1.0 - Math.abs(vg);

  // 4. Volatility adjustment: high vol → wider tails, suppressed base
  const bull_adj = bull_score * (1 + 0.3 * vol);
  const bear_adj = bear_score * (1 + 0.3 * vol);
  const base_adj = base_score * (1 - 0.2 * vol);

  // 5. Softmax → probabilities
  const [bull_prob, base_prob, bear_prob] = softmax([bull_adj, base_adj, bear_adj]);

  return {
    bull_prob: round3(bull_prob),
    base_prob: round3(base_prob),
    bear_prob: round3(bear_prob),
  };
}

/**
 * Confidence: how strongly one scenario dominates.
 * Returns 0 (uniform distribution) → 1 (one scenario has all mass).
 */
export function computeConfidence(probs: ScenarioProbabilities): number {
  const max = Math.max(probs.bull_prob, probs.base_prob, probs.bear_prob);
  // Scale: max=1/3 (uniform) → 0, max=1.0 → 1
  return round3(clamp((max - 1 / 3) / (2 / 3), 0, 1));
}

/** Which scenario has the highest probability. */
export function dominantScenario(
  probs: ScenarioProbabilities
): 'bull' | 'base' | 'bear' {
  if (probs.bull_prob >= probs.base_prob && probs.bull_prob >= probs.bear_prob)
    return 'bull';
  if (probs.bear_prob >= probs.bull_prob && probs.bear_prob >= probs.base_prob)
    return 'bear';
  return 'base';
}

/**
 * Map probabilities to a trading direction using conviction thresholds.
 * Returns null if no scenario clears the threshold (signal is neutral).
 */
export function probabilityToDirection(
  probs: ScenarioProbabilities,
  threshold = 0.55
): 'long' | 'short' | 'neutral' {
  if (probs.bull_prob > threshold) return 'long';
  if (probs.bear_prob > threshold) return 'short';
  return 'neutral';
}
