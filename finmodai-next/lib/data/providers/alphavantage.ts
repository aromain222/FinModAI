import { getAlphaVantageKey } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export type AlphaVantageQuote = {
  price: number | null;
  asOf: string | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
};

export type AlphaVantageFundamentals = {
  marketCap: number | null;
  sharesOutstanding: number | null;
  revenueLTM: number | null;
  ebitdaLTM: number | null;
  netIncomeLTM: number | null;
  cash: number | null;
  totalDebt: number | null;
};

type AlphaVantageOverviewResponse = {
  Symbol?: string;
  MarketCapitalization?: string;
  SharesOutstanding?: string;
  EBITDA?: string;
  RevenueTTM?: string;
  EPS?: string;
  QuarterlyRevenueGrowthYOY?: string;
  QuarterlyEarningsGrowthYOY?: string;
  LatestQuarter?: string;
};

type AlphaVantageBalanceSheetResponse = {
  annualReports?: Array<Record<string, string>>;
  quarterlyReports?: Array<Record<string, string>>;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstReport(data: AlphaVantageBalanceSheetResponse | null | undefined): Record<string, string> | null {
  if (Array.isArray(data?.quarterlyReports) && data.quarterlyReports.length > 0) {
    return data.quarterlyReports[0] ?? null;
  }
  if (Array.isArray(data?.annualReports) && data.annualReports.length > 0) {
    return data.annualReports[0] ?? null;
  }
  return null;
}

export async function fetchAlphaVantageQuote(ticker: string): Promise<ProviderResult<AlphaVantageQuote>> {
  const apiKey = getAlphaVantageKey();
  if (!apiKey) {
    return { ok: false, error: { provider: 'alphavantage', message: 'ALPHA_VANTAGE_API_KEY missing' } };
  }

  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(
    ticker
  )}&apikey=${apiKey}`;
  const res = await fetchJsonWithRetry<AlphaVantageOverviewResponse>({
    provider: 'alphavantage',
    url,
    cacheKey: `alphavantage:overview:${ticker}`,
  });
  if (!res.ok) return res;

  const data = res.data ?? {};
  const marketCap = toNumber(data.MarketCapitalization);
  const sharesOutstanding = toNumber(data.SharesOutstanding);
  const price =
    marketCap !== null && sharesOutstanding !== null && sharesOutstanding > 0
      ? marketCap / sharesOutstanding
      : null;
  const asOf = data.LatestQuarter ? new Date(data.LatestQuarter).toISOString() : null;

  return {
    ok: true,
    data: { price, asOf, marketCap, sharesOutstanding },
    raw: res.data,
    latencyMs: res.latencyMs,
  };
}

export async function fetchAlphaVantageFundamentals(
  ticker: string
): Promise<ProviderResult<AlphaVantageFundamentals>> {
  const apiKey = getAlphaVantageKey();
  if (!apiKey) {
    return { ok: false, error: { provider: 'alphavantage', message: 'ALPHA_VANTAGE_API_KEY missing' } };
  }

  const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(
    ticker
  )}&apikey=${apiKey}`;
  const balanceSheetUrl = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${encodeURIComponent(
    ticker
  )}&apikey=${apiKey}`;

  const [overviewRes, balanceRes] = await Promise.all([
    fetchJsonWithRetry<AlphaVantageOverviewResponse>({
      provider: 'alphavantage',
      url: overviewUrl,
      cacheKey: `alphavantage:overview:${ticker}`,
    }),
    fetchJsonWithRetry<AlphaVantageBalanceSheetResponse>({
      provider: 'alphavantage',
      url: balanceSheetUrl,
      cacheKey: `alphavantage:balance_sheet:${ticker}`,
    }),
  ]);

  if (!overviewRes.ok) return overviewRes;
  if (!balanceRes.ok) return balanceRes;

  const overview = overviewRes.data ?? {};
  const report = firstReport(balanceRes.data);

  const marketCap = toNumber(overview.MarketCapitalization);
  const sharesOutstanding = toNumber(overview.SharesOutstanding);
  const revenueLTM = toNumber(overview.RevenueTTM);
  const ebitdaLTM = toNumber(overview.EBITDA);
  const eps = toNumber(overview.EPS);
  const netIncomeLTM =
    eps !== null && sharesOutstanding !== null && sharesOutstanding > 0 ? eps * sharesOutstanding : null;
  const cash =
    toNumber(report?.cashAndCashEquivalentsAtCarryingValue) ??
    toNumber(report?.cashAndShortTermInvestments) ??
    toNumber(report?.cashAndCashEquivalents);
  const totalDebt =
    toNumber(report?.shortLongTermDebtTotal) ??
    ((toNumber(report?.shortTermDebt) ?? 0) + (toNumber(report?.longTermDebt) ?? 0) || null);

  return {
    ok: true,
    data: {
      marketCap,
      sharesOutstanding,
      revenueLTM,
      ebitdaLTM,
      netIncomeLTM,
      cash,
      totalDebt,
    },
    raw: {
      overview: overviewRes.data,
      balanceSheet: balanceRes.data,
    },
    latencyMs: Math.max(overviewRes.latencyMs ?? 0, balanceRes.latencyMs ?? 0),
  };
}
