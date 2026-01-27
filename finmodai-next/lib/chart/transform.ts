/**
 * Chart data transformation utilities
 * Converts API output into canonical time series format
 */

export interface TimeSeriesPoint {
  t: number; // timestamp in milliseconds (epoch ms)
  value: number;
}

/**
 * Convert raw API data to canonical time series format { t: number, value: number }[]
 * Handles various API response shapes:
 * - { data: { points: [...] } }
 * - { data: [...] }
 * - { series: [...] }
 * - Direct array
 * 
 * Points can have various field names:
 * - Timestamp: t, date, time, timestamp
 * - Value: v, value, close, price, level, adjClose
 */
export function toTimeSeries(raw: any): TimeSeriesPoint[] {
  if (!raw) return [];

  // Extract array from various response shapes
  let arr: any[] = [];
  
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (raw?.data?.points && Array.isArray(raw.data.points)) {
    arr = raw.data.points;
  } else if (raw?.data && Array.isArray(raw.data)) {
    arr = raw.data;
  } else if (raw?.series && Array.isArray(raw.series)) {
    arr = raw.series;
  } else if (raw?.points && Array.isArray(raw.points)) {
    arr = raw.points;
  } else {
    return [];
  }

  // Transform to canonical format
  return arr
    .map((p: any) => {
      if (!p || typeof p !== 'object') return null;

      // Extract timestamp
      const t = p.t ?? p.date ?? p.time ?? p.timestamp;
      if (!t && t !== 0) return null;

      // Extract value
      const v = p.v ?? p.value ?? p.close ?? p.price ?? p.level ?? p.adjClose;
      if (v === null || v === undefined) return null;

      // Convert timestamp to ms epoch
      let timeMs: number;
      if (typeof t === 'number') {
        // If already a number, assume it's in seconds if < 1e10, otherwise milliseconds
        timeMs = t > 1e10 ? t : t * 1000;
      } else {
        // Parse string date
        const date = new Date(t);
        if (Number.isNaN(date.getTime())) return null;
        timeMs = date.getTime();
      }

      // Convert value to number
      const numValue = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(numValue) || !Number.isFinite(timeMs)) return null;

      return {
        t: timeMs,
        value: numValue,
      };
    })
    .filter((p): p is TimeSeriesPoint => p !== null)
    .sort((a, b) => a.t - b.t); // Sort by time
}

/**
 * Format timestamp for x-axis tick labels based on range
 * - 1D: HH:mm
 * - <=3M: MMM d
 * - YTD/1Y: MMM
 */
export function formatTickDate(t: number, range: '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y'): string {
  try {
    const date = new Date(t);
    if (Number.isNaN(date.getTime())) return '';
    
    // Use Intl.DateTimeFormat for better performance than date-fns
    if (range === '1D') {
      return new Intl.DateTimeFormat('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }).format(date);
    }
    if (range === 'YTD' || range === '1Y') {
      return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
    }
    // 1W, 1M, 3M
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }).format(date);
  } catch {
    return String(t);
  }
}

/**
 * Safely convert a value to a number with fallback
 * @param x - Value to convert
 * @param fallback - Default value if conversion fails (default: 0)
 * @returns Number value or fallback
 */
export function safeNumber(x: any, fallback: number = 0): number {
  if (typeof x === 'number' && Number.isFinite(x)) {
    return x;
  }
  if (typeof x === 'string') {
    const parsed = Number(x);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}
