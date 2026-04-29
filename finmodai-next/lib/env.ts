/**
 * Runtime environment validation.
 * Call assertEnv() at the top of any API route that needs these keys.
 * Returns a summary of what is present — never returns key values.
 */

type EnvStatus = {
  key: string;
  present: boolean;
  source?: string;
};

const PLACEHOLDER_PATTERNS = [
  /^YOUR_/i,
  /^PASTE_/i,
  /^REPLACE_/i,
  /^INSERT_/i,
  /placeholder/i,
  /^example/i,
];

function isRealValue(value: string | undefined): boolean {
  if (!value || value.trim().length === 0) return false;
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Server-only required keys. Never prefix with NEXT_PUBLIC_. */
const SERVER_REQUIRED = [
  { key: 'SUPABASE_URL', aliases: ['NEXT_PUBLIC_SUPABASE_URL'] },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', aliases: [] },
] as const;

/** LLM keys — system degrades gracefully if missing, but log clearly. */
const LLM_KEYS = [
  { key: 'OPENAI_API_KEY', aliases: ['OPENAI_SERVICE_API_KEY'] },
  { key: 'ANTHROPIC_API_KEY', aliases: ['ANTHROPIC_SERVICE_API_KEY'] },
] as const;

/** News provider keys — multi-source fallback, any one is enough. */
const NEWS_KEYS = [
  { key: 'PERIGON_API_KEY', aliases: [] },
  { key: 'NEWS_API_KEY', aliases: ['NEWSAPI_KEY'] },
  { key: 'BENZINGA_API_KEY', aliases: ['BENZINGA_KEY'] },
  { key: 'EODHD_API_KEY', aliases: ['EODHD_API', 'EOD_HISTORICAL_DATA_API_KEY'] },
  { key: 'FINNHUB_API_KEY', aliases: [] },
] as const;

function resolve(key: string, aliases: readonly string[]): { present: boolean; source?: string } {
  if (isRealValue(process.env[key])) return { present: true, source: key };
  for (const alias of aliases) {
    if (isRealValue(process.env[alias])) return { present: true, source: alias };
  }
  return { present: false };
}

export type EnvReport = {
  supabase: { url: boolean; serviceKey: boolean };
  llm: { openai: boolean; anthropic: boolean; anyLlm: boolean };
  news: { perigon: boolean; newsapi: boolean; benzinga: boolean; eodhd: boolean; finnhub: boolean; polygon: boolean; alphavantage: boolean; anyNews: boolean };
  warnings: string[];
  errors: string[];
};

export function getEnvReport(): EnvReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  const supabaseUrl = resolve('SUPABASE_URL', ['NEXT_PUBLIC_SUPABASE_URL']);
  const supabaseKey = resolve('SUPABASE_SERVICE_ROLE_KEY', []);
  const openai = resolve('OPENAI_API_KEY', ['OPENAI_SERVICE_API_KEY']);
  const anthropic = resolve('ANTHROPIC_API_KEY', ['ANTHROPIC_SERVICE_API_KEY']);
  const perigon = resolve('PERIGON_API_KEY', []);
  const newsapi = resolve('NEWS_API_KEY', ['NEWSAPI_KEY']);
  const benzinga = resolve('BENZINGA_API_KEY', ['BENZINGA_KEY']);
  const eodhd = resolve('EODHD_API_KEY', ['EODHD_API', 'EOD_HISTORICAL_DATA_API_KEY']);
  const finnhub = resolve('FINNHUB_API_KEY', []);
  const polygon = resolve('POLYGON_API_KEY', []);
  const alphavantage = resolve('ALPHA_VANTAGE_API_KEY', ['ALPHAVANTAGE_API_KEY', 'ALPHA_VANTAGE']);

  if (!supabaseUrl.present) errors.push('SUPABASE_URL missing — Supabase client will be null');
  if (!supabaseKey.present) errors.push('SUPABASE_SERVICE_ROLE_KEY missing — DB read/write disabled');
  if (!openai.present && !anthropic.present) warnings.push('No LLM key found — falling back to rule-based classification');
  if (!perigon.present && !newsapi.present && !benzinga.present && !eodhd.present && !finnhub.present && !polygon.present && !alphavantage.present) {
    errors.push('No news provider keys found — will return demo events only');
  }

  return {
    supabase: { url: supabaseUrl.present, serviceKey: supabaseKey.present },
    llm: { openai: openai.present, anthropic: anthropic.present, anyLlm: openai.present || anthropic.present },
    news: {
      perigon: perigon.present,
      newsapi: newsapi.present,
      benzinga: benzinga.present,
      eodhd: eodhd.present,
      finnhub: finnhub.present,
      polygon: polygon.present,
      alphavantage: alphavantage.present,
      anyNews: perigon.present || newsapi.present || benzinga.present || eodhd.present || finnhub.present || polygon.present || alphavantage.present,
    },
    warnings,
    errors,
  };
}

/**
 * Logs env status at route startup without exposing key values.
 * Call once per route module (outside the handler) or inside handler on cold start.
 */
export function assertEnv(context = 'route'): EnvReport {
  const report = getEnvReport();

  for (const error of report.errors) {
    console.error(`[env:${context}] ERROR: ${error}`);
  }
  for (const warning of report.warnings) {
    console.warn(`[env:${context}] WARN: ${warning}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[env:${context}] status`, {
      supabase: report.supabase,
      llm: report.llm,
      news: report.news,
    });
  }

  return report;
}
