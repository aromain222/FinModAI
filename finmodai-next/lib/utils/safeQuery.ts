/**
 * Safe query utilities for React Query
 * 
 * Provides error handling and dev-only logging for API failures.
 * Ensures queries never throw unhandled errors.
 */

import { apiUrl } from '@/lib/http/fetchJson';

/**
 * Wraps a query function with error handling and dev-only logging
 * 
 * @param queryFn - Original query function
 * @param queryKey - Query key for logging (optional)
 * @returns Wrapped query function that never throws
 */
export function safeQueryFn<T>(
  queryFn: () => Promise<T>,
  queryKey?: string | readonly unknown[]
): () => Promise<T | null> {
  return async () => {
    try {
      return await queryFn();
    } catch (error) {
      // Log in dev mode only
      if (process.env.NODE_ENV !== 'production') {
        const key = Array.isArray(queryKey) ? queryKey.join('/') : String(queryKey || 'unknown');
        console.warn(`[SafeQuery] API failure for query "${key}":`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      
      // Return null instead of throwing
      return null;
    }
  };
}

/**
 * Wraps multiple query endpoints with fallback logic
 * 
 * @param endpoints - Array of endpoint URLs or fetch functions
 * @param options - Optional fetch options
 * @param debugOptions - Optional debug configuration
 * @returns First successful response, or null if all fail
 */
export async function fetchFirstOkSafe<T>(
  endpoints: (string | (() => Promise<Response>))[],
  options?: RequestInit & { debug?: boolean; tag?: string; queryParams?: Record<string, string | number | undefined> },
  debugOptions?: { debug?: boolean; tag?: string; queryParams?: Record<string, string | number | undefined> }
): Promise<T | null> {
  let lastError: any = null;
  const debug = options?.debug ?? debugOptions?.debug ?? false;
  const baseTag = options?.tag ?? debugOptions?.tag ?? '[SafeQuery]';
  const queryParams = options?.queryParams ?? debugOptions?.queryParams ?? {};

  for (const endpoint of endpoints) {
    try {
      const url = typeof endpoint === 'string' ? endpoint : 'function';
      const fetchOptions: RequestInit = {
        ...options,
        cache: 'no-store' as RequestCache,
      };
      
      // Remove our custom props
      delete (fetchOptions as any).debug;
      delete (fetchOptions as any).tag;
      delete (fetchOptions as any).queryParams;
      
      // Use apiUrl to convert relative URLs to absolute in server context
      const response = typeof endpoint === 'string'
        ? await fetch(apiUrl(endpoint), fetchOptions)
        : await endpoint();

      if (response.ok) {
        const data = await response.json();
        if (debug) {
          console.log(`${baseTag} ✅ Success: ${url}`);
        }
        return data as T;
      } else {
        if (debug) {
          console.warn(`${baseTag} ⚠️  ${response.status}: ${url}`);
        }
      }
    } catch (error) {
      lastError = error;
      if (debug) {
        console.error(`${baseTag} ❌ Error: ${typeof endpoint === 'string' ? endpoint : 'function'}`, error);
      }
      continue;
    }
  }

  // Log in dev mode only
  if (process.env.NODE_ENV !== 'production' && lastError) {
    console.warn(`${baseTag} All endpoints failed:`, {
      endpoints: endpoints.map(e => typeof e === 'string' ? e : 'function'),
      error: lastError instanceof Error ? lastError.message : String(lastError),
      queryParams,
    });
  }

  return null;
}

