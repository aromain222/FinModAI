/**
 * Server-only environment variables
 * 
 * ⚠️ DO NOT IMPORT THIS FILE IN CLIENT COMPONENTS
 * This file includes 'server-only' which will cause build errors if imported in client code.
 * 
 * Use `lib/env/public.ts` for client components, or pass values via props from server components.
 */

import 'server-only';

// Runtime guard: throw if somehow imported in client
if (typeof window !== 'undefined') {
  throw new Error(
    'lib/env/server.ts cannot be imported in client code. Use lib/env/public.ts or pass values via props.'
  );
}

export const getEnvOrNull = (name: string) => {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const resolveKey = (names: string[]) => {
  for (const name of names) {
    const value = getEnvOrNull(name);
    if (value) return value;
  }
  return null;
};

export const ENV = {
  FRED_API_KEY: resolveKey(['FRED_API_KEY']),
  FINNHUB_API_KEY: resolveKey(['FINNHUB_API_KEY']),
  POLYGON_API_KEY: resolveKey(['POLYGON_API_KEY']),
  FMP_API_KEY: resolveKey(['FMP_API_KEY', 'NEXT_PUBLIC_FMP_API_KEY']),
  DATABENTO_API_KEY: resolveKey(['DATABENTO_API_KEY', 'NEXT_PUBLIC_DATABENTO_API_KEY']),
  DATABENTO_BASE_URL: resolveKey(['DATABENTO_BASE_URL']),
  DATABENTO_NEWS_DATASET: resolveKey(['DATABENTO_NEWS_DATASET']),
  DATABENTO_EQUITIES_DATASET: resolveKey(['DATABENTO_EQUITIES_DATASET']),
  WEBZ_API_KEY: resolveKey(['WEBZIO_API_KEY', 'WEBZ_API_KEY']),
  MARKETSTACK_API_KEY: resolveKey(['MARKETSTACK_API_KEY', 'NEXT_PUBLIC_MARKETSTACK_API_KEY']),
  MARKETSTACK_BASE_URL: resolveKey(['MARKETSTACK_BASE_URL']),
  OPENAI_API_KEY: resolveKey(['OPENAI_API_KEY']),
  OPENAI_MODEL: resolveKey(['OPENAI_MODEL']) || 'gpt-4o-mini',
  SUPABASE_URL: resolveKey(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']),
  SUPABASE_SERVICE_ROLE_KEY: resolveKey(['SUPABASE_SERVICE_ROLE_KEY']),
} as const;

export const keysPresent = {
  fred: Boolean(ENV.FRED_API_KEY),
  finnhub: Boolean(ENV.FINNHUB_API_KEY),
  polygon: Boolean(ENV.POLYGON_API_KEY),
  fmp: Boolean(ENV.FMP_API_KEY),
  databento: Boolean(ENV.DATABENTO_API_KEY),
  databentoNews: Boolean(ENV.DATABENTO_API_KEY && ENV.DATABENTO_NEWS_DATASET),
  marketstack: Boolean(ENV.MARKETSTACK_API_KEY),
  webz: Boolean(ENV.WEBZ_API_KEY),
  openai: Boolean(ENV.OPENAI_API_KEY),
  supabase: Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY),
} as const;

export function hasKey(name: keyof typeof keysPresent) {
  return Boolean(keysPresent[name]);
}

export const requireEnv = (name: keyof typeof ENV | string) => {
  const value = typeof name === 'string' ? getEnvOrNull(name) : ENV[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${String(name)}`);
  }
  return value;
};

// Optional alias for convenience
export const env = ENV;

