import { getSupabaseServiceClient } from '@/lib/events/store';
import { fetchJsonWithRetry } from '@/lib/data/providers/shared';
import { serverEnv } from '@/lib/env/server';
import path from 'node:path';
import { runPythonJson } from '@/lib/integrations/python/runPythonJson';

export type CompanySyncSummary = {
  ticker: string;
  companyId: string | null;
  companyName: string | null;
  snapshotDate: string | null;
  source: string;
  warnings: string[];
};

type FmpProfileRow = {
  symbol?: string;
  companyName?: string;
  sector?: string;
  industry?: string;
  country?: string;
  exchange?: string;
  exchangeShortName?: string;
  currency?: string;
  isin?: string;
  cusip?: string;
  price?: number;
  mktCap?: number;
  marketCap?: number;
  sharesOutstanding?: number;
};

type FmpIncomeRow = {
  date?: string;
  revenue?: number;
  grossProfit?: number;
  ebitda?: number;
  operatingIncome?: number;
  netIncome?: number;
};

type FmpBalanceRow = {
  date?: string;
  cashAndCashEquivalents?: number;
  cashAndShortTermInvestments?: number;
  totalDebt?: number;
  shortTermDebt?: number;
  longTermDebt?: number;
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

function toMillions(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value / 1_000_000;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed / 1_000_000 : null;
  }
  return null;
}

function deriveSharesOutstanding(profile: FmpProfileRow): number | null {
  const direct = toMillions(profile.sharesOutstanding ?? null);
  if (direct !== null) return direct;

  const marketCap = typeof profile.marketCap === 'number' && Number.isFinite(profile.marketCap)
    ? profile.marketCap
    : typeof profile.mktCap === 'number' && Number.isFinite(profile.mktCap)
      ? profile.mktCap
      : null;
  const price = typeof profile.price === 'number' && Number.isFinite(profile.price) && profile.price > 0 ? profile.price : null;
  if (marketCap === null || price === null) return null;
  return marketCap / price / 1_000_000;
}

