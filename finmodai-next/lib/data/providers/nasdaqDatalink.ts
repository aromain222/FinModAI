import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

export type NasdaqDatalinkQuote = {
  price: number | null;
  asOf: string | null;
};

export type NasdaqDatalinkFundamentals = {
  revenueLTM: number | null;
  ebitdaLTM: number | null;
  netIncomeLTM: number | null;
  cash: number | null;
  totalDebt: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
};

export async function fetchNasdaqDatalinkQuote(ticker: string): Promise<ProviderResult<NasdaqDatalinkQuote>> {
  const apiKey = serverEnv.NASDAQ_DATA_LINK_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'nasdaq_datalink', message: 'NASDAQ_DATA_LINK_API_KEY missing' } };
  }

  const url = `https://data.nasdaq.com/api/v3/datasets/WIKI/${encodeURIComponent(ticker)}.json?api_key=${apiKey}`;
  const res = await fetchJsonWithRetry<any>({
    provider: 'nasdaq_datalink',
    url,
    cacheKey: `nasdaq_datalink:quote:${ticker}`,
  });
  if (!res.ok) return res;

  const data = res.data?.dataset;
  const firstRow = Array.isArray(data?.data) ? data.data[0] : null;
  const columns = data?.column_names || [];
  const closeIndex = columns.indexOf('Close');
  const dateIndex = columns.indexOf('Date');

  const price = closeIndex >= 0 && firstRow ? Number(firstRow[closeIndex]) : null;
  const asOf = dateIndex >= 0 && firstRow ? new Date(firstRow[dateIndex]).toISOString() : null;

  return { ok: true, data: { price: Number.isFinite(price) ? price : null, asOf }, raw: res.data, latencyMs: res.latencyMs };
}

export async function fetchNasdaqDatalinkFundamentals(
  ticker: string
): Promise<ProviderResult<NasdaqDatalinkFundamentals>> {
  const apiKey = serverEnv.NASDAQ_DATA_LINK_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'nasdaq_datalink', message: 'NASDAQ_DATA_LINK_API_KEY missing' } };
  }

  const url = `https://data.nasdaq.com/api/v3/datatables/SHARADAR/SF1.json?api_key=${apiKey}&ticker=${encodeURIComponent(
    ticker
  )}&dimension=TTM&qopts.columns=ticker,calendardate,revenue,ebitda,netinc,cashnequsd,debtusd,marketcap,sharesbas`;

  const res = await fetchJsonWithRetry<any>({
    provider: 'nasdaq_datalink',
    url,
    cacheKey: `nasdaq_datalink:fundamentals:${ticker}`,
  });
  if (!res.ok) return res;

  const row = res.data?.datatable?.data?.[0];
  const columns = res.data?.datatable?.columns || [];
  const index = (name: string) => columns.findIndex((col: any) => col?.name === name);
  const getValue = (name: string) => {
    const idx = index(name);
    if (!row || idx < 0) return null;
    const value = row[idx];
    return typeof value === 'number' ? value : value !== null ? Number(value) : null;
  };

  return {
    ok: true,
    data: {
      revenueLTM: getValue('revenue'),
      ebitdaLTM: getValue('ebitda'),
      netIncomeLTM: getValue('netinc'),
      cash: getValue('cashnequsd'),
      totalDebt: getValue('debtusd'),
      marketCap: getValue('marketcap'),
      sharesOutstanding: getValue('sharesbas'),
    },
    raw: res.data,
    latencyMs: res.latencyMs,
  };
}
