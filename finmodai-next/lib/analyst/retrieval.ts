const COMMON_COMPANY_TICKERS: Array<{ pattern: RegExp; ticker: string }> = [
  { pattern: /\bsofi\b/i, ticker: 'SOFI' },
  { pattern: /\balphabet'?s?\b|\bgoogle'?s?\b|\bgoogl\b|\bgoog\b/i, ticker: 'GOOGL' },
  { pattern: /\bapple'?s?\b/i, ticker: 'AAPL' },
  { pattern: /\bmicrosoft'?s?\b/i, ticker: 'MSFT' },
  { pattern: /\bnvidia'?s?\b/i, ticker: 'NVDA' },
  { pattern: /\bamazon'?s?\b/i, ticker: 'AMZN' },
  { pattern: /\bmeta'?s?\b|\bfacebook'?s?\b/i, ticker: 'META' },
  { pattern: /\btesla'?s?\b/i, ticker: 'TSLA' },
];

const NON_COMPANY_UPPERCASE_TOKENS = new Set([
  'AI',
  'CEO',
  'CFO',
  'COO',
  'CPI',
  'DCF',
  'DOJ',
  'EPS',
  'EV',
  'FDA',
  'FOMC',
  'FTC',
  'GDP',
  'IPO',
  'IRR',
  'IRS',
  'LBO',
  'MOIC',
  'OPEC',
  'PCE',
  'SEC',
]);

type FmpQuoteRow = {
  price?: number;
  marketCap?: number;
  name?: string;
  symbol?: string;
};

type FmpIncomeRow = {
  date?: string;
  period?: string;
  revenue?: number;
  ebitda?: number;
  netIncome?: number;
};

type RetrievalResult = {
  context: string;
  sourceLines: string[];
  warnings: string[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function fmtUsdMillions(value: number | null): string {
  if (value === null) return 'n/a';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
}

function fmtUsd(value: number | null): string {
  if (value === null) return 'n/a';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function redactApiKeyInUrl(url: string): string {
  return url.replace(/([?&]apikey=)[^&]+/i, '$1***');
}

async function fetchJson(url: string, timeoutMs = 4500): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'CapitalBase Analyst Retrieval/1.0',
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function inferTickerFromPrompt(prompt: string): string | undefined {
  if (!prompt) return undefined;

  for (const item of COMMON_COMPANY_TICKERS) {
    if (item.pattern.test(prompt)) return item.ticker;
  }

  const upperMatches = prompt.match(/\b[A-Z]{1,5}\b/g) ?? [];
  const tickerLike = upperMatches.find(
    (symbol) =>
      symbol.length >= 1 &&
      symbol.length <= 5 &&
      !NON_COMPANY_UPPERCASE_TOKENS.has(symbol.toUpperCase()),
  );
  if (tickerLike) return tickerLike;
  return undefined;
}

export async function gatherAnalystRetrievalContext(params: {
  ticker?: string;
  userMessage: string;
}): Promise<RetrievalResult> {
  const ticker = params.ticker?.trim().toUpperCase();
  if (!ticker) {
    return { context: '', sourceLines: [], warnings: ['No ticker supplied for structured retrieval'] };
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return { context: '', sourceLines: [], warnings: ['FMP_API_KEY not configured'] };
  }

  const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`;
  const incomeQuarterUrl = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?period=quarter&limit=2&apikey=${apiKey}`;
  const incomeAnnualUrl = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`;

  const [quoteJson, quarterJson, annualJson] = await Promise.all([
    fetchJson(quoteUrl),
    fetchJson(incomeQuarterUrl),
    fetchJson(incomeAnnualUrl),
  ]);

  const quoteRow = Array.isArray(quoteJson) ? (quoteJson[0] as FmpQuoteRow | undefined) : undefined;
  const quarterRow = Array.isArray(quarterJson) ? (quarterJson[0] as FmpIncomeRow | undefined) : undefined;
  const annualRow = Array.isArray(annualJson) ? (annualJson[0] as FmpIncomeRow | undefined) : undefined;

  const price = toNumber(quoteRow?.price);
  const marketCap = toNumber(quoteRow?.marketCap);

  const qRevenue = toNumber(quarterRow?.revenue);
  const qEbitda = toNumber(quarterRow?.ebitda);
  const qNetIncome = toNumber(quarterRow?.netIncome);
  const qDate = quarterRow?.date ?? null;

  const aRevenue = toNumber(annualRow?.revenue);
  const aEbitda = toNumber(annualRow?.ebitda);
  const aNetIncome = toNumber(annualRow?.netIncome);
  const aDate = annualRow?.date ?? null;

  const hasAny =
    price !== null ||
    marketCap !== null ||
    qRevenue !== null ||
    qEbitda !== null ||
    qNetIncome !== null ||
    aRevenue !== null ||
    aEbitda !== null ||
    aNetIncome !== null;
  if (!hasAny) {
    return {
      context: '',
      sourceLines: [],
      warnings: ['FMP retrieval returned no usable fields'],
    };
  }

  const resolvedTicker = quoteRow?.symbol?.trim().toUpperCase() || ticker;
  const companyName = quoteRow?.name?.trim() || resolvedTicker;

  const lines: string[] = [
    `Structured retrieval for ${companyName} (${resolvedTicker}) from FinancialModelingPrep API.`,
    `Current price: ${fmtUsd(price)}.`,
    `Market cap: ${fmtUsdMillions(marketCap !== null ? marketCap / 1_000_000 : null)}.`,
  ];

  if (qDate) {
    lines.push(
      `Latest quarter (${qDate}) revenue ${fmtUsdMillions(qRevenue !== null ? qRevenue / 1_000_000 : null)}, EBITDA ${fmtUsdMillions(qEbitda !== null ? qEbitda / 1_000_000 : null)}, net income ${fmtUsdMillions(qNetIncome !== null ? qNetIncome / 1_000_000 : null)}.`
    );
  }
  if (aDate) {
    lines.push(
      `Latest annual period (${aDate}) revenue ${fmtUsdMillions(aRevenue !== null ? aRevenue / 1_000_000 : null)}, EBITDA ${fmtUsdMillions(aEbitda !== null ? aEbitda / 1_000_000 : null)}, net income ${fmtUsdMillions(aNetIncome !== null ? aNetIncome / 1_000_000 : null)}.`
    );
  }

  const sourceLines = dedupe([
    `FMP quote API - ${redactApiKeyInUrl(quoteUrl)}`,
    `FMP income statement (quarterly) - ${redactApiKeyInUrl(incomeQuarterUrl)}`,
    `FMP income statement (annual) - ${redactApiKeyInUrl(incomeAnnualUrl)}`,
  ]);

  return {
    context: lines.join('\n'),
    sourceLines,
    warnings: [],
  };
}
