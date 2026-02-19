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
  limit,
}: FetchOptions): Promise<MarketFetchResult> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return { provider: 'twelve', points: [], warnings: ['TWELVE_DATA_API_KEY missing'] };
  }

  try {
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1day');
    url.searchParams.set('start_date', start);
    url.searchParams.set('end_date', end);
    url.searchParams.set('outputsize', String(Math.max(limit, 120)));
    url.searchParams.set('apikey', apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return {
        provider: 'twelve',
        points: [],
        warnings: [`TwelveData response ${response.status}`],
      };
    }

    const json = await response.json();
    if (json?.status && json.status !== 'ok') {
      return {
        provider: 'twelve',
        points: [],
        warnings: [`TwelveData error: ${json?.message || 'unknown error'}`],
      };
    }

    const values = Array.isArray(json?.values) ? json.values : [];
    const points = values
      .map((item: any) => {
        const close = typeof item?.close === 'number' ? item.close : Number(item?.close);
        if (!Number.isFinite(close)) return null;
        const date = item?.datetime ? new Date(item.datetime).toISOString() : undefined;
        if (!date) return null;
        return { date, close };
      })
      .filter((point: any) => point !== null);

    return { provider: 'twelve', points, warnings: [] };
  } catch (error: any) {
    return {
      provider: 'twelve',
      points: [],
      warnings: [`TwelveData error: ${error?.message || 'unknown error'}`],
    };
  }
}
