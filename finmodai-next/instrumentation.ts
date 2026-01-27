/* eslint-disable no-console */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Sentry must be initialized from inside the Next.js instrumentation hook.
  // See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
  Sentry.init({
    dsn: 'https://5e3a01a00bace7934487f7fcf23b592b@o4510551599874048.ingest.us.sentry.io/4510551600136192',
    tracesSampleRate: 1,
    enableLogs: true,
    sendDefaultPii: true,
  });

  if (process.env.NODE_ENV === 'production') return;

  const globalAny = globalThis as typeof globalThis & { __CAPITALBASE_KEYS_LOGGED__?: boolean };
  if (globalAny.__CAPITALBASE_KEYS_LOGGED__) return;
  globalAny.__CAPITALBASE_KEYS_LOGGED__ = true;

  console.log('[STARTUP_KEYS]', {
    FRED_API_KEY: Boolean(process.env.FRED_API_KEY),
    DATABENTO_API_KEY: Boolean(process.env.DATABENTO_API_KEY),
    DATABENTO_NEWS_DATASET: Boolean(process.env.DATABENTO_NEWS_DATASET),
    WEBZ_API_KEY: Boolean(process.env.WEBZ_API_KEY),
    WEBZIO_API_KEY: Boolean(process.env.WEBZIO_API_KEY),
    FINNHUB_API_KEY: Boolean(process.env.FINNHUB_API_KEY),
    POLYGON_API_KEY: Boolean(process.env.POLYGON_API_KEY),
    MARKETSTACK_API_KEY: Boolean(process.env.MARKETSTACK_API_KEY),
    FMP_API_KEY: Boolean(process.env.FMP_API_KEY),
    NEXT_PUBLIC_FMP_API_KEY: Boolean(process.env.NEXT_PUBLIC_FMP_API_KEY),
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
  });
}
