import type { RankedStock, ScoreBreakdown } from './types';

export const OPPORTUNITY_GREEN_THRESHOLD = 7.0;
export const OPPORTUNITY_YELLOW_THRESHOLD = 4.0;

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
  return round1(clamp(rawWeightedScore(breakdown)));
}

export function signalFromOpportunityScore(score: number): RankedStock['signal'] {
  if (score >= OPPORTUNITY_GREEN_THRESHOLD) return 'green';
  if (score >= OPPORTUNITY_YELLOW_THRESHOLD) return 'yellow';
  return 'red';
}
