/**
 * Minimal safe schema for Ant Design Plots configs
 * 
 * Only allows these top-level keys:
 * - data, xField, yField, seriesField, colorField
 * - tooltip, legend, axis, xAxis, yAxis
 * - smooth, height, autoFit, padding
 * - annotations, interactions
 * 
 * All other keys are stripped before passing to plot components.
 */

const ALLOWED_PLOT_KEYS = new Set([
  'data',
  'xField',
  'yField',
  'seriesField',
  'colorField',
  'tooltip',
  'legend',
  'axis',
  'xAxis',
  'yAxis',
  'smooth',
  'height',
  'autoFit',
  'padding',
  'annotations',
  'interactions',
]);

/**
 * Strips all unsafe/unknown keys from plot config, only keeping allowed keys
 */
export function stripPlotUnsafeKeys<T extends Record<string, any>>(obj: T): Partial<T> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (item && typeof item === 'object') {
        return stripPlotUnsafeKeys(item);
      }
      return item;
    }) as any;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Only keep allowed keys
    if (ALLOWED_PLOT_KEYS.has(key)) {
      // Recursively sanitize nested objects (for tooltip, xAxis, yAxis, etc.)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // For nested objects like xAxis, yAxis, tooltip, we allow all keys
        // since they're part of the plot API contract
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        // For arrays (like annotations, data), recursively sanitize items
        sanitized[key] = value.map((item) => {
          if (item && typeof item === 'object') {
            return stripPlotUnsafeKeys(item);
          }
          return item;
        });
      } else {
        // Primitive values
        sanitized[key] = value;
      }
    }
    // Explicitly delete unknown keys (region, benchmark, scale, range, limit, etc.)
  }

  return sanitized as Partial<T>;
}

/**
 * Normalizes data points to standard format: { t: string | number; v: number; series?: string }
 */
export function normalizePlotData(
  data: any[],
  xField: string = 't',
  yField: string = 'v',
  seriesField?: string
): Array<{ t: string | number; v: number; series?: string }> {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((point) => {
      if (!point || typeof point !== 'object') {
        return null;
      }

      // Extract timestamp (t)
      const timestamp = point[xField] ?? point.date ?? point.time ?? point.timestamp;
      if (!timestamp && timestamp !== 0) {
        return null;
      }

      // Extract value (v)
      const value = point[yField] ?? point.value ?? point.y ?? point.close ?? point.price ?? point.v;
      if (value === null || value === undefined) {
        return null;
      }

      const numValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numValue)) {
        return null;
      }

      // Extract series name if provided
      const series = seriesField ? point[seriesField] ?? point.series : undefined;

      return {
        t: timestamp,
        v: numValue,
        ...(series !== undefined && series !== null ? { series: String(series) } : {}),
      };
    })
    .filter((point): point is { t: string | number; v: number; series?: string } => point !== null);
}

