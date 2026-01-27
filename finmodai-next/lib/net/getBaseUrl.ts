/**
 * Server-only helper to get base URL for API calls
 * Uses headers() to derive host + protocol, falls back to localhost in dev
 */

import { headers } from 'next/headers';

export function getBaseUrl(): string {
  // In browser, this should never be called (client-side fetches use relative URLs)
  if (typeof window !== 'undefined') {
    return '';
  }

  try {
    const headersList = headers();
    const host = headersList.get('host');
    const protocol = headersList.get('x-forwarded-proto') || 'http';
    
    if (host) {
      // Use the host from headers (works in both dev and prod)
      return `${protocol}://${host}`;
    }
  } catch (error) {
    // headers() might fail in some contexts (e.g., during build)
    console.warn('[getBaseUrl] Failed to get headers, falling back to env/localhost');
  }

  // Fallback: use env var if available
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  // Last resort: localhost in dev
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }

  // Production fallback (shouldn't happen if deployed correctly)
  return 'http://localhost:3000';
}

