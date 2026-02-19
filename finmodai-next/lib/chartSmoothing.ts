/**
 * Chart smoothing — finance-appropriate smoothing for Market Brief and macro charts.
 * Emphasizes direction and regime shifts over short-term noise. No spline; no distortion.
 *
 * Rules by metric (caller applies):
 * - Fed Funds: optional 7-day rolling avg overlay; preserve step changes.
 * - 10Y Treasury: 7–14 day rolling avg primary; raw at reduced opacity.
 * - CPI / Unemployment: 3-month MA; raw as dots, smoothed line.
 * - S&P / Equity: 21-day EMA primary; raw at low opacity.
 * - VIX: 14-day rolling MEDIAN primary; raw spikes muted.
 */

export interface DatedValue {
  date: string;
  value: number | null;
}

/**
 * Simple moving average. Returns null until window is filled.
 */
export function rollingAverage(
  points: DatedValue[],
  window: number
): DatedValue[] {
  if (!points.length || window < 1) return [];
  const result: DatedValue[] = [];
  for (let i = 0; i < points.length; i++) {
    if (points[i].value === null || !Number.isFinite(points[i].value)) {
      result.push({ date: points[i].date, value: null });
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = points[j].value;
      if (v != null && Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }
    const avg = count >= window ? sum / count : null;
    result.push({ date: points[i].date, value: avg });
  }
  return result;
}

/**
 * Exponential moving average. Alpha = 2 / (span + 1). First value is first valid point.
 */
export function ema(points: DatedValue[], span: number): DatedValue[] {
  if (!points.length || span < 1) return [];
  const alpha = 2 / (span + 1);
  const result: DatedValue[] = [];
  let prevEma: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const v = points[i].value;
    if (v === null || !Number.isFinite(v)) {
      result.push({ date: points[i].date, value: prevEma });
      continue;
    }
    const nextEma: number = prevEma == null ? v : alpha * v + (1 - alpha) * prevEma;
    prevEma = nextEma;
    result.push({ date: points[i].date, value: nextEma });
  }
  return result;
}

/**
 * Rolling median. Robust to spikes (e.g. VIX). Returns null until window is filled.
 */
export function rollingMedian(points: DatedValue[], window: number): DatedValue[] {
  if (!points.length || window < 1) return [];
  const result: DatedValue[] = [];
  for (let i = 0; i < points.length; i++) {
    const slice: number[] = [];
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = points[j].value;
      if (v != null && Number.isFinite(v)) slice.push(v);
    }
    let value: number | null = null;
    if (slice.length >= window) {
      slice.sort((a, b) => a - b);
      const mid = Math.floor(slice.length / 2);
      value = slice.length % 2 === 1 ? slice[mid]! : (slice[mid - 1]! + slice[mid]!) / 2;
    }
    result.push({ date: points[i].date, value });
  }
  return result;
}

/**
 * Downsample for long daily series. Keeps first, last, and every nth point. Preserves trend.
 */
export function downsample<T extends { date: string }>(points: T[], everyN: number): T[] {
  if (points.length <= 60 || everyN <= 1) return points;
  const out: T[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1 || i % everyN === 0) {
      out.push(points[i]);
    }
  }
  return out.length >= 2 ? out : points;
}

/** Default: raw stroke 1px, 30–40% opacity; smoothed 2–2.5px */
export const SMOOTH_STROKE = 2.25;
export const RAW_STROKE = 1;
export const RAW_OPACITY = 0.35;
