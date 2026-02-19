import { rateLimitedFetch } from './apiClient';

export type CompsIngestionCompany = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null; // USD millions
  sharePrice: number | null;
  sharesOutstanding: number | null; // raw shares
  cashAndEquivalents: number | null; // USD millions
  totalDebt: number | null; // USD millions
  revenueLTM: number | null; // USD millions
  ebitdaLTM: number | null; // USD millions
  netIncomeLTM: number | null; // USD millions
  metadata: {
    source: string;
    currency: string | null;
    period: string | null;
  };
  warnings: string[];
  fieldSources: Record<string, string>;
};

type PartialCompany = Omit<CompsIngestionCompany, 'metadata' | 'warnings' | 'fieldSources'> & {
  currency?: string | null;
  period?: string | null;
  fieldSources?: Record<string, string>;
  warnings?: string[];
};

const REQUIRED_FIELDS: Array<keyof CompsIngestionCompany> = [
  'marketCap',
  'sharePrice',
  'sharesOutstanding',
  'cashAndEquivalents',
  'totalDebt',
  'revenueLTM',
  'ebitdaLTM',
  'netIncomeLTM',
];

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const toMillions = (value: unknown): number | null => {
  const num = toNumber(value);
  return num === null ? null : num / 1_000_000;
};

const mergeField = <K extends keyof CompsIngestionCompany>(
  target: CompsIngestionCompany,
  fieldSources: Record<string, string>,
  key: K,
  value: CompsIngestionCompany[K],
  source: string
) => {
  if (value === null || value === undefined) return;
  if (target[key] === null || target[key] === undefined) {
    target[key] = value;
    fieldSources[key as string] = source;
  }
};

const mergeStringField = <K extends keyof CompsIngestionCompany>(
  target: CompsIngestionCompany,
  fieldSources: Record<string, string>,
  key: K,
  value: CompsIngestionCompany[K],
  source: string
) => {
  if (value === null || value === undefined) return;
  if (!target[key]) {
    target[key] = value;
    fieldSources[key as string] = source;
  }
};

