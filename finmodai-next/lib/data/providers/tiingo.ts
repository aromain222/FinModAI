import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export type TiingoQuote = {
  price: number | null;
  asOf: string | null;
};

export type TiingoFundamentals = {
  marketCap: number | null;
  sharesOutstanding: number | null;
  revenueLTM: number | null;
  ebitdaLTM: number | null;
  netIncomeLTM: number | null;
  cash: number | null;
  totalDebt: number | null;
};

export async function fetchTiingoQuote(ticker: string): Promise<ProviderResult<TiingoQuote>> {
  const apiKey = serverEnv.TIINGO_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'tiingo', message: 'TIINGO_API_KEY missing' } };
  }

  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(
    ticker
  )}/prices?token=${apiKey}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'tiingo',
    url,
    cacheKey: `tiingo:quote:${ticker}`,
  });
  if (!res.ok) return res;

  const first = Array.isArray(res.data) ? res.data[0] : null;
  const price = typeof first?.adjClose === 'number' ? first.adjClose : typeof first?.close === 'number' ? first.close : null;
  const asOf = first?.date ? new Date(first.date).toISOString() : null;
  return { ok: true, data: { price, asOf }, raw: res.data, latencyMs: res.latencyMs };
}

export async function fetchTiingoFundamentals(ticker: string): Promise<ProviderResult<TiingoFundamentals>> {
  const apiKey = serverEnv.TIINGO_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'tiingo', message: 'TIINGO_API_KEY missing' } };
  }

  const url = `https://api.tiingo.com/tiingo/fundamentals/${encodeURIComponent(
    ticker
  )}/statements?token=${apiKey}&statementType=income&reportType=ttm`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'tiingo',
    url,
    cacheKey: `tiingo:fundamentals:${ticker}`,
  });
  if (!res.ok) return res;

  const statement = Array.isArray(res.data) ? res.data[0] : null;
  const data = statement?.statementData || {};
  const metric = data?.[0] || {};

  const revenueLTM = Number(metric?.revenue) || null;
  const ebitdaLTM = Number(metric?.ebitda) || null;
  const netIncomeLTM = Number(metric?.netinc) || Number(metric?.netIncome) || null;

  return {
    ok: true,
    data: {
      marketCap: null,
      sharesOutstanding: null,
      revenueLTM: Number.isFinite(revenueLTM) ? revenueLTM : null,
      ebitdaLTM: Number.isFinite(ebitdaLTM) ? ebitdaLTM : null,
      netIncomeLTM: Number.isFinite(netIncomeLTM) ? netIncomeLTM : null,
      cash: null,
      totalDebt: null,
    },
    raw: res.data,
    latencyMs: res.latencyMs,
  };
}
