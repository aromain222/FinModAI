/**
 * Shared fetch helper for internal API calls
 * 
 * Handles absolute URLs for server-side fetches and relative URLs for client-side fetches.
 * Prevents "Failed to parse URL from /api/..." errors in Node/server contexts.
 */

import { absoluteUrl } from '@/lib/net/absoluteUrl';

const errorLogCache = new Set<string>();

/**
 * Get the base URL for API calls
 * - Browser: returns "" (relative URLs work)
 * - Server: uses NEXT_PUBLIC_APP_URL, VERCEL_URL, or defaults to localhost:3000
 * @deprecated Use absoluteUrl() instead
 */
export function getBaseUrl(): string {
  // Browser context - relative URLs work
  if (typeof window !== 'undefined') {
    return '';
  }

  // Server context - need absolute URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ''); // Remove trailing slash
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Default fallback for local development
  return 'http://localhost:3000';
}

/**
 * Convert a path to an absolute URL if needed
 * - If path starts with "http", return as-is
 * - Otherwise, prepend base URL
 * @deprecated Use absoluteUrl() instead
 */
export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const base = getBaseUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base + normalizedPath;
}

/**
 * Log an error once per endpoint to avoid console spam
 */
function logErrorOnce(endpoint: string, message: string): void {
  const key = `${endpoint}:${message}`;
  if (!errorLogCache.has(key)) {
    errorLogCache.add(key);
    console.error(`[fetchJson] ${endpoint}: ${message}`);
  }
}

/**
 * Fetch JSON from an internal API endpoint
 * 
 * @param path - API path (e.g., "/api/market-brief" or full URL)
 * @param init - Optional fetch init options
 * @returns Parsed JSON response
 * @throws Error with status code and response text if request fails
 */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  // Use absoluteUrl helper for reliable URL construction
  const url = absoluteUrl(path);
  const endpoint = path.split('?')[0]; // For logging

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      ...init,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const errorMessage = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
      logErrorOnce(endpoint, errorMessage);
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      logErrorOnce(endpoint, error.message);
      throw error;
    }
    const errorMessage = String(error);
    logErrorOnce(endpoint, errorMessage);
    throw new Error(errorMessage);
  }
}

