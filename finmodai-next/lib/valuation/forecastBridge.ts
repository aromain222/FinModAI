function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildGrowthPathFromForecast(forecast: number[], lastActual: number): number[] {
  if (!Number.isFinite(lastActual) || lastActual <= 0) return [];

  const growthPath: number[] = [];
  let previous = lastActual;

  for (const value of forecast) {
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(previous) || previous <= 0) {
      continue;
    }
    growthPath.push(Number(clamp(value / previous - 1, -0.4, 0.4).toFixed(4)));
    previous = value;
  }

  return growthPath;
}
