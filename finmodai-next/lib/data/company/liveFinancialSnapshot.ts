import path from 'node:path';
import { serverEnv } from '@/lib/env/server';
import { runPythonJson } from '@/lib/integrations/python/runPythonJson';

type SourceMap = {
  company: string | null;
  fundamentals: string | null;
  price: string | null;
};

export type LiveFinancialSnapshot = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  price: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  revenueLtm: number | null;
  grossProfitLtm: number | null;
  ebitdaLtm: number | null;
  ebitLtm: number | null;
  netIncomeLtm: number | null;
  cash: number | null;
  totalDebt: number | null;
  asOfDate: string | null;
  priceAsOfDate: string | null;
  source: SourceMap;
  warnings: string[];
  fallbackUsed: {
    yfinance: boolean;
  };
};

type PythonFallbackRow = {
  ticker?: string;
  companyName?: string | null;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  exchange?: string | null;
  currency?: string | null;
  price?: number | null;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
};

type ProviderPatch = Partial<LiveFinancialSnapshot> & {
  source?: Partial<SourceMap>;
  warnings?: string[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toMillions(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : parsed / 1_000_000;
}

function normalizeMarketCapToMillions(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return parsed > 100_000_000 ? parsed / 1_000_000 : parsed;
}

function normalizeSharesToMillions(value: unknown, marketCapM: number | null, price: number | null): number | null {
  const parsed = toNumber(value);
  const derivedFromMarket =
    marketCapM !== null && price !== null && price > 0 ? marketCapM / price : null;

  if (parsed === null || parsed <= 0) return derivedFromMarket;
  if (derivedFromMarket !== null && parsed < 100 && derivedFromMarket > parsed * 50) return derivedFromMarket;
  if (parsed > 1_000_000) return parsed / 1_000_000;
  return parsed;
}

function pick<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function pickNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function latestDate(...values: Array<string | null | undefined>): string | null {
  const dates = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (dates.length === 0) return null;
  return dates.sort((left, right) => right.localeCompare(left))[0] ?? null;
}

async function fetchJsonFresh<T>(url: string, provider: string, warnings: string[]): Promise<T | null> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
      headers: provider === 'sec_edgar' && serverEnv.SEC_UA_EMAIL
        ? { 'User-Agent': serverEnv.SEC_UA_EMAIL }
        : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      warnings.push(`${provider}: ${response.status} ${response.statusText}`);
      return null;
    }
    return text ? (JSON.parse(text) as T) : null;
  } catch (error) {
    warnings.push(`${provider}: ${error instanceof Error ? error.message : 'request failed'}`);
    return null;
  }
}

async function fetchFinnhubPatch(ticker: string): Promise<ProviderPatch> {
  const warnings: string[] = [];
  const apiKey = serverEnv.FINNHUB_API_KEY;
  if (!apiKey) return { warnings: ['finnhub: FINNHUB_API_KEY missing'] };

  const encodedTicker = encodeURIComponent(ticker);
  const [quote, profile, metric] = await Promise.all([
    fetchJsonFresh<any>(`https://finnhub.io/api/v1/quote?symbol=${encodedTicker}&token=${apiKey}`, 'finnhub', warnings),
    fetchJsonFresh<any>(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodedTicker}&token=${apiKey}`, 'finnhub', warnings),
    fetchJsonFresh<any>(`https://finnhub.io/api/v1/stock/metric?symbol=${encodedTicker}&metric=all&token=${apiKey}`, 'finnhub', warnings),
  ]);

  const metrics = metric?.metric ?? {};
  const price = toNumber(quote?.c);
  const priceAsOfDate = quote?.t ? new Date(Number(quote.t) * 1000).toISOString().slice(0, 10) : null;
  const marketCap = pickNumber(
    normalizeMarketCapToMillions(metrics.marketCapitalization),
    normalizeMarketCapToMillions(profile?.marketCapitalization),
  );
  const sharesOutstanding = normalizeSharesToMillions(
    pickNumber(toNumber(metrics.sharesOutstanding), toNumber(profile?.shareOutstanding)),
    marketCap,
    price,
  );

  return {
    companyName: profile?.name ?? null,
    sector: profile?.finnhubIndustry ?? null,
    industry: profile?.finnhubIndustry ?? null,
    exchange: profile?.exchange ?? null,
    country: profile?.country ?? null,
    currency: profile?.currency ?? null,
    price,
    priceAsOfDate,
    marketCap,
    sharesOutstanding,
    revenueLtm: pickNumber(toNumber(metrics.revenueTTM), toNumber(metrics.revenueLTM)),
    ebitdaLtm: pickNumber(toNumber(metrics.ebitdaTTM), toNumber(metrics.ebitdaLTM)),
    netIncomeLtm: pickNumber(toNumber(metrics.netIncomeTTM), toNumber(metrics.netIncomeCommonStockholdersTTM)),
    cash: pickNumber(toNumber(metrics.cashAndShortTermInvestments), toNumber(metrics.cash)),
    totalDebt: pickNumber(toNumber(metrics.totalDebt), toNumber(metrics.totalDebtTTM)),
    asOfDate: new Date().toISOString().slice(0, 10),
    source: {
      company: profile ? 'finnhub_live_profile' : null,
      fundamentals: metric ? 'finnhub_live_metrics' : null,
      price: price !== null ? 'finnhub_live_quote' : null,
    },
    warnings,
  };
}

