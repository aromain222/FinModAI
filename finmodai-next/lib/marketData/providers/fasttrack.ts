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
  const apiKey = process.env.FASTTRACK_API_KEY;
  const baseUrl = process.env.FASTTRACK_BASE_URL;
  if (!apiKey) {
    return { provider: 'fasttrack', points: [], warnings: ['FASTTRACK_API_KEY missing'] };
  }
  if (!baseUrl) {
    return {
      provider: 'fasttrack',
      points: [],
      warnings: ['FASTTRACK_BASE_URL missing (provider disabled)'],
    };
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    url.searchParams.set('apikey', apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return {
        provider: 'fasttrack',
        points: [],
        warnings: [`FastTrack response ${response.status}`],
      };
    }

    const json = await response.json();
    const raw = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json?.values)
          ? json.values
          : [];

    const points = raw
      .map((item: any) => {
        const closeRaw = item?.close ?? item?.c ?? item?.adj_close ?? item?.adjClose;
        const close = typeof closeRaw === 'number' ? closeRaw : Number(closeRaw);
        if (!Number.isFinite(close)) return null;
        const dateRaw = item?.date ?? item?.datetime ?? item?.t;
        const date = dateRaw ? new Date(dateRaw).toISOString() : undefined;
        if (!date) return null;
        return { date, close };
      })
      .filter((point: any) => point !== null);

    return { provider: 'fasttrack', points, warnings: [] };
  } catch (error: any) {
    return {
      provider: 'fasttrack',
      points: [],
      warnings: [`FastTrack error: ${error?.message || 'unknown error'}`],
    };
  }
}
