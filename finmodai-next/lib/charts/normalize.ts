/**
 * Chart data normalization utilities
 *
 * Ensures predictable, clean data for Recharts by:
 * - Converting dates to epoch milliseconds
 * - Parsing numbers from strings/unknown types
 * - Removing invalid/duplicate points
 * - Sorting by time
 */

import { z } from 'zod';

export type SeriesPoint = { t: number; v: number };

/**
 * Convert various date formats to epoch milliseconds
 */
export function toEpochMs(x: string | number | Date): number {
  if (typeof x === 'number') {
    // Assume milliseconds if > 1e10, else seconds
    return x > 1e10 ? x : x * 1000;
  }
  const d = new Date(x);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Safely convert unknown value to number
 */
export function toNumber(x: unknown): number {
  if (x == null) return NaN;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    // Remove commas and parse
    const n = Number(x.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Normalize raw API response to canonical series format
 * 
 * Ensures: sorted, finite, no duplicate timestamps
 */
export function normalizeSeries(raw: unknown): SeriesPoint[] {
  const responseSchema = z.union([
    z.object({ ok: z.literal(true), data: z.object({ points: z.array(z.unknown()) }) }),
    z.object({ data: z.object({ points: z.array(z.unknown()) }) }),
    z.object({ data: z.object({ series: z.array(z.unknown()) }) }),
    z.object({ data: z.array(z.unknown()) }),
    z.object({ points: z.array(z.unknown()) }),
    z.object({ series: z.array(z.unknown()) }),
    z.array(z.unknown()),
  ]);

  const pointSchema = z
    .object({
      t: z.union([z.number(), z.string(), z.date()]).optional(),
      time: z.union([z.number(), z.string(), z.date()]).optional(),
      timestamp: z.union([z.number(), z.string(), z.date()]).optional(),
      date: z.union([z.number(), z.string(), z.date()]).optional(),
      v: z.union([z.number(), z.string()]).optional(),
      value: z.union([z.number(), z.string()]).optional(),
      close: z.union([z.number(), z.string()]).optional(),
      price: z.union([z.number(), z.string()]).optional(),
    })
    .passthrough();

  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[normalizeSeries] Unsupported response shape', {
        type: typeof raw,
        keys: raw && typeof raw === 'object' ? Object.keys(raw as Record<string, unknown>) : [],
      });
    }
    return [];
  }

  let points: unknown[] = [];
  const value = parsed.data;

  if (Array.isArray(value)) {
    points = value;
  } else if ('data' in value && Array.isArray((value as any).data)) {
    points = (value as any).data;
  } else if ('points' in value && Array.isArray((value as any).points)) {
    points = (value as any).points;
  } else if ('series' in value && Array.isArray((value as any).series)) {
    points = (value as any).series;
  } else if ('data' in value && (value as any).data?.points) {
    points = (value as any).data.points;
  } else if ('data' in value && (value as any).data?.series) {
    points = (value as any).data.series;
  }

  if (!Array.isArray(points) || points.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[normalizeSeries] No points extracted', {
        keys: value && typeof value === 'object' ? Object.keys(value as Record<string, unknown>) : [],
      });
    }
    return [];
  }

  const normalized = points
    .map((point) => {
      const parsedPoint = pointSchema.safeParse(point);
      if (!parsedPoint.success) {
        return null;
      }

      const payload = parsedPoint.data;
      const timeValue =
        payload.t ?? payload.time ?? payload.timestamp ?? payload.date ?? null;
      const valueValue = payload.v ?? payload.value ?? payload.close ?? payload.price ?? null;

      const t = timeValue ? toEpochMs(timeValue as any) : NaN;
      const v = toNumber(valueValue);

      if (!Number.isFinite(t) || !Number.isFinite(v)) {
        return null;
      }

      return { t, v };
    })
    .filter((p): p is SeriesPoint => p !== null)
    .sort((a, b) => a.t - b.t);

  const deduped: SeriesPoint[] = [];
  for (const point of normalized) {
    if (deduped.length > 0 && deduped[deduped.length - 1].t === point.t) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }

  return deduped;
}

/**
 * Convert percent formats into consistent percent points
 * 
 * Handles:
 * - 0.034 (decimal) -> 3.4%
 * - 3.4 (already percent) -> 3.4%
 * 
 * This prevents the "31,095% growth" issue where raw GDP values
 * are interpreted as percentages.
 */
export function normalizePercent(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  // If absolute value > 1, assume already in percent form
  // If absolute value <= 1, assume decimal form and convert
  if (Math.abs(x) <= 1) return x * 100; // 0.034 -> 3.4%
  return x; // already percent
}

/**
 * Detect if series is flat (all values identical)
 * 
 * Useful for detecting data issues where:
 * - API returns constant values
 * - Rounding too aggressively
 * - Plotting same point repeated
 */
export function isFlat(series: { v: number }[]): boolean {
  if (series.length < 3) return false;
  const min = Math.min(...series.map((p) => p.v));
  const max = Math.max(...series.map((p) => p.v));
  return max - min === 0;
}
