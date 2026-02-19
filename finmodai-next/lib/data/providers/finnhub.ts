import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export type FinnhubQuote = {
  price: number | null;
  asOf: string | null;
};

export type FinnhubFundamentals = {
  marketCap: number | null;
  sharesOutstanding: number | null;
  revenueLTM: number | null;
  ebitdaLTM: number | null;
  netIncomeLTM: number | null;
  cash: number | null;
  totalDebt: number | null;
};

export async function fetchFinnhubQuote(ticker: string): Promise<ProviderResult<FinnhubQuote>> {
  const apiKey = serverEnv.FINNHUB_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'finnhub', message: 'FINNHUB_API_KEY missing' } };
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'finnhub',
    url,
    cacheKey: `finnhub:quote:${ticker}`,
  });
  if (!res.ok) return res;

  const price = typeof res.data?.c === 'number' ? res.data.c : null;
  const asOf = res.data?.t ? new Date(res.data.t * 1000).toISOString() : null;
  return { ok: true, data: { price, asOf }, raw: res.data, latencyMs: res.latencyMs };
}

export async function fetchFinnhubFundamentals(ticker: string): Promise<ProviderResult<FinnhubFundamentals>> {
  const apiKey = serverEnv.FINNHUB_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'finnhub', message: 'FINNHUB_API_KEY missing' } };
  }

  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${apiKey}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'finnhub',
    url,
    cacheKey: `finnhub:fundamentals:${ticker}`,
  });
  if (!res.ok) return res;

  const metric = res.data?.metric || {};
  const marketCap = typeof metric?.marketCapitalization === 'number' ? metric.marketCapitalization : null;
  const sharesOutstanding = typeof metric?.sharesOutstanding === 'number' ? metric.sharesOutstanding : null;
  const revenueLTM =
    typeof metric?.revenueTTM === 'number'
      ? metric.revenueTTM
      : typeof metric?.revenueLTM === 'number'
        ? metric.revenueLTM
        : null;
  const ebitdaLTM =
    typeof metric?.ebitdaTTM === 'number'
      ? metric.ebitdaTTM
      : typeof metric?.ebitdaLTM === 'number'
        ? metric.ebitdaLTM
        : null;
  const netIncomeLTM =
    typeof metric?.netIncomeTTM === 'number'
      ? metric.netIncomeTTM
      : typeof metric?.netIncomeCommonStockholdersTTM === 'number'
        ? metric.netIncomeCommonStockholdersTTM
        : null;
  const cash =
    typeof metric?.cashAndShortTermInvestments === 'number'
      ? metric.cashAndShortTermInvestments
      : typeof metric?.cash === 'number'
        ? metric.cash
        : null;
  const totalDebt =
    typeof metric?.totalDebt === 'number'
      ? metric.totalDebt
      : typeof metric?.totalDebtTTM === 'number'
        ? metric.totalDebtTTM
        : null;

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
    raw: res.data,
    latencyMs: res.latencyMs,
  };
}
