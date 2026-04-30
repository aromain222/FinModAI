export type ForecastAttributionPrimaryDriver = 'macro' | 'company' | 'mixed';

export type ForecastAttribution = {
  delta: number[];
  primaryDriver: ForecastAttributionPrimaryDriver;
  explanation: string;
};

export type ForecastAttributionInput = {
  baselineGrowth: number[];
  forecastGrowth: number[];
  macroSeries?: number[];
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 4): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function finiteSeries(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function changes(values: number[]): number[] {
  const finite = finiteSeries(values);
  const result: number[] = [];
  for (let index = 1; index < finite.length; index += 1) {
    result.push(finite[index] - finite[index - 1]);
  }
  return result;
}

function correlation(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (length < 2) return 0;

  const leftSlice = left.slice(0, length);
  const rightSlice = right.slice(0, length);
  const leftMean = average(leftSlice);
  const rightMean = average(rightSlice);
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < length; index += 1) {
    const leftCentered = leftSlice[index] - leftMean;
    const rightCentered = rightSlice[index] - rightMean;
    numerator += leftCentered * rightCentered;
    leftVariance += leftCentered ** 2;
    rightVariance += rightCentered ** 2;
  }

  if (leftVariance === 0 || rightVariance === 0) return 0;
  return numerator / Math.sqrt(leftVariance * rightVariance);
}

function buildDelta(baselineGrowth: number[], forecastGrowth: number[]): number[] {
  const length = Math.max(baselineGrowth.length, forecastGrowth.length);
  const delta: number[] = [];
  const fallbackBaseline = baselineGrowth.at(-1) ?? 0;

  for (let index = 0; index < length; index += 1) {
    const baseline = Number.isFinite(baselineGrowth[index]) ? baselineGrowth[index] : fallbackBaseline;
    const forecast = Number.isFinite(forecastGrowth[index]) ? forecastGrowth[index] : baseline;
    delta.push(round(clamp(forecast - baseline, -0.4, 0.4)));
  }

  return delta;
}

function explainDriver(
  primaryDriver: ForecastAttributionPrimaryDriver,
  delta: number[],
  macroSeries?: number[],
): string {
  const averageDelta = average(delta);
  const macroChange = macroSeries ? average(changes(macroSeries)) : 0;

  if (primaryDriver === 'macro') {
    if (macroChange < -0.01 && averageDelta > 0) {
      return 'Growth acceleration driven primarily by declining rate environment';
    }
    if (macroChange > 0.01 && averageDelta < 0) {
      return 'Growth pressure driven primarily by rising macro headwinds';
    }
    return averageDelta >= 0
      ? 'Growth outlook is supported primarily by macro conditions'
      : 'Growth outlook is pressured primarily by macro conditions';
  }

  if (primaryDriver === 'company') {
    if (averageDelta > 0.0025) return 'Growth acceleration driven primarily by company-specific momentum';
    if (averageDelta < -0.0025) return 'Growth pressure driven primarily by company-specific factors';
    return 'Forecast remains close to baseline with limited company-specific change';
  }

  if (averageDelta > 0.0025) return 'Growth acceleration reflects mixed macro and company drivers';
  if (averageDelta < -0.0025) return 'Growth pressure reflects mixed macro and company drivers';
  return 'Forecast remains close to baseline with mixed drivers';
}

export function computeForecastAttribution(input: ForecastAttributionInput): ForecastAttribution {
  const baselineGrowth = finiteSeries(input.baselineGrowth);
  const forecastGrowth = finiteSeries(input.forecastGrowth);
  const delta = buildDelta(baselineGrowth, forecastGrowth);

  if (delta.length === 0) {
    return {
      delta: [],
      primaryDriver: 'mixed',
      explanation: 'Forecast attribution unavailable; using baseline assumptions',
    };
  }

  const macroChanges = input.macroSeries ? changes(input.macroSeries) : [];
  const macroCorrelation = Math.abs(correlation(macroChanges, delta));
  const primaryDriver: ForecastAttributionPrimaryDriver =
    macroChanges.length >= 2 && macroCorrelation >= 0.65
      ? 'macro'
      : macroChanges.length >= 2 && macroCorrelation <= 0.25
        ? 'company'
        : 'mixed';

  return {
    delta,
    primaryDriver,
    explanation: explainDriver(primaryDriver, delta, input.macroSeries),
  };
}
