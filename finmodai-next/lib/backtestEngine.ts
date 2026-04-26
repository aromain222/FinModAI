/**
 * backtestEngine.ts
 *
 * Evaluates how well the deterministic probability model predicts price moves
 * across a sequence of historical events.
 *
 * Stateless and pure — no side effects, no external calls.
 * Works with real or synthetic price series.
 *
 * Note on synthetic backtests: when real price data is unavailable,
 * callers may generate a synthetic series from event severity/bias.
 * This validates internal model consistency rather than real-world alpha.
 */

import {
  computeProbabilities,
  computeConfidence,
  type ProbabilityInput,
} from './probabilityModel';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BacktestHorizon = '1d' | '3d' | '5d';

export type BacktestEvent = {
  timestamp:     number;          // Unix ms
  valuation_gap: number;          // decimal
  event_scores:  number[];        // marginal_delta × decay_weight per event
  scenario_skew: number;
  volatility?:   number;
  headline?:     string;
};

export type BacktestTrade = {
  index:        number;
  timestamp:    number;
  headline:     string | null;
  predicted:    'long' | 'short' | null;  // null = no directional call
  bull_prob:    number;
  base_prob:    number;
  bear_prob:    number;
  confidence:   number;
  entry_price:  number;
  exit_price:   number;
  return_pct:   number;           // signed actual return
  correct:      boolean | null;   // null when no directional call made
};

export type BacktestResult = {
  accuracy:     number;           // % of directional calls that were correct
  win_rate:     number;           // % of directional trades with positive return
  avg_return:   number;           // mean return across directional trades
  sharpe_like:  number;           // avg_return / std_dev (returns)
  trade_count:  number;           // total directional trades made
  call_rate:    number;           // fraction of events that generated a call
  trades:       BacktestTrade[];  // full trade log
};

// ── Constants ─────────────────────────────────────────────────────────────────

const HORIZON_STEPS: Record<BacktestHorizon, number> = {
  '1d': 1,
  '3d': 3,
  '5d': 5,
};

const DIRECTION_THRESHOLD = 0.60; // min probability to make a directional call

// ── Math helpers ──────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mu = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - mu) ** 2, 0) / values.length);
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function round3(n: number): number {
  return Math.round(n * 1_000) / 1_000;
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Run a full backtest over an event sequence aligned with a price series.
 *
 * @param events      Ordered list of backtest events (chronological).
 * @param priceSeries One price per time step, aligned with event indices.
 *                    Minimum length = events.length + HORIZON_STEPS[horizon].
 * @param horizon     Look-forward window.
 */
export function runBacktest(
  events: BacktestEvent[],
  priceSeries: number[],
  horizon: BacktestHorizon
): BacktestResult {
  const steps = HORIZON_STEPS[horizon];
  const trades: BacktestTrade[] = [];

  for (let i = 0; i < events.length; i++) {
    const exitIdx = i + steps;
    if (exitIdx >= priceSeries.length) break;

    const event      = events[i];
    const entryPrice = priceSeries[i];
    const exitPrice  = priceSeries[exitIdx];

    if (entryPrice === 0 || !isFinite(entryPrice) || !isFinite(exitPrice)) continue;

    const returnPct = (exitPrice - entryPrice) / entryPrice;

    // Deterministic probability computation — NO LLM
    const probInput: ProbabilityInput = {
      valuation_gap: event.valuation_gap,
      event_scores:  event.event_scores,
      scenario_skew: event.scenario_skew,
      volatility:    event.volatility ?? 0.5,
    };
    const probs      = computeProbabilities(probInput);
    const confidence = computeConfidence(probs);

    // Directional call: long / short / no call
    let predicted: 'long' | 'short' | null = null;
    if (probs.bull_prob > DIRECTION_THRESHOLD)      predicted = 'long';
    else if (probs.bear_prob > DIRECTION_THRESHOLD) predicted = 'short';

    // Correctness: long wins if return > 0, short wins if return < 0
    let correct: boolean | null = null;
    if (predicted === 'long')  correct = returnPct > 0;
    if (predicted === 'short') correct = returnPct < 0;

    trades.push({
      index:       i,
      timestamp:   event.timestamp,
      headline:    event.headline ?? null,
      predicted,
      bull_prob:   probs.bull_prob,
      base_prob:   probs.base_prob,
      bear_prob:   probs.bear_prob,
      confidence,
      entry_price: entryPrice,
      exit_price:  exitPrice,
      return_pct:  round4(returnPct),
      correct,
    });
  }

  // Aggregate stats on directional trades only (where we made a call)
  const directional = trades.filter((t) => t.predicted !== null);
  const correct     = directional.filter((t) => t.correct === true);
  const returns     = directional.map((t) => t.return_pct);
  const wins        = returns.filter((r) => r > 0);

  const avgReturn  = round4(mean(returns));
  const sd         = stdDev(returns);
  const sharpeLike = sd > 0 ? round3(avgReturn / sd) : 0;

  return {
    accuracy:    round3(directional.length > 0 ? correct.length / directional.length : 0),
    win_rate:    round3(returns.length > 0 ? wins.length / returns.length : 0),
    avg_return:  avgReturn,
    sharpe_like: sharpeLike,
    trade_count: directional.length,
    call_rate:   round3(events.length > 0 ? directional.length / events.length : 0),
    trades,
  };
}

// ── Synthetic price series generator ─────────────────────────────────────────
//
// Produces a deterministic pseudo-price series from event severity and bias.
// Used when real market prices are unavailable.
// Reproducible: seed is the event index, no Math.random().

/**
 * Deterministic noise in [-1, 1] from a seed integer.
 * Uses a simple sine-based LCG that is stable across JS engines.
 */
function deterministicNoise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1; // remap [0,1] → [-1,1]
}

export type SyntheticPriceEvent = {
  severity:  number;  // 0–100
  bias:      'RiskOn' | 'RiskOff' | 'Mixed';
  timestamp: number;
};

/**
 * Build a synthetic price series from event sequence for backtesting.
 *
 * @param events     Ordered sequence of market events.
 * @param startPrice Initial price (default 100).
 * @param noisePct   Max random noise per step as fraction of price (default 0.01 = ±1%).
 */
export function buildSyntheticPriceSeries(
  events: SyntheticPriceEvent[],
  startPrice = 100,
  noisePct   = 0.01
): number[] {
  const prices: number[] = [startPrice];

  for (let i = 0; i < events.length; i++) {
    const { severity, bias } = events[i];
    const prev = prices[prices.length - 1];

    // Directional impact: RiskOn → positive, RiskOff → negative, Mixed → small
    const direction =
      bias === 'RiskOn'  ? 1 :
      bias === 'RiskOff' ? -1 : 0.1;

    // Impact proportional to severity (0–5% per event at severity=100)
    const impact = (severity / 100) * direction * 0.05;

    // Deterministic noise: unique per event index
    const noise = deterministicNoise(i) * noisePct;

    prices.push(prev * (1 + impact + noise));
  }

  return prices;
}
