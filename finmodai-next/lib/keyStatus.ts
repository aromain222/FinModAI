import logger from './logger';

const keysToCheck: { env: string; label: string; required?: boolean }[] = [
  { env: 'OPENAI_API_KEY', label: 'OpenAI', required: true },
  { env: 'OPENAI_SERVICE_API_KEY', label: 'OpenAI (service)' },
  { env: 'FMP_API_KEY', label: 'FMP', required: true },
  { env: 'POLYGON_API_KEY', label: 'Polygon' },
  { env: 'ALPHAVANTAGE_API_KEY', label: 'AlphaVantage' },
  { env: 'ALPHA_VANTAGE_API_KEY', label: 'AlphaVantage (alias)' },
  { env: 'FINNHUB_API_KEY', label: 'Finnhub' },
  { env: 'FRED_API_KEY', label: 'FRED' },
  { env: 'NEWS_API_KEY', label: 'NewsAPI' },
  { env: 'SUPABASE_URL', label: 'Supabase URL', required: true },
  { env: 'SUPABASE_ANON_KEY', label: 'Supabase Anon', required: true },
  { env: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL (public)' },
  { env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase Anon (public)' },
  { env: 'NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID', label: 'Google Drive Client ID (public)' },
  { env: 'REDIS_URL', label: 'Redis (BullMQ)' },
  { env: 'SENTRY_DSN', label: 'Sentry DSN' },
];

export function logKeyStatus(): void {
  const present: string[] = [];
  const missing: string[] = [];

  keysToCheck.forEach(({ env, label, required }) => {
    const value = process.env[env];
    const isSet = Boolean(value && value.trim().length > 0);
    if (isSet) {
      present.push(label);
    } else if (required) {
      missing.push(label);
    }
  });

  logger.info(`[keys] Present: ${present.join(', ') || 'none'}`);
  if (missing.length > 0) {
    logger.warn(`[keys] Missing required: ${missing.join(', ')}`);
  }
}
