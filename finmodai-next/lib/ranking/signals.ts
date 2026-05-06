import type { RankedStock, ScoreBreakdown } from './types';

export const OPPORTUNITY_GREEN_THRESHOLD = 6.7;
export const OPPORTUNITY_YELLOW_THRESHOLD = 5.2;

const SIGNAL_WEIGHTS = {
  forecastSignal:   0.25,
  catalystStrength: 0.20,
  momentum:         0.17,
  earningsSetup:    0.13,
  valuationSignal:  0.13,
  riskAdjustment:   0.12,
} as const;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo = 1, hi = 10): number {
  return Math.min(hi, Math.max(lo, n));
}

export function rawWeightedScore(breakdown: ScoreBreakdown): number {
  return (
    breakdown.forecastSignal * SIGNAL_WEIGHTS.forecastSignal +
    breakdown.catalystStrength * SIGNAL_WEIGHTS.catalystStrength +
    breakdown.momentum * SIGNAL_WEIGHTS.momentum +
    breakdown.earningsSetup * SIGNAL_WEIGHTS.earningsSetup +
    breakdown.valuationSignal * SIGNAL_WEIGHTS.valuationSignal +
    breakdown.riskAdjustment * SIGNAL_WEIGHTS.riskAdjustment
  );
}

export function compositeOpportunityScore(breakdown: ScoreBreakdown): number {
  const raw = rawWeightedScore(breakdown);
  const values = Object.values(breakdown).slice().sort((a, b) => b - a);
  const top = ((values[0] ?? raw) + (values[1] ?? raw)) / 2;
  const bottom = ((values.at(-1) ?? raw) + (values.at(-2) ?? raw)) / 2;
  const spread = top - bottom;

  let score = 5.5 + (raw - 5.5) * 1.65;
  score += Math.max(0, top - 7.5) * 0.22;
  score -= Math.max(0, 4 - bottom) * 0.18;

  if (spread < 2) {
    score = 5.5 + (score - 5.5) * 0.75;
  }

  return round1(clamp(score));
}

export function signalFromOpportunityScore(score: number): RankedStock['signal'] {
  if (score >= OPPORTUNITY_GREEN_THRESHOLD) return 'green';
  if (score >= OPPORTUNITY_YELLOW_THRESHOLD) return 'yellow';
  return 'red';
}
