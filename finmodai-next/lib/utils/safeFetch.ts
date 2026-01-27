/**
 * Safe fetch utilities with timeouts and error handling
 */

export type FetchResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  elapsedMs: number;
  timedOut: boolean;
};

/**
 * Fetch with timeout
 */
export async function fetchWithTimeout<T = any>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<FetchResult<T>> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        elapsedMs,
        timedOut: false,
      };
    }

    const data = await response.json();
    return {
      ok: true,
      data,
      elapsedMs,
      timedOut: false,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startTime;
    const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout');

    return {
      ok: false,
      error: isTimeout ? 'Request timeout' : error.message || 'Unknown error',
      elapsedMs,
      timedOut: isTimeout,
    };
  }
}

/**
 * Safe access to nested object properties
 */
export function safeGet<T>(obj: any, path: string, defaultValue: T): T {
  if (!obj) return defaultValue;
  
  const keys = path.split('.');
  let current: any = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }
    current = current[key];
  }
  
  return current !== null && current !== undefined ? current : defaultValue;
}

/**
 * Safe array access
 */
export function safeArray<T>(arr: any, defaultValue: T[] = []): T[] {
  return Array.isArray(arr) ? arr : defaultValue;
}

/**
 * Safe number access
 */
export function safeNumber(value: any, defaultValue: number | null = null): number | null {
  if (value === null || value === undefined) return defaultValue;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

/**
 * Safe string access
 */
export function safeString(value: any, defaultValue: string = '—'): string {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

