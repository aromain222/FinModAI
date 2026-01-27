/**
 * Chart data validation guards
 * 
 * Shared utilities for validating chart series data before rendering.
 * Prevents crashes from undefined/null/invalid data structures.
 */

export interface SeriesPoint {
  t?: string | number; // Timestamp
  v?: number; // Value
  value?: number;
  y?: number;
  close?: number;
  price?: number;
  date?: string | number;
  time?: string | number;
  [key: string]: any;
}

/**
 * Checks if a chart series has enough valid data points to render
 * 
 * @param series - Array of data points (supports multiple shapes)
 * @param minPoints - Minimum number of valid points required (default: 2)
 * @returns true if series has enough valid points, false otherwise
 * 
 * Supports common data shapes:
 * - { value: number } - Simple value object
 * - { y: number } - Y-axis value
 * - { close: number } - Price close
 * - { price: number } - Price value
 * - { v: number } - Generic value
 * - [x, y] - Tuple format
 * - Any object with numeric value property
 */
export function chartHasEnoughData(
  series: any[] | undefined | null,
  minPoints: number = 2
): boolean {
  // Return false if series is not an array
  if (!Array.isArray(series)) {
    return false;
  }

  // Return false if length is less than minimum
  if (series.length < minPoints) {
    return false;
  }

  // Count valid points (points with non-null, non-undefined y/value)
  let validCount = 0;

  for (const point of series) {
    if (point === null || point === undefined) {
      continue;
    }

    // Handle tuple format [x, y]
    if (Array.isArray(point)) {
      if (point.length >= 2) {
        const y = point[1];
        if (typeof y === 'number' && Number.isFinite(y)) {
          validCount++;
        }
      }
      continue;
    }

    // Handle object formats
    if (typeof point === 'object') {
      // Try common value field names
      const value =
        point.value ?? point.y ?? point.close ?? point.price ?? point.v ?? point.adjClose;

      if (value !== null && value !== undefined) {
        const numValue = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(numValue)) {
          validCount++;
        }
      }
    }
  }

  return validCount >= minPoints;
}

/**
 * Validates time series data (has both timestamp and value)
 * 
 * @param series - Array of time series points
 * @param xField - Field name for timestamp (default: 't')
 * @param yField - Field name for value (default: 'v')
 * @param minPoints - Minimum number of valid points required (default: 2)
 * @returns true if series has enough valid time series points, false otherwise
 */
export function validateTimeSeriesData(
  series: any[] | undefined | null,
  xField: string = 't',
  yField: string = 'v',
  minPoints: number = 2
): boolean {
  if (!Array.isArray(series)) {
    return false;
  }

  if (series.length < minPoints) {
    return false;
  }

  let validCount = 0;

  for (const point of series) {
    if (!point || typeof point !== 'object') {
      continue;
    }

    // Validate timestamp exists
    const timestamp = point[xField] ?? point.date ?? point.time;
    if (!timestamp || (typeof timestamp !== 'string' && typeof timestamp !== 'number')) {
      continue;
    }

    // Validate value is finite number
    const value = point[yField] ?? point.value ?? point.y ?? point.close ?? point.price;
    if (value === null || value === undefined) {
      continue;
    }

    const numValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numValue)) {
      continue;
    }

    validCount++;
  }

  return validCount >= minPoints;
}

/**
 * Normalizes and validates chart data from API responses
 * 
 * @param rawData - Raw API response data
 * @param xField - Field name for timestamp (default: 't')
 * @param yField - Field name for value (default: 'v')
 * @returns Normalized array of valid data points, or empty array if invalid
 */
export function normalizeChartData(
  rawData: any,
  xField: string = 't',
  yField: string = 'v'
): Array<{ [key: string]: string | number }> {
  // Extract series from various API response shapes
  let series: any[] = [];
  
  if (Array.isArray(rawData)) {
    series = rawData;
  } else if (rawData?.series && Array.isArray(rawData.series)) {
    series = rawData.series;
  } else if (rawData?.data?.series && Array.isArray(rawData.data.series)) {
    series = rawData.data.series;
  } else if (rawData?.data && Array.isArray(rawData.data)) {
    series = rawData.data;
  } else if (rawData?.points && Array.isArray(rawData.points)) {
    series = rawData.points;
  }

  // Validate and normalize
  const validData: Array<{ [key: string]: string | number }> = [];

  for (const point of series) {
    if (!point || typeof point !== 'object') {
      continue;
    }

    // Extract timestamp
    const timestamp = point[xField] ?? point.date ?? point.time ?? point.timestamp;
    if (!timestamp || (typeof timestamp !== 'string' && typeof timestamp !== 'number')) {
      continue;
    }

    // Extract value
    const value = point[yField] ?? point.value ?? point.y ?? point.close ?? point.price ?? point.level;
    if (value === null || value === undefined) {
      continue;
    }

    const numValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numValue)) {
      continue;
    }

    validData.push({
      [xField]: String(timestamp),
      [yField]: numValue,
    });
  }

  return validData;
}

/**
 * Safely extracts numeric array from API response
 * 
 * @param data - API response data
 * @param fieldPath - Path to array field (e.g., 'items', 'data.items', 'headlines')
 * @returns Array of items, or empty array if invalid
 */
export function safeExtractArray(data: any, fieldPath: string = 'items'): any[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const parts = fieldPath.split('.');
  let value: any = data;

  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return [];
    }
    value = value[part];
  }

  return Array.isArray(value) ? value : [];
}

