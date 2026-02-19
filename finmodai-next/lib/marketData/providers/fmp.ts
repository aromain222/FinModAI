import type { MarketFetchResult } from './types';

type FetchOptions = {
  symbol: string;
  start: string;
  end: string;
  limit: number;
};

export async function fetchDailyCloses({
  symbol,
  start,
  end,
}: FetchOptions): Promise<MarketFetchResult> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return { provider: 'fmp', points: [], warnings: ['FMP_API_KEY missing'] };
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?from=${start}&to=${end}&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      return {
        provider: 'fmp',
        points: [],
        warnings: [`FMP response ${response.status}`],
      };
    }

    const json = await response.json();
    const historical = Array.isArray(json?.historical) ? json.historical : [];
    const points = historical
      .map((item: any) => {
        const close = typeof item?.close === 'number' ? item.close : Number(item?.close);
        if (!Number.isFinite(close)) return null;
        const date = item?.date ? new Date(item.date).toISOString() : undefined;
        if (!date) return null;
        return { date, close };
      })
      .filter((point: any) => point !== null);

    return { provider: 'fmp', points, warnings: [] };
  } catch (error: any) {
    return {
      provider: 'fmp',
      points: [],
      warnings: [`FMP error: ${error?.message || 'unknown error'}`],
    };
  }
}
