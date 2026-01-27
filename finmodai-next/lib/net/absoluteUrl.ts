/**
 * Canonical helper for building absolute URLs from relative paths
 * 
 * Works in both server and client contexts:
 * - Route handlers: use requestUrl from NextRequest
 * - Server Components: use headers() to get host/protocol
 * - Client Components: returns relative URLs (browser handles them)
 */

/**
 * Build an absolute URL from a relative path
 * 
 * @param path - Relative path (e.g., "/api/market/chart")
 * @param requestUrl - Optional request URL (from NextRequest.url or headers())
 * @returns Absolute URL
 * 
 * @example
 * // In route handler:
 * absoluteUrl('/api/market/chart', req.url)
 * 
 * // In server component:
 * const headersList = headers();
 * const host = headersList.get('host');
 * const protocol = headersList.get('x-forwarded-proto') || 'http';
 * absoluteUrl('/api/market/chart', `${protocol}://${host}`)
 */
export function absoluteUrl(path: string, requestUrl?: string): string {
  // If path is already absolute, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Client-side: return relative URL (browser handles it)
  if (typeof window !== 'undefined') {
    return path;
  }

  // Server-side: need absolute URL
  if (requestUrl) {
    try {
      // If requestUrl is a full URL, use it as base
      if (requestUrl.startsWith('http://') || requestUrl.startsWith('https://')) {
        return new URL(path, requestUrl).toString();
      }
      // If requestUrl is just host, construct full URL
      const protocol = requestUrl.includes('localhost') || requestUrl.includes('127.0.0.1') ? 'http' : 'https';
      const baseUrl = `${protocol}://${requestUrl}`;
      const url = new URL(path, baseUrl);
      return url.toString();
    } catch (error) {
      // Fall through to env-based construction
    }
  }

  // Fallback: use environment variables
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const base = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    try {
      return new URL(path, base).toString();
    } catch (error) {
      console.warn('[absoluteUrl] Failed to construct URL from NEXT_PUBLIC_APP_URL:', error);
    }
  }

  if (process.env.VERCEL_URL) {
    try {
      return new URL(path, `https://${process.env.VERCEL_URL}`).toString();
    } catch (error) {
      console.warn('[absoluteUrl] Failed to construct URL from VERCEL_URL:', error);
    }
  }

  // Default for local development
  try {
    return new URL(path, 'http://localhost:3000').toString();
  } catch (error) {
    // Last resort: if even this fails, return the path as-is and let fetch handle it
    console.error('[absoluteUrl] Failed to construct URL, returning path as-is:', error);
    return path;
  }
}

