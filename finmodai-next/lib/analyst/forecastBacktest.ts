export type ForecastBacktestQuality = 'strong' | 'mixed' | 'weak' | 'insufficient';

export type ForecastBacktestSummary = {
  method: 'rolling_momentum_direction';
  horizonDays: number;
  sampleSize: number;
  directionHitRate: number | null;
  averageAbsoluteErrorPct: number | null;
  medianAbsoluteErrorPct: number | null;
  quality: ForecastBacktestQuality;
  explanation: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint] ?? null;
  const left = sorted[midpoint - 1];
  const right = sorted[midpoint];
  return typeof left === 'number' && typeof right === 'number' ? (left + right) / 2 : null;
}

function qualityFromStats(sampleSize: number, hitRate: number, averageErrorPct: number): ForecastBacktestQuality {
  if (sampleSize < 3) return 'insufficient';
  if (hitRate >= 0.6 && averageErrorPct <= 8) return 'strong';
  if (hitRate >= 0.45 && averageErrorPct <= 14) return 'mixed';
  return 'weak';
}

function explanationForQuality(quality: ForecastBacktestQuality, sampleSize: number): string {
  if (quality === 'insufficient') {
    return 'Not enough recent history to judge the short-term forecast path.';
  }
  if (quality === 'strong') {
    return `Recent walk-forward checks have been directionally reliable across ${sampleSize} windows.`;
  }
  if (quality === 'mixed') {
    return `Recent walk-forward checks are usable but noisy across ${sampleSize} windows.`;
  }
  return `Recent walk-forward checks have been unreliable across ${sampleSize} windows; use the forecast as a scenario, not a signal.`;
}

export function computePriceForecastBacktest(params: {
  prices: number[];
  horizonDays: number;
}): ForecastBacktestSummary {
  const cleanPrices = params.prices.filter((value) => Number.isFinite(value) && value > 0);
  const horizonSteps = clamp(Math.round(params.horizonDays * 5 / 7), 5, 60);
  const lookbackSteps = horizonSteps;
  const minimumLength = lookbackSteps + horizonSteps + 4;

  if (cleanPrices.length < minimumLength) {
    return {
      method: 'rolling_momentum_direction',
      horizonDays: params.horizonDays,
      sampleSize: 0,
      directionHitRate: null,
      averageAbsoluteErrorPct: null,
      medianAbsoluteErrorPct: null,
      quality: 'insufficient',
      explanation: explanationForQuality('insufficient', 0),
    };
  }

  const errors: number[] = [];
  let hits = 0;
  let sampleSize = 0;
  const step = Math.max(3, Math.floor(horizonSteps / 4));
  const start = lookbackSteps;
  const endExclusive = cleanPrices.length - horizonSteps;

  for (let index = start; index < endExclusive; index += step) {
    const past = cleanPrices[index - lookbackSteps];
    const current = cleanPrices[index];
    const actual = cleanPrices[index + horizonSteps];
    if (!past || !current || !actual) continue;

    const momentumReturn = clamp(current / past - 1, -0.25, 0.25);
    const predicted = current * (1 + momentumReturn);
    const predictedDirection = predicted >= current ? 1 : -1;
    const actualDirection = actual >= current ? 1 : -1;
    if (predictedDirection === actualDirection) hits += 1;
    errors.push(Math.abs(predicted / actual - 1) * 100);
    sampleSize += 1;
  }

  if (sampleSize === 0 || errors.length === 0) {
    return {
      method: 'rolling_momentum_direction',
      horizonDays: params.horizonDays,
      sampleSize: 0,
      directionHitRate: null,
      averageAbsoluteErrorPct: null,
      medianAbsoluteErrorPct: null,
      quality: 'insufficient',
      explanation: explanationForQuality('insufficient', 0),
    };
  }

  const hitRate = hits / sampleSize;
  const averageError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const medianError = median(errors);
  const quality = qualityFromStats(sampleSize, hitRate, averageError);

  return {
    method: 'rolling_momentum_direction',
    horizonDays: params.horizonDays,
    sampleSize,
    directionHitRate: round(hitRate, 3),
    averageAbsoluteErrorPct: round(averageError, 1),
    medianAbsoluteErrorPct: medianError === null ? null : round(medianError, 1),
    quality,
    explanation: explanationForQuality(quality, sampleSize),
  };
}
