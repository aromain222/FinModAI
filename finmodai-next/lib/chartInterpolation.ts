/**
 * Chart interpolation — DISPLAY-ONLY densification for demo charts.
 * Does not alter stored/calculated values. Use for smoother lines when data is sparse (e.g. annual).
 */

export interface ChartDataPoint {
  date: string;
  value: number | null;
  /** True for actual data; false for interpolated (display-only) */
  isActualPoint?: boolean;
}

export type InterpolationMode = 'none' | 'quarterly' | 'monthly';

/**
 * Parse date string to numeric year (with fraction for ordering).
 */
function toNumericYear(dateStr: string): number {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const daysInYear = 365;
  const dayOfYear = Math.floor(
    (d.getTime() - new Date(y, 0, 0).getTime()) / (24 * 60 * 60 * 1000)
  );
  return y + dayOfYear / daysInYear;
}

/**
 * Linear interpolation between two points. Clamps to [min, max] to avoid overshoot/negatives when requested.
 */
function lerp(
  x: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  clamp?: { min?: number; max?: number }
): number {
  if (x1 === x0) return y0;
  let v = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  if (clamp?.min != null && v < clamp.min) v = clamp.min;
  if (clamp?.max != null && v > clamp.max) v = clamp.max;
  return v;
}

/**
 * Generate display-only interpolated points between annual (or sparse) data.
 * Original points are marked isActualPoint: true; interpolated get isActualPoint: false.
 * Uses linear interpolation; does not introduce negative values for non-negative series.
 */
export function interpolateSeries(
  points: ChartDataPoint[],
  mode: InterpolationMode,
  options?: { allowNegative?: boolean }
): ChartDataPoint[] {
  if (mode === 'none' || points.length < 2) {
    return points.map((p) => ({
      ...p,
      isActualPoint: p.isActualPoint !== false,
    }));
  }

  const valid = points.filter(
    (p): p is ChartDataPoint & { value: number } =>
      p.value != null && Number.isFinite(p.value)
  );
  if (valid.length < 2) {
    return points.map((p) => ({
      ...p,
      isActualPoint: p.isActualPoint !== false,
    }));
  }

  const step = mode === 'monthly' ? 1 / 12 : mode === 'quarterly' ? 1 / 4 : 1;
  const clamp = options?.allowNegative ? undefined : { min: 0 };

  const result: ChartDataPoint[] = [];
  for (let i = 0; i < valid.length; i++) {
    const curr = valid[i];
    const xCurr = toNumericYear(curr.date);
    result.push({
      date: curr.date,
      value: curr.value,
      isActualPoint: true,
    });

    if (i === valid.length - 1) continue;
    const next = valid[i + 1];
    const xNext = toNumericYear(next.date);
    let t = xCurr + step;
    while (t < xNext - 1e-6) {
      const v = lerp(t, xCurr, xNext, curr.value, next.value, clamp);
      const year = Math.floor(t);
      const frac = t - year;
      const dayOfYear = Math.round(frac * 365);
      const d = new Date(year, 0, 0);
      d.setDate(d.getDate() + dayOfYear);
      result.push({
        date: d.toISOString().split('T')[0],
        value: v,
        isActualPoint: false,
      });
      t += step;
    }
  }

  return result;
}
