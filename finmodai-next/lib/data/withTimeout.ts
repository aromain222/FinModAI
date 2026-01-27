/**
 * Timeout and Partial Data Utilities
 * 
 * Wraps external data calls with timeouts and Promise.allSettled
 * Returns partial data with dataQuality flags instead of failing
 */

export interface DataQualityResult<T> {
  data: T | null;
  quality: 'complete' | 'partial' | 'failed';
  errors: string[];
  warnings: string[];
}

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Execute multiple promises with Promise.allSettled and return partial results
 */
export async function fetchWithPartialResults<T>(
  promises: Array<{ key: string; promise: Promise<T> }>,
  timeoutMs: number = 8000
): Promise<{
  results: Record<string, DataQualityResult<T>>;
  hasFailures: boolean;
  hasPartial: boolean;
}> {
  const results: Record<string, DataQualityResult<T>> = {};
  let hasFailures = false;
  let hasPartial = false;

  const settled = await Promise.allSettled(
    promises.map(({ key, promise }) =>
      withTimeout(promise, timeoutMs, `Timeout fetching ${key}`).catch((error) => {
        return Promise.reject({ key, error });
      })
    )
  );

  for (let i = 0; i < settled.length; i++) {
    const { key } = promises[i];
    const result = settled[i];

    if (result.status === 'fulfilled') {
      results[key] = {
        data: result.value,
        quality: 'complete',
        errors: [],
        warnings: [],
      };
    } else {
      const error = (result.reason as any)?.error || result.reason;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      results[key] = {
        data: null,
        quality: 'failed',
        errors: [errorMessage],
        warnings: [],
      };
      hasFailures = true;
    }
  }

  // Mark as partial if any failed
  if (hasFailures) {
    hasPartial = true;
  }

  return { results, hasFailures, hasPartial };
}

/**
 * Fetch data with timeout and return partial result on failure
 */
export async function fetchWithPartialData<T>(
  key: string,
  promise: Promise<T>,
  timeoutMs: number = 8000,
  fallback?: T
): Promise<DataQualityResult<T>> {
  try {
    const data = await withTimeout(promise, timeoutMs, `Timeout fetching ${key}`);
    return {
      data,
      quality: 'complete',
      errors: [],
      warnings: [],
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      data: fallback ?? null,
      quality: fallback ? 'partial' : 'failed',
      errors: [errorMessage],
      warnings: fallback ? [`Using fallback data for ${key}`] : [],
    };
  }
}
