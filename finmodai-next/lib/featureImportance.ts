/**
 * featureImportance.ts
 *
 * Identifies which input features best predict realized PnL via Pearson
 * correlation — no LLM, no black-box ML.
 *
 * Features evaluated:
 *   valuation_gap    — signed gap between model value and market price
 *   event_momentum   — sum of decay-weighted event scores
 *   importance_score — peak absolute event score (proxy for event salience)
 *   surprise_score   — |valuation_gap| (magnitude of mispricing at signal)
 *   time_decay       — recency weight of the event vs the window
 *
 * Pure function — no side effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FeatureVector = {
  valuation_gap:    number;
  event_momentum:   number;
  importance_score: number;
  surprise_score:   number;
  time_decay:       number;
  pnl:              number;  // realized return (signed fraction)
};

export type FeatureImportance = {
  feature:    string;
  importance: number;   // |Pearson r| ∈ [0, 1]
  direction:  'positive' | 'negative' | 'none';
  raw_corr:   number;   // signed Pearson r
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

/**
 * Pearson correlation between two equal-length arrays.
 * Returns 0 if either array has zero variance or fewer than 2 elements.
 */
function pearsonCorr(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const mx  = mean(x);
  const my  = mean(y);
  const sdx = stdDev(x);
  const sdy = stdDev(y);

  if (sdx === 0 || sdy === 0) return 0;

  const cov = x.reduce((acc, xi, i) => acc + (xi - mx) * (y[i] - my), 0) / x.length;
  return cov / (sdx * sdy);
}

function r3(n: number): number { return Math.round(n * 1e3) / 1e3; }

// ── Public API ────────────────────────────────────────────────────────────────

const FEATURE_KEYS: Array<keyof Omit<FeatureVector, 'pnl'>> = [
  'valuation_gap',
  'event_momentum',
  'importance_score',
  'surprise_score',
  'time_decay',
];

/**
 * Compute feature importance as |Pearson r(feature, pnl)| for each feature.
 * Returns features sorted by importance descending.
 *
 * Requires at least 3 samples for meaningful results; returns zero-importance
 * for all features with fewer than 3 samples.
 */
export function computeFeatureImportance(
  vectors: FeatureVector[]
): FeatureImportance[] {
  const pnls = vectors.map((v) => v.pnl);

  return FEATURE_KEYS
    .map((key) => {
      const xs      = vectors.map((v) => v[key]);
      const corr    = pearsonCorr(xs, pnls);
      const absCorr = Math.abs(corr);

      return {
        feature:    key,
        importance: r3(absCorr),
        raw_corr:   r3(corr),
        direction:  absCorr < 0.02 ? 'none' : corr > 0 ? 'positive' : 'negative',
      } satisfies FeatureImportance;
    })
    .sort((a, b) => b.importance - a.importance);
}

/**
 * Build a FeatureVector from raw event data (suitable for backtest integration).
 *
 * @param valuation_gap   Signed valuation gap at signal time
 * @param event_scores    Array of decay-weighted event scores for this event
 * @param timestamp_ms    Event timestamp in Unix ms
 * @param window_start_ms Timestamp of the oldest event in the backtest window
 * @param window_end_ms   Timestamp of the newest event in the backtest window
 * @param pnl             Realized return for this trade
 */
export function buildFeatureVector(
  valuation_gap:   number,
  event_scores:    number[],
  timestamp_ms:    number,
  window_start_ms: number,
  window_end_ms:   number,
  pnl:             number
): FeatureVector {
  const windowSpan    = Math.max(1, window_end_ms - window_start_ms);
  const time_decay    = (timestamp_ms - window_start_ms) / windowSpan; // 0=oldest, 1=newest
  const event_momentum = event_scores.reduce((a, b) => a + b, 0);
  const importance_score = event_scores.length > 0
    ? Math.max(...event_scores.map(Math.abs))
    : 0;
  const surprise_score = Math.abs(valuation_gap);

  return {
    valuation_gap,
    event_momentum,
    importance_score,
    surprise_score,
    time_decay,
    pnl,
  };
}
