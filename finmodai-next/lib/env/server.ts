/**
 * Server-only env and feature flags.
 * Read from process.env (e.g. .env.local). Use only in server code (API routes, server components).
 */

function env(key: string): string | undefined {
  return process.env[key];
}

export const serverEnv = {
  FMP_API_KEY: env('FMP_API_KEY'),
  OPENFIGI_API_KEY: env('OPENFIGI_API_KEY'),
  POLYGON_API_KEY: env('POLYGON_API_KEY'),
  FINNHUB_API_KEY: env('FINNHUB_API_KEY'),
  ALPHA_VANTAGE_API_KEY: env('ALPHA_VANTAGE_API_KEY'),
  ALPHAVANTAGE_API_KEY: env('ALPHAVANTAGE_API_KEY'),
  TWELVEDATA_API_KEY: env('TWELVEDATA_API_KEY'),
  TWELVE_DATA_API_KEY: env('TWELVE_DATA_API_KEY'),
  MARKETSTACK_API_KEY: env('MARKETSTACK_API_KEY'),
  TIINGO_API_KEY: env('TIINGO_API_KEY'),
  NASDAQ_DATA_LINK_API_KEY: env('NASDAQ_DATA_LINK_API_KEY'),
  SEC_UA_EMAIL: env('SEC_UA_EMAIL'),
  FRED_API_KEY: env('FRED_API_KEY'),
  FASTRACK_API_KEY: env('FASTRACK_API_KEY'),
  FASTTRACK_BASE_URL: env('FASTTRACK_BASE_URL'),
  WEBZ_API_KEY: env('WEBZ_API_KEY'),
  MASSIVE_API_KEY: env('MASSIVE_API_KEY'),
  DATABENTO_API_KEY: env('DATABENTO_API_KEY'),
  SCRAPE_DO_API_KEY: env('SCRAPE_DO_API_KEY'),
} as const;

export function getTwelveDataKey(): string | undefined {
  return serverEnv.TWELVEDATA_API_KEY ?? serverEnv.TWELVE_DATA_API_KEY;
}

export function getAlphaVantageKey(): string | undefined {
  return serverEnv.ALPHA_VANTAGE_API_KEY ?? serverEnv.ALPHAVANTAGE_API_KEY;
}

function flag(key: string): boolean {
  return process.env[key] === 'true' || process.env[key] === '1';
}

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const featureFlags = {
  ENABLE_POLYGON: flag('ENABLE_POLYGON'),
  ENABLE_FINNHUB: flag('ENABLE_FINNHUB'),
  ENABLE_TWELVEDATA: flag('ENABLE_TWELVEDATA'),
  ENABLE_MARKETSTACK: flag('ENABLE_MARKETSTACK'),
  ENABLE_TIINGO: flag('ENABLE_TIINGO'),
  ENABLE_NASDAQ_DATALINK: flag('ENABLE_NASDAQ_DATALINK'),
  ENABLE_SEC: flag('ENABLE_SEC'),
  ENABLE_FRED: flag('ENABLE_FRED'),
  ENABLE_FASTTRACK: flag('ENABLE_FASTTRACK'),
  ENABLE_SCRAPEDO: flag('ENABLE_SCRAPEDO'),
  ENABLE_WEBZ: flag('ENABLE_WEBZ'),
  ENABLE_MASSIVE: flag('ENABLE_MASSIVE'),
  ENABLE_DATABENTO: flag('ENABLE_DATABENTO'),
  ENABLE_EARNINGS_PACKAGE_CACHE: flag('ENABLE_EARNINGS_PACKAGE_CACHE'),
  ENABLE_EARNINGS_PACKAGE_LOGS: flag('ENABLE_EARNINGS_PACKAGE_LOGS'),
  ENABLE_AI_PDF_COMPLETION: flag('ENABLE_AI_PDF_COMPLETION'),
} as const;

export function getEarningsPackageCacheTtlHours(): number {
  return intEnv('EARNINGS_PACKAGE_CACHE_TTL_HOURS', 24);
}
