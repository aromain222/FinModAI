/**
 * Single source of truth for chart data normalization
 * 
 * Converts any API response to canonical ChartPoint[] shape.
 * This is the ONLY place normalization happens.
 */

export type ChartPoint = {
  time: number; // ms epoch
  value: number; // absolute price OR normalized return
};

/**
 * Normalize raw API response to canonical ChartPoint[]
 * 
 * Input: Raw API response (various shapes)
 * Output: ChartPoint[] sorted by time, invalid points dropped
 * 
 * NEVER depends on UI state (range, scale, etc.)
 */
export function extractChartPoints(raw: any): any[] {
  const payload = raw?.data ?? raw;
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload?.points && Array.isArray(payload.points)) {
    return payload.points;
  }
  if (payload?.series && Array.isArray(payload.series)) {
    return payload.series;
  }
  if (payload?.data?.points && Array.isArray(payload.data.points)) {
    return payload.data.points;
  }
  if (payload?.data?.series && Array.isArray(payload.data.series)) {
    return payload.data.series;
  }
  if (payload?.data && Array.isArray(payload.data)) {
    return payload.data;
  }
  return [];
}

export function normalizeChartSeries(raw: any): ChartPoint[] {
  // Extract points array from various API response shapes
  const points: any[] = extractChartPoints(raw);

  // Dev-only logging to debug empty charts
  if (process.env.NODE_ENV !== 'production' && points.length === 0 && raw) {
    console.warn('[normalizeChartSeries] No points extracted from API response', {
      hasRaw: !!raw,
      hasData: !!raw?.data,
      hasPoints: !!raw?.data?.points,
      hasPointsDirect: !!raw?.points,
      rawKeys: raw ? Object.keys(raw) : [],
      dataKeys: raw?.data ? Object.keys(raw.data) : [],
    });
  }

  if (points.length === 0) return [];

  // Convert to ChartPoint[], filtering invalid entries
  const chartPoints: ChartPoint[] = [];
  
  for (const p of points) {
    if (!p || typeof p !== 'object') continue;

    // Extract timestamp - try multiple field names (API uses 't' for ISO string)
    const timeValue = p.t ?? p.time ?? p.date ?? p.timestamp ?? p.ts ?? p.datetime;
    if (timeValue === null || timeValue === undefined) continue;

    // Extract value - try multiple field names (API uses 'close' for price)
    const valueValue =
      p.v ??
      p.value ??
      p.close ??
      p.price ??
      p.adjClose ??
      p.adj_close ??
      p.c ??
      p.last;
    if (valueValue === null || valueValue === undefined) continue;

    // Convert timestamp to ms epoch
    let timeMs: number;
    if (typeof timeValue === 'number') {
      // If already a number, assume it's in seconds if < 1e10, otherwise milliseconds
      timeMs = timeValue > 1e10 ? timeValue : timeValue * 1000;
    } else if (typeof timeValue === 'string') {
      // Parse string date (ISO format like "2024-01-01T00:00:00.000Z")
      const date = new Date(timeValue);
      if (Number.isNaN(date.getTime())) {
        // Dev-only: log unparseable dates
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[normalizeChartSeries] Failed to parse timestamp', { timeValue, point: p });
        }
        continue;
      }
      timeMs = date.getTime();
    } else {
      continue;
    }

    // Convert value to number
    let valueNum: number;
    if (typeof valueValue === 'number') {
      valueNum = valueValue;
    } else if (typeof valueValue === 'string') {
      // Remove commas and parse
      const parsed = Number(valueValue.replace(/,/g, ''));
      if (!Number.isFinite(parsed)) {
        // Dev-only: log unparseable values
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[normalizeChartSeries] Failed to parse value', { valueValue, point: p });
        }
        continue;
      }
      valueNum = parsed;
    } else {
      continue;
    }

    // Only include valid points
    if (!Number.isFinite(timeMs) || !Number.isFinite(valueNum)) continue;

    chartPoints.push({ time: timeMs, value: valueNum });
  }

  // Sort by time and de-duplicate (keep last for same timestamp)
  chartPoints.sort((a, b) => a.time - b.time);
  
  // De-duplicate timestamps (Recharts hates duplicate x's)
  const deduped: ChartPoint[] = [];
  for (const p of chartPoints) {
    if (deduped.length === 0 || deduped[deduped.length - 1].time !== p.time) {
      deduped.push(p);
    } else {
      // Same timestamp - last wins
      deduped[deduped.length - 1] = p;
    }
  }

  // Dev-only logging to confirm data flow
  if (process.env.NODE_ENV !== 'production' && deduped.length > 0) {
    console.log(`[normalizeChartSeries] ✅ Normalized ${points.length} raw points → ${deduped.length} valid ChartPoints`, {
      firstPoint: deduped[0],
      lastPoint: deduped[deduped.length - 1],
    });
  }

  return deduped;
}