async function fetchFmpPatch(ticker: string): Promise<ProviderPatch> {
  const warnings: string[] = [];
  const apiKey = serverEnv.FMP_API_KEY;
  if (!apiKey) return { warnings: ['fmp: FMP_API_KEY missing'] };

  const encodedTicker = encodeURIComponent(ticker);
  const [profileRows, quarterRows, annualRows, balanceRows] = await Promise.all([
    fetchJsonFresh<any[]>(`https://financialmodelingprep.com/stable/profile?symbol=${encodedTicker}&apikey=${apiKey}`, 'fmp', warnings),
    fetchJsonFresh<any[]>(`https://financialmodelingprep.com/stable/income-statement?symbol=${encodedTicker}&period=quarter&limit=4&apikey=${apiKey}`, 'fmp', warnings),
    fetchJsonFresh<any[]>(`https://financialmodelingprep.com/stable/income-statement?symbol=${encodedTicker}&limit=1&apikey=${apiKey}`, 'fmp', warnings),
    fetchJsonFresh<any[]>(`https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${encodedTicker}&period=quarter&limit=1&apikey=${apiKey}`, 'fmp', warnings),
  ]);

  const profile = Array.isArray(profileRows) ? profileRows[0] : null;
  const quarters = Array.isArray(quarterRows) ? quarterRows : [];
  const annual = Array.isArray(annualRows) ? annualRows[0] : null;
  const balance = Array.isArray(balanceRows) ? balanceRows[0] : null;
  const sumLtm = (key: string) => {
    const values = quarters
      .slice(0, 4)
      .map((row) => toNumber(row?.[key]))
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const marketCapRaw = pickNumber(toNumber(profile?.marketCap), toNumber(profile?.mktCap));
  const price = toNumber(profile?.price);
  const sharesOutstanding = pickNumber(
    toMillions(profile?.sharesOutstanding),
    marketCapRaw !== null && price !== null && price > 0 ? marketCapRaw / price / 1_000_000 : null,
  );

  return {
    companyName: profile?.companyName ?? null,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    exchange: profile?.exchangeShortName ?? profile?.exchange ?? null,
    country: profile?.country ?? null,
    currency: profile?.currency ?? null,
    price,
    priceAsOfDate: new Date().toISOString().slice(0, 10),
    marketCap: toMillions(marketCapRaw),
    sharesOutstanding,
    revenueLtm: toMillions(pickNumber(sumLtm('revenue'), toNumber(annual?.revenue))),
    grossProfitLtm: toMillions(pickNumber(sumLtm('grossProfit'), toNumber(annual?.grossProfit))),
    ebitdaLtm: toMillions(pickNumber(sumLtm('ebitda'), toNumber(annual?.ebitda))),
    ebitLtm: toMillions(pickNumber(sumLtm('operatingIncome'), toNumber(annual?.operatingIncome))),
    netIncomeLtm: toMillions(pickNumber(sumLtm('netIncome'), toNumber(annual?.netIncome))),
    cash: toMillions(pickNumber(toNumber(balance?.cashAndCashEquivalents), toNumber(balance?.cashAndShortTermInvestments))),
    totalDebt: toMillions(
      pickNumber(
        toNumber(balance?.totalDebt),
        toNumber(balance?.shortTermDebt) !== null || toNumber(balance?.longTermDebt) !== null
          ? Number(toNumber(balance?.shortTermDebt) ?? 0) + Number(toNumber(balance?.longTermDebt) ?? 0)
          : null,
      ),
    ),
    asOfDate: latestDate(quarters[0]?.date, annual?.date, balance?.date),
    source: {
      company: profile ? 'fmp_live_profile' : null,
      fundamentals: quarters.length > 0 || annual || balance ? 'fmp_live_statements' : null,
      price: price !== null ? 'fmp_live_profile' : null,
    },
    warnings,
  };
}

async function fetchSecPatch(ticker: string): Promise<ProviderPatch> {
  const warnings: string[] = [];
  if (!serverEnv.SEC_UA_EMAIL) return { warnings: ['sec_edgar: SEC_UA_EMAIL missing'] };

  const tickerMap = await fetchJsonFresh<Record<string, any>>('https://www.sec.gov/files/company_tickers.json', 'sec_edgar', warnings);
  const entry = Object.values(tickerMap ?? {}).find((row) => String(row?.ticker).toUpperCase() === ticker);
  if (!entry?.cik_str) return { warnings: [`sec_edgar: CIK not found for ${ticker}`] };

  const cik = String(entry.cik_str).padStart(10, '0');
  const factsPayload = await fetchJsonFresh<any>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, 'sec_edgar', warnings);
  const facts = factsPayload?.facts?.['us-gaap'];
  const pickLatest = (tags: string[]) => {
    for (const tag of tags) {
      const rows = facts?.[tag]?.units?.USD ?? facts?.[tag]?.units?.usd;
      if (!Array.isArray(rows)) continue;
      const sorted = [...rows]
        .filter((row) => typeof row?.val === 'number')
        .sort((left, right) => String(right.end ?? right.filed ?? '').localeCompare(String(left.end ?? left.filed ?? '')));
      const row = sorted[0];
      if (row) return { value: Number(row.val), asOfDate: String(row.end ?? row.filed ?? '') || null };
    }
    return { value: null, asOfDate: null };
  };

  const revenue = pickLatest(['Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerExcludingAssessedTax']);
  const grossProfit = pickLatest(['GrossProfit']);
  const ebit = pickLatest(['OperatingIncomeLoss']);
  const netIncome = pickLatest(['NetIncomeLoss']);
  const cash = pickLatest(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']);
  const shortDebt = pickLatest(['DebtCurrent', 'ShortTermBorrowings']);
  const longDebt = pickLatest(['LongTermDebtNoncurrent', 'LongTermDebt']);
  const totalDebtRaw =
    shortDebt.value !== null || longDebt.value !== null
      ? Number(shortDebt.value ?? 0) + Number(longDebt.value ?? 0)
      : null;

  return {
    companyName: factsPayload?.entityName ?? null,
    revenueLtm: toMillions(revenue.value),
    grossProfitLtm: toMillions(grossProfit.value),
    ebitLtm: toMillions(ebit.value),
    netIncomeLtm: toMillions(netIncome.value),
    cash: toMillions(cash.value),
    totalDebt: toMillions(totalDebtRaw),
    asOfDate: latestDate(revenue.asOfDate, grossProfit.asOfDate, ebit.asOfDate, netIncome.asOfDate, cash.asOfDate, shortDebt.asOfDate, longDebt.asOfDate),
    source: {
      company: factsPayload?.entityName ? 'sec_edgar_companyfacts' : null,
      fundamentals: factsPayload ? 'sec_edgar_companyfacts' : null,
      price: null,
    },
    warnings,
  };
}

async function fetchYfinancePatch(ticker: string): Promise<ProviderPatch> {
  const yfinanceScript = path.join(process.cwd(), 'scripts/providers/yfinance_quote.py');
  const row = await runPythonJson<PythonFallbackRow>(yfinanceScript, [ticker]);
  if (!row) return { warnings: ['yfinance: fallback unavailable'] };
  return {
    companyName: row.companyName ?? null,
    sector: row.sector ?? null,
    industry: row.industry ?? null,
    exchange: row.exchange ?? null,
    country: row.country ?? null,
    currency: row.currency ?? null,
    price: toNumber(row.price),
    priceAsOfDate: row.price !== null && row.price !== undefined ? new Date().toISOString().slice(0, 10) : null,
    marketCap: toMillions(row.marketCap),
    sharesOutstanding: toMillions(row.sharesOutstanding),
    source: {
      company: row.companyName ? 'yfinance_unofficial' : null,
      fundamentals: null,
      price: row.price !== null && row.price !== undefined ? 'yfinance_unofficial' : null,
    },
    warnings: [],
  };
}

function mergePatch(base: LiveFinancialSnapshot, patch: ProviderPatch): LiveFinancialSnapshot {
  const source: Partial<SourceMap> = patch.source ?? {};
  return {
    ...base,
    companyName: pick(base.companyName, patch.companyName),
    sector: pick(base.sector, patch.sector),
    industry: pick(base.industry, patch.industry),
    exchange: pick(base.exchange, patch.exchange),
    country: pick(base.country, patch.country),
    currency: pick(base.currency, patch.currency),
    price: pickNumber(base.price, patch.price),
    marketCap: pickNumber(base.marketCap, patch.marketCap),
    sharesOutstanding: pickNumber(base.sharesOutstanding, patch.sharesOutstanding),
    revenueLtm: pickNumber(base.revenueLtm, patch.revenueLtm),
    grossProfitLtm: pickNumber(base.grossProfitLtm, patch.grossProfitLtm),
    ebitdaLtm: pickNumber(base.ebitdaLtm, patch.ebitdaLtm),
    ebitLtm: pickNumber(base.ebitLtm, patch.ebitLtm),
    netIncomeLtm: pickNumber(base.netIncomeLtm, patch.netIncomeLtm),
    cash: pickNumber(base.cash, patch.cash),
    totalDebt: pickNumber(base.totalDebt, patch.totalDebt),
    asOfDate: latestDate(base.asOfDate, patch.asOfDate),
    priceAsOfDate: latestDate(base.priceAsOfDate, patch.priceAsOfDate),
    source: {
      company: base.source.company ?? source.company ?? null,
      fundamentals: base.source.fundamentals ?? source.fundamentals ?? null,
      price: base.source.price ?? source.price ?? null,
    },
    warnings: [...base.warnings, ...(patch.warnings ?? [])],
  };
}

export async function getLiveCompanyFinancialSnapshot(ticker: string): Promise<LiveFinancialSnapshot | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,12}$/.test(normalizedTicker)) return null;

  const empty: LiveFinancialSnapshot = {
    ticker: normalizedTicker,
    companyName: null,
    sector: null,
    industry: null,
    exchange: null,
    country: null,
    currency: 'USD',
    price: null,
    marketCap: null,
    sharesOutstanding: null,
    revenueLtm: null,
    grossProfitLtm: null,
    ebitdaLtm: null,
    ebitLtm: null,
    netIncomeLtm: null,
    cash: null,
    totalDebt: null,
    asOfDate: null,
    priceAsOfDate: null,
    source: { company: null, fundamentals: null, price: null },
    warnings: [],
    fallbackUsed: { yfinance: false },
  };

  const [finnhubPatch, fmpPatch, secPatch] = await Promise.all([
    fetchFinnhubPatch(normalizedTicker),
    fetchFmpPatch(normalizedTicker),
    fetchSecPatch(normalizedTicker),
  ]);
  let snapshot = mergePatch(mergePatch(mergePatch(empty, finnhubPatch), fmpPatch), secPatch);

  if (!snapshot.price || !snapshot.companyName || !snapshot.marketCap || !snapshot.sharesOutstanding) {
    const yfinancePatch = await fetchYfinancePatch(normalizedTicker);
    snapshot = mergePatch(snapshot, yfinancePatch);
    snapshot.fallbackUsed.yfinance = Boolean(yfinancePatch.source?.company || yfinancePatch.source?.price);
  }

  const hasAnyUsefulData = Boolean(
    snapshot.companyName ||
    snapshot.price !== null ||
    snapshot.revenueLtm !== null ||
    snapshot.marketCap !== null,
  );
  return hasAnyUsefulData ? snapshot : null;
}
