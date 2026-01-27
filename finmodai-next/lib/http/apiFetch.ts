/**
 * Safe API fetch helper for both client and server contexts
 * 
 * Handles relative URLs correctly:
 * - Client: uses relative URLs (browser handles them)
 * - Server: uses absolute URLs via NEXT_PUBLIC_APP_URL or localhost:3000
 * 
 * Preserves query parameters and all fetch options.
 */

/**
 * Get the base URL for API calls
 * - Client: returns "" (relative URLs work in browser)
 * - Server: uses NEXT_PUBLIC_APP_URL, VERCEL_URL, or defaults to http://localhost:3000
 */
function getBaseUrl(): string {
  // Client context - relative URLs work in browser
  if (typeof window !== 'undefined') {
    return '';
  }

  // Server context - need absolute URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const base = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ''); // Remove trailing slash
    return base;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Default fallback for local development
  return 'http://localhost:3000';
}

/**
 * Convert a path to an absolute URL if needed
 * Preserves query parameters and hash
 * 
 * @param path - API path (e.g., "/api/market/chart?symbol=SPY" or full URL)
 * @returns Absolute URL on server, relative URL on client
 */
function toAbsoluteUrl(path: string): string {
  // If already absolute, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Client: return relative URL (browser handles it)
  if (typeof window !== 'undefined') {
    return path;
  }

  // Server: prepend base URL
  const base = getBaseUrl();
  
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Construct absolute URL
  try {
    // Use URL constructor to properly handle query params and hash
    const url = new URL(normalizedPath, base);
    return url.toString();
  } catch (error) {
    // Fallback: simple concatenation if URL constructor fails
    console.warn('[apiFetch] Failed to construct URL with URL constructor, using fallback:', error);
    return base + normalizedPath;
  }
}

/**
 * Safe API fetch that works in both client and server contexts
 * 
 * @param path - API path (e.g., "/api/market/chart?symbol=SPY")
 * @param init - Optional fetch init options
 * @returns Promise<Response>
 * 
 * @example
 * // Client or Server:
 * const response = await apiFetch('/api/market/chart?symbol=SPY');
 * const data = await response.json();
 * 
 * @example
 * // With options:
 * const response = await apiFetch('/api/market/chart', {
 *   method: 'POST',
 *   body: JSON.stringify({ symbol: 'SPY' }),
 *   headers: { 'Content-Type': 'application/json' }
 * });
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = toAbsoluteUrl(path);
  
  // Default cache policy for API routes
  const defaultInit: RequestInit = {
    cache: 'no-store',
    ...init,
  };
  
  try {
    return await fetch(url, defaultInit);
  } catch (error) {
    // Provide more context in error message
    if (error instanceof TypeError && error.message.includes('Failed to parse URL')) {
      throw new Error(
        `[apiFetch] Failed to parse URL: ${path} -> ${url}. ` +
        `Context: ${typeof window !== 'undefined' ? 'client' : 'server'}, ` +
        `Base: ${getBaseUrl() || 'none'}`
      );
    }
    throw error;
  }
}

/**
 * Fetch JSON from an internal API endpoint (convenience wrapper)
 * 
 * @param path - API path (e.g., "/api/market/chart?symbol=SPY")
 * @param init - Optional fetch init options
 * @returns Parsed JSON response
 * @throws Error with status code and response text if request fails
 * 
 * @example
 * const data = await apiFetchJson<ChartData>('/api/market/chart?symbol=SPY');
 */
export async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    const errorMessage = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
    throw new Error(errorMessage);
  }
  
  return await response.json();
}