export async function fetchCompsCompany(ticker: string): Promise<CompsIngestionCompany> {
  const symbol = ticker.toUpperCase().trim();
  const warnings: string[] = [];
  const fieldSources: Record<string, string> = {};

  const base: CompsIngestionCompany = {
    ticker: symbol,
    companyName: null,
    sector: null,
    industry: null,
    marketCap: null,
    sharePrice: null,
    sharesOutstanding: null,
    cashAndEquivalents: null,
    totalDebt: null,
    revenueLTM: null,
    ebitdaLTM: null,
    netIncomeLTM: null,
    metadata: {
      source: '',
      currency: null,
      period: null,
    },
    warnings,
    fieldSources,
  };

  const fmp = await fetchFromFMP(symbol);
  if (fmp) {
    mergeStringField(base, fieldSources, 'companyName', fmp.companyName ?? null, 'FMP');
    mergeStringField(base, fieldSources, 'sector', fmp.sector ?? null, 'FMP');
    mergeStringField(base, fieldSources, 'industry', fmp.industry ?? null, 'FMP');
    mergeField(base, fieldSources, 'marketCap', fmp.marketCap ?? null, 'FMP');
    mergeField(base, fieldSources, 'sharePrice', fmp.sharePrice ?? null, 'FMP');
    mergeField(base, fieldSources, 'sharesOutstanding', fmp.sharesOutstanding ?? null, 'FMP');
    mergeField(base, fieldSources, 'cashAndEquivalents', fmp.cashAndEquivalents ?? null, 'FMP');
    mergeField(base, fieldSources, 'totalDebt', fmp.totalDebt ?? null, 'FMP');
    mergeField(base, fieldSources, 'revenueLTM', fmp.revenueLTM ?? null, 'FMP');
    mergeField(base, fieldSources, 'ebitdaLTM', fmp.ebitdaLTM ?? null, 'FMP');
    mergeField(base, fieldSources, 'netIncomeLTM', fmp.netIncomeLTM ?? null, 'FMP');
    if (fmp.currency) base.metadata.currency = fmp.currency;
    if (fmp.period) base.metadata.period = fmp.period;
    if (fmp.warnings?.length) warnings.push(...fmp.warnings);
  }

  const nasdaq = await fetchFromNasdaqDataLink(symbol);
  if (nasdaq) {
    mergeStringField(base, fieldSources, 'companyName', nasdaq.companyName ?? null, 'NASDAQ_DATA_LINK');
    mergeStringField(base, fieldSources, 'sector', nasdaq.sector ?? null, 'NASDAQ_DATA_LINK');
    mergeStringField(base, fieldSources, 'industry', nasdaq.industry ?? null, 'NASDAQ_DATA_LINK');
    mergeField(base, fieldSources, 'marketCap', nasdaq.marketCap ?? null, 'NASDAQ_DATA_LINK');
    mergeField(base, fieldSources, 'sharePrice', nasdaq.sharePrice ?? null, 'NASDAQ_DATA_LINK');
    mergeField(base, fieldSources, 'sharesOutstanding', nasdaq.sharesOutstanding ?? null, 'NASDAQ_DATA_LINK');
    mergeField(base, fieldSources, 'cashAndEquivalents', nasdaq.cashAndEquivalents ?? null, 'NASDAQ_DATA_LINK');
    mergeField(base, fieldSources, 'totalDebt', nasdaq.totalDebt ?? null, 'NASDAQ_DATA_LINK');
    mergeField(base, fieldSources, 'revenueLTM', nasdaq.revenueLTM ?? null, 'NASDAQ_DATA_LINK');
    mergeField(base, fieldSources, 'ebitdaLTM', nasdaq.ebitdaLTM ?? null, 'NASDAQ_DATA_LINK');
    mergeField(base, fieldSources, 'netIncomeLTM', nasdaq.netIncomeLTM ?? null, 'NASDAQ_DATA_LINK');
    if (nasdaq.currency) base.metadata.currency = base.metadata.currency ?? nasdaq.currency;
    if (nasdaq.period) base.metadata.period = base.metadata.period ?? nasdaq.period;
    if (nasdaq.warnings?.length) warnings.push(...nasdaq.warnings);
  }

  const marketstack = await fetchMarketstack(symbol);
  if (marketstack) {
    mergeField(base, fieldSources, 'sharePrice', marketstack.sharePrice ?? null, 'MARKETSTACK');
    if (marketstack.currency) base.metadata.currency = base.metadata.currency ?? marketstack.currency;
    if (marketstack.period) base.metadata.period = base.metadata.period ?? marketstack.period;
    if (marketstack.warnings?.length) warnings.push(...marketstack.warnings);
  }

  const sources = new Set(Object.values(fieldSources));
  base.metadata.source = sources.size ? Array.from(sources).join(', ') : 'unknown';

  const missing = REQUIRED_FIELDS.filter((field) => base[field] === null);
  if (missing.length > 0) {
    warnings.push(`Missing fields: ${missing.join(', ')}`);
    console.warn(`[compsIngestion] ${symbol} missing fields:`, missing);
  }

  const hasAnyData = REQUIRED_FIELDS.some((field) => base[field] !== null) || Boolean(base.companyName);
  if (!hasAnyData) {
    throw new Error('No data returned from providers');
  }

  return base;
}

async function fetchFromFMP(ticker: string): Promise<PartialCompany | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;

  const warnings: string[] = [];

  try {
    const profileUrl = `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${apiKey}`;
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`;
    const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`;
    const balanceUrl = `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?limit=1&apikey=${apiKey}`;

    const [profileRes, quoteRes, incomeRes, balanceRes] = await Promise.allSettled([
      rateLimitedFetch('FMP', profileUrl),
      rateLimitedFetch('FMP', quoteUrl),
      rateLimitedFetch('FMP', incomeUrl),
      rateLimitedFetch('FMP', balanceUrl),
    ]);

    const profile = profileRes.status === 'fulfilled' && profileRes.value.ok ? await profileRes.value.json() : null;
    const quote = quoteRes.status === 'fulfilled' && quoteRes.value.ok ? await quoteRes.value.json() : null;
    const income = incomeRes.status === 'fulfilled' && incomeRes.value.ok ? await incomeRes.value.json() : null;
    const balance = balanceRes.status === 'fulfilled' && balanceRes.value.ok ? await balanceRes.value.json() : null;

    const profileRow = Array.isArray(profile) ? profile[0] : null;
    const quoteRow = Array.isArray(quote) ? quote[0] : null;
    const incomeRow = Array.isArray(income) ? income[0] : null;
    const balanceRow = Array.isArray(balance) ? balance[0] : null;

    const totalDebt =
      toMillions(balanceRow?.totalDebt) ??
      (toMillions(balanceRow?.shortTermDebt) !== null && toMillions(balanceRow?.longTermDebt) !== null
        ? (toMillions(balanceRow?.shortTermDebt) as number) + (toMillions(balanceRow?.longTermDebt) as number)
        : null);

    return {
      ticker,
      companyName: profileRow?.companyName ?? quoteRow?.name ?? null,
      sector: profileRow?.sector ?? null,
      industry: profileRow?.industry ?? null,
      marketCap: toMillions(quoteRow?.marketCap ?? profileRow?.mktCap),
      sharePrice: toNumber(quoteRow?.price ?? profileRow?.price),
      sharesOutstanding: toNumber(quoteRow?.sharesOutstanding ?? profileRow?.sharesOutstanding),
      cashAndEquivalents: toMillions(balanceRow?.cashAndCashEquivalents ?? balanceRow?.cashAndShortTermInvestments),
      totalDebt,
      revenueLTM: toMillions(incomeRow?.revenue),
      ebitdaLTM: toMillions(incomeRow?.ebitda),
      netIncomeLTM: toMillions(incomeRow?.netIncome),
      currency: profileRow?.currency ?? quoteRow?.currency ?? null,
      period: incomeRow?.date ?? balanceRow?.date ?? null,
      warnings,
    };
  } catch (error: any) {
    warnings.push('FMP fetch failed');
    console.warn(`[compsIngestion] FMP fetch failed for ${ticker}:`, error?.message || error);
    return null;
  }
}

