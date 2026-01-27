/**
 * Debug fetch wrapper for observability
 * 
 * Logs every fetch with:
 * - URL
 * - Status code
 * - Elapsed time (ms)
 * - First 500 chars of response JSON
 * - Query params used
 */

export interface DebugFetchOptions {
  debug?: boolean;
  tag?: string;
  queryParams?: Record<string, string | number | undefined>;
}

/**
 * Debug-aware fetch wrapper
 */
export async function debugFetch(
  url: string | URL,
  init?: RequestInit & { debug?: boolean; tag?: string; queryParams?: Record<string, string | number | undefined> },
  options?: DebugFetchOptions
): Promise<Response> {
  const debug = init?.debug ?? options?.debug ?? false;
  const tag = init?.tag ?? options?.tag ?? 'FETCH';
  const queryParams = init?.queryParams ?? options?.queryParams ?? {};
  
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  
  // Ensure no caching - always use no-store in debug mode
  const fetchOptions: RequestInit = {
    ...init,
    cache: 'no-store' as RequestCache,
  };
  
  // Remove our custom props from fetch options
  delete (fetchOptions as any).debug;
  delete (fetchOptions as any).tag;
  delete (fetchOptions as any).queryParams;
  
  try {
    const response = await fetch(url, fetchOptions);
    const elapsedMs = typeof performance !== 'undefined' ? performance.now() - startTime : Date.now() - startTime;
    
    if (debug) {
      // Clone response to read body without consuming it
      const clonedResponse = response.clone();
      
      try {
        const json = await clonedResponse.json();
        const jsonStr = JSON.stringify(json);
        const preview = jsonStr.length > 500 ? jsonStr.substring(0, 500) + '...' : jsonStr;
        
        console.log(`[${tag}] ✅ ${response.status} ${response.statusText} | ${elapsedMs.toFixed(0)}ms | ${url}`, {
          status: response.status,
          statusText: response.statusText,
          elapsedMs: Math.round(elapsedMs),
          url: String(url),
          queryParams,
          preview,
        });
        
        if (!response.ok) {
          console.error(`[${tag}] ❌ Failed: ${response.status} ${response.statusText}`, {
            url: String(url),
            queryParams,
            error: json.error || json.message || 'Unknown error',
            details: json.details || json,
          });
        }
      } catch (parseError) {
        // If JSON parsing fails, try text
        try {
          const text = await clonedResponse.text();
          const preview = text.length > 500 ? text.substring(0, 500) + '...' : text;
          
          console.log(`[${tag}] ⚠️  ${response.status} ${response.statusText} | ${elapsedMs.toFixed(0)}ms | ${url} (non-JSON)`, {
            status: response.status,
            statusText: response.statusText,
            elapsedMs: Math.round(elapsedMs),
            url: String(url),
            queryParams,
            preview,
          });
          
          if (!response.ok) {
            console.error(`[${tag}] ❌ Failed: ${response.status} ${response.statusText}`, {
              url: String(url),
              queryParams,
              error: text.substring(0, 200),
            });
          }
        } catch (textError) {
          console.error(`[${tag}] ❌ Parse error | ${response.status} | ${url}`, {
            status: response.status,
            url: String(url),
            queryParams,
            parseError: textError instanceof Error ? textError.message : String(textError),
          });
        }
      }
    }
    
    return response;
  } catch (error) {
    const elapsedMs = typeof performance !== 'undefined' ? performance.now() - startTime : Date.now() - startTime;
    
    if (debug) {
      console.error(`[${tag}] 💥 Network error | ${elapsedMs.toFixed(0)}ms | ${url}`, {
        url: String(url),
        queryParams,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    
    throw error;
  }
}

