export type ForecastConfidence = {
  confidence: number;
  volatility: number;
};

export type ForecastConfidenceInput = {
  forecast: number[];
  historical: number[];
};

export type AdjustedForecastConfidenceInput = {
  baseConfidence: number;
  accuracy: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function finiteSeries(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function rateChanges(values: number[]): number[] {
  const finite = finiteSeries(values);
  const result: number[] = [];

  for (let index = 1; index < finite.length; index += 1) {
    const previous = finite[index - 1];
    const current = finite[index];
    if (previous > 0) {
      result.push(current / previous - 1);
    } else {
      result.push(current - previous);
    }
  }

  return result.filter((value) => Number.isFinite(value));
}

export function computeForecastConfidence(input: ForecastConfidenceInput): ForecastConfidence {
  const historical = finiteSeries(input.historical);
  const forecast = finiteSeries(input.forecast);

  if (historical.length < 2 || forecast.length === 0) {
    return {
      confidence: 0.5,
      volatility: 0,
    };
  }

  const historicalChanges = rateChanges(historical);
  const combinedChanges = rateChanges([...historical.slice(-1), ...forecast]);
  const volatility = standardDeviation([...historicalChanges, ...combinedChanges]);
  const trendShift = Math.abs(average(combinedChanges) - average(historicalChanges));
  const rawConfidence = 0.9 - volatility * 3 - trendShift * 1.5;

  return {
    confidence: Number(clamp(rawConfidence, 0.2, 0.95).toFixed(2)),
    volatility: Number(Math.max(0, volatility).toFixed(4)),
  };
}

export function computeAdjustedConfidence(input: AdjustedForecastConfidenceInput): number {
  const baseConfidence = clamp(input.baseConfidence, 0.2, 0.95);
  const accuracy = clamp(input.accuracy, 0, 1);
  const adjustedConfidence = baseConfidence * (0.5 + 0.5 * accuracy);
  return Number(clamp(adjustedConfidence, 0.2, 0.95).toFixed(2));
}