function sumLtm(rows: FmpIncomeRow[], key: keyof FmpIncomeRow): number | null {
  const values = rows.slice(0, 4).map((row) => row[key]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function pickLatest(rows: FmpIncomeRow[], key: keyof FmpIncomeRow): number | null {
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function inferCompanyType(profile: FmpProfileRow): string | null {
  const combined = `${profile.sector ?? ''} ${profile.industry ?? ''}`.toLowerCase();
  if (/software|saas|cloud/.test(combined)) return 'SaaS';
  if (/semiconductor|chip|gpu/.test(combined)) return 'Semiconductors';
  if (/bank|payments|fintech|financial/.test(combined)) return 'Fintech';
  if (/consumer|retail|e-commerce/.test(combined)) return 'Consumer';
  if (/industrial|manufacturing|logistics/.test(combined)) return 'Industrial';
  if (/health|biotech|pharma|medical/.test(combined)) return 'Healthcare';
  return profile.sector ?? null;
}

function isSaas(profile: FmpProfileRow): boolean {
  const combined = `${profile.sector ?? ''} ${profile.industry ?? ''}`.toLowerCase();
  return /software|saas|cloud/.test(combined);
}

function mergeFallbackProfile(profile: FmpProfileRow, fallback: PythonFallbackRow | null): FmpProfileRow {
  if (!fallback) return profile;
  return {
    ...profile,
    companyName: profile.companyName ?? fallback.companyName ?? undefined,
    sector: profile.sector ?? fallback.sector ?? undefined,
    industry: profile.industry ?? fallback.industry ?? undefined,
    country: profile.country ?? fallback.country ?? undefined,
    exchange: profile.exchange ?? fallback.exchange ?? undefined,
    exchangeShortName: profile.exchangeShortName ?? fallback.exchange ?? undefined,
    currency: profile.currency ?? fallback.currency ?? undefined,
    price: typeof profile.price === 'number' ? profile.price : fallback.price ?? undefined,
    marketCap:
      typeof profile.marketCap === 'number'
        ? profile.marketCap
        : typeof profile.mktCap === 'number'
          ? profile.mktCap
          : fallback.marketCap ?? undefined,
    sharesOutstanding:
      typeof profile.sharesOutstanding === 'number'
        ? profile.sharesOutstanding
        : fallback.sharesOutstanding ?? undefined,
  };
}

export async function syncCompanyFromFmp(ticker: string): Promise<CompanySyncSummary> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service client is not configured');
  }

  const apiKey = serverEnv.FMP_API_KEY;
  if (!apiKey) {
    throw new Error('FMP_API_KEY is not configured');
  }

  const normalizedTicker = ticker.trim().toUpperCase();
  const warnings: string[] = [];
  const yfinanceScript = path.join(process.cwd(), 'scripts/providers/yfinance_quote.py');
  const financeDatabaseScript = path.join(process.cwd(), 'scripts/providers/financedatabase_metadata.py');

  const [profileResult, quarterlyIncomeResult, annualIncomeResult, latestBalanceResult] = await Promise.all([
    fetchJsonWithRetry<FmpProfileRow[]>({
      provider: 'fmp',
      url: `https://financialmodelingprep.com/stable/profile?symbol=${normalizedTicker}&apikey=${apiKey}`,
      cacheKey: `fmp:profile:${normalizedTicker}`,
      ttlMs: 30 * 60 * 1000,
    }),
    fetchJsonWithRetry<FmpIncomeRow[]>({
      provider: 'fmp',
      url: `https://financialmodelingprep.com/stable/income-statement?symbol=${normalizedTicker}&period=quarter&limit=4&apikey=${apiKey}`,
      cacheKey: `fmp:income-quarterly:${normalizedTicker}`,
      ttlMs: 30 * 60 * 1000,
    }),
    fetchJsonWithRetry<FmpIncomeRow[]>({
      provider: 'fmp',
      url: `https://financialmodelingprep.com/stable/income-statement?symbol=${normalizedTicker}&limit=1&apikey=${apiKey}`,
      cacheKey: `fmp:income-annual:${normalizedTicker}`,
      ttlMs: 30 * 60 * 1000,
    }),
    fetchJsonWithRetry<FmpBalanceRow[]>({
      provider: 'fmp',
      url: `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${normalizedTicker}&period=quarter&limit=1&apikey=${apiKey}`,
      cacheKey: `fmp:balance-quarterly:${normalizedTicker}`,
      ttlMs: 30 * 60 * 1000,
    }),
  ]);

  const financedatabaseMetadata = await runPythonJson<PythonFallbackRow>(financeDatabaseScript, [normalizedTicker]);
  const yfinanceQuote = await runPythonJson<PythonFallbackRow>(yfinanceScript, [normalizedTicker]);

  const fallbackProfile = mergeFallbackProfile({}, financedatabaseMetadata);
  const fallbackEnrichedProfile = mergeFallbackProfile(fallbackProfile, yfinanceQuote);

  if ((!profileResult.ok || !Array.isArray(profileResult.data) || profileResult.data.length === 0) && !fallbackEnrichedProfile.companyName) {
    throw new Error(`FMP profile unavailable for ${normalizedTicker}`);
  }

  const profile = mergeFallbackProfile(
    (profileResult.ok && Array.isArray(profileResult.data) ? profileResult.data[0] : {}) ?? {},
    fallbackEnrichedProfile
  );
  if (!profileResult.ok || !Array.isArray(profileResult.data) || profileResult.data.length === 0) {
    warnings.push(`FMP profile unavailable for ${normalizedTicker}; used fallback metadata.`);
  }
  const incomeRows = quarterlyIncomeResult.ok && Array.isArray(quarterlyIncomeResult.data) ? quarterlyIncomeResult.data : [];
  const annualIncomeRows = annualIncomeResult.ok && Array.isArray(annualIncomeResult.data) ? annualIncomeResult.data : [];
  const balanceRow = latestBalanceResult.ok && Array.isArray(latestBalanceResult.data) ? latestBalanceResult.data[0] ?? {} : {};

  const revenueLtm = toMillions(sumLtm(incomeRows, 'revenue') ?? pickLatest(annualIncomeRows, 'revenue'));
  const grossProfitLtm = toMillions(sumLtm(incomeRows, 'grossProfit') ?? pickLatest(annualIncomeRows, 'grossProfit'));
  const ebitdaLtm = toMillions(sumLtm(incomeRows, 'ebitda') ?? pickLatest(annualIncomeRows, 'ebitda'));
  const ebitLtm = toMillions(sumLtm(incomeRows, 'operatingIncome') ?? pickLatest(annualIncomeRows, 'operatingIncome'));
  const netIncomeLtm = toMillions(sumLtm(incomeRows, 'netIncome') ?? pickLatest(annualIncomeRows, 'netIncome'));
  const cash = toMillions(balanceRow.cashAndCashEquivalents ?? balanceRow.cashAndShortTermInvestments ?? null);
  const totalDebt = toMillions(balanceRow.totalDebt ?? ((balanceRow.shortTermDebt ?? 0) + (balanceRow.longTermDebt ?? 0)));
  const sharesOutstanding = deriveSharesOutstanding(profile);
  const marketCap = toMillions(profile.marketCap ?? profile.mktCap ?? null);
  const sharePrice = typeof profile.price === 'number' && Number.isFinite(profile.price) ? profile.price : null;
  const snapshotDate = incomeRows[0]?.date ?? annualIncomeRows[0]?.date ?? balanceRow.date ?? new Date().toISOString().slice(0, 10);

  if (revenueLtm === null) warnings.push('Revenue LTM unavailable from FMP quarterly statements.');
  if (grossProfitLtm === null) warnings.push('Gross profit LTM unavailable from FMP quarterly statements.');
  if (ebitdaLtm === null) warnings.push('EBITDA LTM unavailable from FMP quarterly statements.');
  if (sharesOutstanding === null) warnings.push('Shares outstanding unavailable from FMP profile.');

  const companyPayload = {
    ticker: normalizedTicker,
    name: profile.companyName ?? normalizedTicker,
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    country: profile.country ?? null,
    exchange: profile.exchangeShortName ?? profile.exchange ?? null,
    company_type: inferCompanyType(profile),
    is_saas: isSaas(profile),
  };

  const companyUpsert = await (supabase.from('companies') as any)
    .upsert(companyPayload, { onConflict: 'ticker' })
    .select('*')
    .single();
  if (companyUpsert.error || !companyUpsert.data) {
    throw new Error(`Failed to upsert company ${normalizedTicker}: ${companyUpsert.error?.message ?? 'unknown error'}`);
  }

  const companyId = companyUpsert.data.id as string;

  const identifierPayload = {
    company_id: companyId,
    ticker: normalizedTicker,
    isin: profile.isin ?? null,
    cusip: profile.cusip ?? null,
    source: 'fmp',
  };
  const identifierUpsert = await (supabase.from('company_identifiers') as any)
    .upsert(identifierPayload, { onConflict: 'company_id,source' })
    .select('id')
    .single();
  if (identifierUpsert.error) {
    warnings.push(`Identifier upsert failed: ${identifierUpsert.error.message}`);
  }

  const snapshotPayload = {
    company_id: companyId,
    as_of_date: snapshotDate,
    period_type: 'LTM',
    currency: profile.currency ?? 'USD',
    revenue_ltm: revenueLtm,
    gross_profit_ltm: grossProfitLtm,
    ebitda_ltm: ebitdaLtm,
    ebit_ltm: ebitLtm,
    net_income_ltm: netIncomeLtm,
    cash,
    total_debt: totalDebt,
    shares_outstanding: sharesOutstanding,
    market_cap: marketCap,
    source: 'fmp',
    source_priority: 100,
  };
  const snapshotUpsert = await (supabase.from('company_snapshots') as any)
    .upsert(snapshotPayload, { onConflict: 'company_id,as_of_date,period_type,source' })
    .select('id')
    .single();
  if (snapshotUpsert.error) {
    warnings.push(`Snapshot upsert failed: ${snapshotUpsert.error.message}`);
  }

  if (sharePrice !== null) {
    const priceUpsert = await (supabase.from('company_prices') as any)
      .upsert(
        {
          company_id: companyId,
          date: snapshotDate,
          open: sharePrice,
          high: sharePrice,
          low: sharePrice,
          close: sharePrice,
          volume: null,
          source: 'fmp',
        },
        { onConflict: 'company_id,date' }
      )
      .select('id')
      .single();
    if (priceUpsert.error) {
      warnings.push(`FMP price upsert failed: ${priceUpsert.error.message}`);
    }
  } else {
    warnings.push('Share price unavailable from FMP profile.');
  }

  return {
    ticker: normalizedTicker,
    companyId,
    companyName: companyPayload.name,
    snapshotDate,
    source: 'fmp',
    warnings,
  };
}