async function fetchFromNasdaqDataLink(ticker: string): Promise<PartialCompany | null> {
  const apiKey = process.env.NASDAQ_DATA_LINK_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://data.nasdaq.com/api/v3/datasets/SHARADAR/SF1/${ticker}_MRQ.json?api_key=${apiKey}`;
    const response = await rateLimitedFetch('NASDAQ_DATA_LINK', url);
    if (!response.ok) {
      console.warn(`[compsIngestion] Nasdaq Data Link failed for ${ticker}: ${response.status}`);
      return null;
    }
    const json = await response.json();
    const columns: string[] = json?.dataset?.column_names ?? [];
    const row: unknown[] = json?.dataset?.data?.[0];
    if (!row || !Array.isArray(row)) return null;

    const pick = (candidates: string[]): number | null => {
      for (const name of candidates) {
        const idx = columns.indexOf(name);
        if (idx >= 0) {
          const value = row[idx];
          const num = toNumber(value);
          if (num !== null) return num;
        }
      }
      return null;
    };

    const revenue = pick(['revenue', 'revenueusd']);
    const ebitda = pick(['ebitda', 'ebitdausd']);
    const netIncome = pick(['netinc', 'netincusd', 'netinccmn', 'netinccmnusd']);
    const cash = pick(['cashneq', 'cashnequsd']);
    const debt = pick(['debt', 'debtusd']);
    const shares = pick(['sharesbas', 'sharesbasusd', 'shareswa', 'shareswausd']);

    const periodIdx = columns.indexOf('calendardate');
    const period = periodIdx >= 0 ? String(row[periodIdx]) : null;

    return {
      ticker,
      companyName: null,
      sector: null,
      industry: null,
      marketCap: null,
      sharePrice: null,
      sharesOutstanding: shares,
      cashAndEquivalents: cash !== null ? cash / 1_000_000 : null,
      totalDebt: debt !== null ? debt / 1_000_000 : null,
      revenueLTM: revenue !== null ? revenue / 1_000_000 : null,
      ebitdaLTM: ebitda !== null ? ebitda / 1_000_000 : null,
      netIncomeLTM: netIncome !== null ? netIncome / 1_000_000 : null,
      currency: null,
      period,
      warnings: [],
    };
  } catch (error: any) {
    console.warn(`[compsIngestion] Nasdaq Data Link error for ${ticker}:`, error?.message || error);
    return null;
  }
}

async function fetchMarketstack(ticker: string): Promise<PartialCompany | null> {
  const apiKey = process.env.MARKETSTACK_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `http://api.marketstack.com/v1/eod/latest?access_key=${apiKey}&symbols=${ticker}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[compsIngestion] Marketstack failed for ${ticker}: ${response.status}`);
      return null;
    }
    const json = await response.json();
    const row = json?.data?.[0];
    if (!row) return null;

    return {
      ticker,
      companyName: null,
      sector: null,
      industry: null,
      marketCap: null,
      sharePrice: toNumber(row.close),
      sharesOutstanding: null,
      cashAndEquivalents: null,
      totalDebt: null,
      revenueLTM: null,
      ebitdaLTM: null,
      netIncomeLTM: null,
      currency: row?.currency ?? null,
      period: row?.date ?? null,
      warnings: [],
    };
  } catch (error: any) {
    console.warn(`[compsIngestion] Marketstack error for ${ticker}:`, error?.message || error);
    return null;
  }
}
