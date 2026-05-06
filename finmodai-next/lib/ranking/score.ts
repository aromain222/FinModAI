/**
 * Stock ranking / scoring engine.
 *
 * Each component is a pure function (0–10 output) so they can be
 * unit-tested in isolation. scoreStock() wires them against live API data with
 * per-fetch timeouts; scoreMultiple() batches 5 tickers at a time to avoid
 * hammering upstream providers.
 */

import type {
  RankedStock,
  ScoreBreakdown,
  PriceForecastData,
  EventItem,
  EventsPayload,
} from './types';
import { mockFallback } from './mock';
import { buildValuationSignal, scoreValuationSignal } from '@/lib/valuation/signal';

// ── Constants ──────────────────────────────────────────────────────────────

export const WEIGHTS = {
  forecastSignal:   0.25,
  catalystStrength: 0.20,
  momentum:         0.17,
  earningsSetup:    0.13,
  valuationSignal:  0.13,
  riskAdjustment:   0.12,
} as const;

const FETCH_TIMEOUT_MS = 1_800;
const BATCH_SIZE = 50;
const SCORE_CACHE_TTL_MS = 60_000;

const scoreCache = new Map<string, { expiresAt: number; value: RankedStock }>();

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(n: number, lo = 0, hi = 10): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Component 1: Forecast Signal (weight 0.30) ─────────────────────────────
//
// Piecewise linear mapping of TimesFM returnPct → 0–10.
// Calibrated so +10% → ~7.2 and -10% → ~1.0 (asymmetric: downside penalised more).

export function forecastToScore(returnPct: number): number {
  if (returnPct >= 20) return 10;
  if (returnPct >= 15) return 8 + ((returnPct - 15) / 5) * 2;   // 8→10
  if (returnPct >= 10) return 6 + ((returnPct - 10) / 5) * 2;   // 6→8
  if (returnPct >= 5)  return 5 + ((returnPct - 5)  / 5);       // 5→6
  if (returnPct >= 0)  return 4 + (returnPct / 5);              // 4→5
  if (returnPct >= -5) return 3 + ((returnPct + 5)  / 5);       // 3→4
  if (returnPct >= -10) return 1 + ((returnPct + 10) / 5) * 2;  // 1→3
  return Math.max(0, (returnPct + 20) / 10);                    // 0→1
}

// ── Component 2: Momentum (weight 0.20) ───────────────────────────────────
//
// Uses two independent signals blended 60 / 40:
//   - Forecast trajectory: second half of forecast values vs first half.
//   - Historical recency: last 5 prices vs prior 5 prices.

export function momentumFromForecast(data: PriceForecastData): number {
  const fv = data.forecast?.values;
  const hp = data.historical?.prices;

  let forecastTrend = 5;
  if (fv && fv.length >= 4) {
    const mid = Math.floor(fv.length / 2);
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const firstHalf  = avg(fv.slice(0, mid));
    const secondHalf = avg(fv.slice(mid));
    if (firstHalf > 0) {
      const trendPct = ((secondHalf - firstHalf) / firstHalf) * 100;
      // trendPct > 0 means forecast accelerating upward
      forecastTrend = clamp(5 + trendPct * 0.4);
    }
  }

  let histMomentum = 5;
  if (hp && hp.length >= 10) {
    const recent = hp.slice(-5);
    const prior  = hp.slice(-10, -5);
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const recentAvg = avg(recent);
    const priorAvg  = avg(prior);
    if (priorAvg > 0) {
      const histPct = ((recentAvg - priorAvg) / priorAvg) * 100;
      histMomentum = clamp(5 + histPct * 0.7);
    }
  }

  return clamp(forecastTrend * 0.6 + histMomentum * 0.4);
}

// ── Component 3: Catalyst Strength (weight 0.25) ──────────────────────────
//
// Scores event density and direction. Positive high-impact events push up;
// negative events drag down. Density bonus rewards information richness.

export function catalystsToScore(events: EventItem[]): number {
  if (events.length === 0) return 4; // no catalysts ≠ neutral — slight negative

  let score = 4;
  for (const e of events) {
    const dir = e.direction ?? e.eventForecast?.direction ?? 'neutral';
    const mag = e.magnitude ?? 'medium';
    const rankBoost = e.rank != null ? clamp(e.rank.score / 10, 0, 1) : 0;

    const magMult  = mag === 'high' ? 1.5 : mag === 'medium' ? 1.0 : 0.5;
    const dirValue = dir === 'positive' ? 1 : dir === 'negative' ? -1 : 0;

    score += dirValue * magMult * (0.5 + rankBoost * 0.5);
  }

  // Density bonus: more events = richer catalyst environment (max +1.5)
  score += Math.min(1.5, events.length * 0.15);

  return clamp(score);
}

