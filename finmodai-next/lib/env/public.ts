/**
 * Public environment variables (client-safe)
 * 
 * Only exports NEXT_PUBLIC_* environment variables that are safe to use in client components.
 * This file does NOT import 'server-only' and can be safely imported in client code.
 */

/**
 * Get a NEXT_PUBLIC_* environment variable
 */
export const getPublicEnv = (name: string): string | null => {
  if (!name.startsWith('NEXT_PUBLIC_')) {
    console.warn(`[env/public] Attempted to access non-public env var: ${name}`);
    return null;
  }
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

/**
 * Public environment variables (only NEXT_PUBLIC_* vars)
 */
export const PUBLIC_ENV = {
  FMP_API_KEY: getPublicEnv('NEXT_PUBLIC_FMP_API_KEY'),
  DATABENTO_API_KEY: getPublicEnv('NEXT_PUBLIC_DATABENTO_API_KEY'),
  MARKETSTACK_API_KEY: getPublicEnv('NEXT_PUBLIC_MARKETSTACK_API_KEY'),
  SUPABASE_URL: getPublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
} as const;

