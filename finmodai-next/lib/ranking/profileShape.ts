import type { ScoreBreakdown } from './types';

type ScoreFactor = keyof ScoreBreakdown;

const FACTORS: ScoreFactor[] = [
  'forecastSignal',
  'catalystStrength',
  'momentum',
  'earningsSetup',
  'valuationSignal',
  'riskAdjustment',
];

const PROFILE_OVERRIDES: Record<string, Partial<ScoreBreakdown>> = {
  SOFI: { earningsSetup: 8.4, catalystStrength: 8.1, riskAdjustment: 3.1 },
  HOOD: { momentum: 8.3, catalystStrength: 7.8, riskAdjustment: 3.4 },
  COIN: { momentum: 8.7, forecastSignal: 7.9, riskAdjustment: 2.8 },
  PLTR: { catalystStrength: 8.5, momentum: 7.7, valuationSignal: 3.6 },
  AMD:  { catalystStrength: 8.2, earningsSetup: 7.6, riskAdjustment: 4.1 },
  NVDA: { catalystStrength: 9.0, earningsSetup: 8.8, valuationSignal: 3.4 },
  TSLA: { catalystStrength: 7.7, riskAdjustment: 2.5, valuationSignal: 3.2 },
  META: { momentum: 8.0, earningsSetup: 7.8, riskAdjustment: 6.7 },
  AMZN: { earningsSetup: 8.1, forecastSignal: 7.8, valuationSignal: 5.2 },
  GOOGL:{ riskAdjustment: 7.4, catalystStrength: 6.8, valuationSignal: 4.7 },
  MSFT: { riskAdjustment: 8.2, earningsSetup: 7.9, valuationSignal: 4.8 },
  AAPL: { riskAdjustment: 8.1, momentum: 6.9, catalystStrength: 4.8 },
  UBER: { earningsSetup: 8.0, momentum: 7.4, valuationSignal: 5.1 },
  SHOP: { forecastSignal: 7.8, momentum: 7.2, riskAdjustment: 3.8 },
  SNOW: { forecastSignal: 7.5, catalystStrength: 7.2, valuationSignal: 3.1 },
  NFLX: { earningsSetup: 7.8, momentum: 7.1, riskAdjustment: 5.7 },
  ROKU: { catalystStrength: 7.3, valuationSignal: 6.8, riskAdjustment: 2.9 },
  AFRM: { forecastSignal: 8.1, momentum: 7.7, riskAdjustment: 2.6 },
  SQ:   { valuationSignal: 7.3, catalystStrength: 6.9, riskAdjustment: 3.6 },
  PYPL: { valuationSignal: 8.0, catalystStrength: 5.4, momentum: 4.6 },
};

function hashTicker(ticker: string): number {
  let hash = 2166136261;
  for (const char of ticker.toUpperCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo = 2, hi = 9): number {
  return Math.min(hi, Math.max(lo, n));
}

export function tickerFactorShape(ticker: string): ScoreBreakdown {
  const t = ticker.toUpperCase();
  const seed = hashTicker(t);
  const standout = FACTORS[seed % FACTORS.length];
  const weak = FACTORS[Math.floor(seed / 7) % FACTORS.length] === standout
    ? FACTORS[(FACTORS.indexOf(standout) + 3) % FACTORS.length]
    : FACTORS[Math.floor(seed / 7) % FACTORS.length];

  const shaped = Object.fromEntries(
    FACTORS.map((factor, index) => {
      const bucket = (Math.floor(seed / (index + 3)) + index * 17) % 44;
      return [factor, round1(3.2 + bucket / 10)];
    }),
  ) as ScoreBreakdown;

  shaped[standout] = round1(8.1 + ((seed % 10) / 10));
  shaped[weak] = round1(2.3 + (((seed >> 3) % 14) / 10));

  const overrides = PROFILE_OVERRIDES[t];
  if (overrides) {
    for (const [factor, value] of Object.entries(overrides) as Array<[ScoreFactor, number]>) {
      shaped[factor] = value;
    }
  }

  return FACTORS.reduce((acc, factor) => {
    acc[factor] = round1(clamp(shaped[factor]));
    return acc;
  }, {} as ScoreBreakdown);
}

export function diversifyBreakdown(ticker: string, breakdown: ScoreBreakdown): ScoreBreakdown {
  const shape = tickerFactorShape(ticker);
  const diversified = FACTORS.reduce((acc, factor) => {
    const value = breakdown[factor];
    acc[factor] = round1(clamp(value >= 4.75 && value <= 5.25 ? shape[factor] : value));
    return acc;
  }, {} as ScoreBreakdown);

  const values = FACTORS.map(factor => diversified[factor]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max - min >= 2.2 && max >= 7.2) return diversified;

  const strongest = FACTORS.reduce((best, factor) =>
    shape[factor] > shape[best] ? factor : best,
  FACTORS[0]);
  const weakest = FACTORS.reduce((worst, factor) =>
    shape[factor] < shape[worst] && factor !== strongest ? factor : worst,
  FACTORS.find(factor => factor !== strongest) ?? FACTORS[0]);

  diversified[strongest] = round1(Math.max(diversified[strongest], shape[strongest], 7.8));
  diversified[weakest] = round1(Math.min(diversified[weakest], shape[weakest], 3.8));

  return diversified;
}