// ── Component 4: Earnings Setup (weight 0.15) ──────────────────────────────
//
// Filters for earnings/transcript events and scores based on proximity,
// expected direction, and confidence.

export function earningsSetupScore(events: EventItem[]): number {
  const earningsEvents = events.filter(
    e => e.kind === 'earnings' || e.kind === 'transcript'
  );

  if (earningsEvents.length === 0) return 5; // no earnings context = neutral

  let score = 5;
  for (const e of earningsEvents) {
    const dir    = e.eventForecast?.direction ?? 'neutral';
    const conf   = clamp(e.eventForecast?.confidence ?? 0.5, 0, 1);
    const impact = Math.abs(e.eventForecast?.priceImpactPct ?? 0);

    const impactBoost = Math.min(1, impact / 5);
    if (dir === 'positive') score += 1.5 * conf + impactBoost;
    if (dir === 'negative') score -= 1.5 * conf + impactBoost;
  }

  return clamp(score);
}

// ── Component 5: Risk Adjustment (weight 0.10) ────────────────────────────
//
// Higher score = lower risk. Measures annualised-equivalent daily volatility
// from historical prices, then penalises for negative event density.

export function riskScore(data: PriceForecastData, negativeEventCount: number): number {
  const hp = data.historical?.prices;
  let volScore = 5; // default medium risk

  if (hp && hp.length >= 5) {
    const returns: number[] = [];
    for (let i = 1; i < hp.length; i++) {
      const prev = hp[i - 1];
      if (prev > 0) returns.push((hp[i] - prev) / prev);
    }
    if (returns.length > 0) {
      const mean     = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
      const dailyVol = Math.sqrt(variance) * 100; // as %

      // Low volatility → high score (rewarded for low risk profile)
      if      (dailyVol < 0.5) volScore = 9;
      else if (dailyVol < 1.0) volScore = 7;
      else if (dailyVol < 1.5) volScore = 6;
      else if (dailyVol < 2.0) volScore = 5;
      else if (dailyVol < 3.0) volScore = 3;
      else                     volScore = 2;
    }
  }

  const eventPenalty = Math.min(3, negativeEventCount * 0.6);
  return clamp(volScore - eventPenalty);
}

// ── Narrative derivation ───────────────────────────────────────────────────

function primaryReason(
  breakdown: ScoreBreakdown,
  returnPct: number | null,
): string {
  type Key = keyof ScoreBreakdown;
  const best = (Object.keys(breakdown) as Key[]).reduce<Key>(
    (a, b) => (breakdown[a] >= breakdown[b] ? a : b),
    'forecastSignal',
  );

  switch (best) {
    case 'forecastSignal':
      return returnPct != null
        ? `TimesFM projects ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}% over the horizon`
        : 'Quantitative forecast model showing positive signal';
    case 'catalystStrength':
      return 'Multiple positive near-term catalysts in the event pipeline';
    case 'momentum':
      return 'Bullish price momentum with accelerating trend trajectory';
    case 'earningsSetup':
      return 'Favourable earnings setup — beat probability elevated';
    case 'valuationSignal':
      return 'Valuation support improves the risk/reward versus market expectations';
    case 'riskAdjustment':
      return 'Low volatility profile with well-controlled downside';
  }
}

function mainRisk(
  breakdown: ScoreBreakdown,
  returnPct: number | null,
): string {
  type Key = keyof ScoreBreakdown;
  const worst = (Object.keys(breakdown) as Key[]).reduce<Key>(
    (a, b) => (breakdown[a] <= breakdown[b] ? a : b),
    'forecastSignal',
  );

  switch (worst) {
    case 'forecastSignal':
      return returnPct != null && returnPct < 0
        ? `Model projects ${returnPct.toFixed(1)}% downside over horizon`
        : 'Forecast signal weak or model data unavailable';
    case 'catalystStrength':
      return 'Sparse or net-negative near-term catalyst pipeline';
    case 'momentum':
      return 'Weak or deteriorating recent price momentum';
    case 'earningsSetup':
      return 'Earnings miss risk could compress multiple sharply';
    case 'valuationSignal':
      return 'Compressed valuation signal — market expectations already look demanding';
    case 'riskAdjustment':
      return 'Elevated volatility — position sizing should reflect wider stops';
  }
}

// ── Core: score a single ticker ────────────────────────────────────────────

export async function scoreStock(
  ticker: string,
  baseUrl: string,
  horizonWeeks = 6,
): Promise<RankedStock> {
  const t           = ticker.toUpperCase();
  const horizonDays = horizonWeeks * 7;
  const cacheKey = `${t}:${horizonWeeks}`;
  const cached = scoreCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [forecastResult, eventsResult] = await Promise.allSettled([
    fetch(`${baseUrl}/api/timesfm?type=price&ticker=${t}&horizon=${horizonDays}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache:  'no-store',
    })
      .then(r => (r.ok ? (r.json() as Promise<PriceForecastData>) : null))
      .catch(() => null),

    fetch(`${baseUrl}/api/events?ticker=${t}&range=30d&limit=20`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache:  'no-store',
    })
      .then(r => (r.ok ? (r.json() as Promise<EventsPayload>) : null))
      .catch(() => null),
  ]);

  const forecastData: PriceForecastData =
    forecastResult.status === 'fulfilled' && forecastResult.value != null
      ? forecastResult.value
      : {};

  const eventsPayload: EventsPayload =
    eventsResult.status === 'fulfilled' && eventsResult.value != null
      ? eventsResult.value
      : {};

  const events: EventItem[] = eventsPayload.events ?? eventsPayload.items ?? [];
  const isLive =
    (forecastResult.status === 'fulfilled' && forecastResult.value != null) ||
    (eventsResult.status === 'fulfilled' && eventsResult.value != null);

  // Derive returnPct from forecast vs current price
  let returnPct: number | null = null;
  const fv = forecastData.forecast?.values;
  const hp = forecastData.historical?.prices;
  if (fv?.length && hp?.length) {
    const cur = hp.at(-1);
    const end = fv.at(-1);
    if (cur != null && end != null && cur > 0) {
      returnPct = ((end - cur) / cur) * 100;
    }
  }

  const negativeEvents = events.filter(
    e => (e.direction ?? e.eventForecast?.direction) === 'negative',
  ).length;
  const valuation = buildValuationSignal({ forecastReturnPct: returnPct, events });

  const breakdown: ScoreBreakdown = {
    forecastSignal:   round1(clamp(returnPct != null ? forecastToScore(returnPct) : 5)),
    catalystStrength: round1(clamp(catalystsToScore(events))),
    momentum:         round1(clamp(momentumFromForecast(forecastData))),
    earningsSetup:    round1(clamp(earningsSetupScore(events))),
    valuationSignal:  round1(clamp(scoreValuationSignal(valuation))),
    riskAdjustment:   round1(clamp(riskScore(forecastData, negativeEvents))),
  };

  const raw =
    breakdown.forecastSignal   * WEIGHTS.forecastSignal   +
    breakdown.catalystStrength * WEIGHTS.catalystStrength +
    breakdown.momentum         * WEIGHTS.momentum         +
    breakdown.earningsSetup    * WEIGHTS.earningsSetup    +
    breakdown.valuationSignal  * WEIGHTS.valuationSignal  +
    breakdown.riskAdjustment   * WEIGHTS.riskAdjustment;

  const score = round1(clamp(raw, 1, 10));

  const ranked: RankedStock = {
    ticker: t,
    score,
    signal: score >= 7.0 ? 'green' : score >= 4.0 ? 'yellow' : 'red',
    horizonWeeks,
    primaryReason: primaryReason(breakdown, returnPct),
    mainRisk:      mainRisk(breakdown, returnPct),
    breakdown,
    meta: {
      forecastReturnPct: returnPct != null ? round1(returnPct) : null,
      catalystCount:     events.length,
      dataSource:        isLive ? 'live' : 'mock',
      scoredAt:          new Date().toISOString(),
      valuation,
    },
  };
  scoreCache.set(cacheKey, { expiresAt: Date.now() + SCORE_CACHE_TTL_MS, value: ranked });
  return ranked;
}

// ── Score multiple tickers, batched to avoid overloading upstreams ─────────

export async function scoreMultiple(
  tickers: string[],
  baseUrl: string,
  horizonWeeks = 6,
): Promise<RankedStock[]> {
  const results: RankedStock[] = [];

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const settled = await Promise.all(
      batch.map(t =>
        scoreStock(t, baseUrl, horizonWeeks).catch(() => mockFallback(t, horizonWeeks)),
      ),
    );
    results.push(...settled);
  }

  return results.sort((a, b) => b.score - a.score);
}
