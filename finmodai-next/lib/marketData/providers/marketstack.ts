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
  const apiKey = process.env.MARKETSTACK_API_KEY;
  if (!apiKey) {
    return { provider: 'marketstack', points: [], warnings: ['MARKETSTACK_API_KEY missing'] };
  }

  try {
    const url = new URL('https://api.marketstack.com/v1/eod');
    url.searchParams.set('access_key', apiKey);
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('date_from', start);
    url.searchParams.set('date_to', end);
    url.searchParams.set('limit', String(Math.max(limit, 200)));

    const response = await fetch(url.toString());
    if (!response.ok) {
      return {
        provider: 'marketstack',
        points: [],
        warnings: [`Marketstack response ${response.status}`],
      };
    }

    const json = await response.json();
    const data = Array.isArray(json?.data) ? json.data : [];
    const points = data
      .map((item: any) => {
        const close = typeof item?.close === 'number' ? item.close : Number(item?.close);
        if (!Number.isFinite(close)) return null;
        const date = item?.date ? new Date(item.date).toISOString() : undefined;
        if (!date) return null;
        return { date, close };
      })
      .filter((point: any) => point !== null);

    return { provider: 'marketstack', points, warnings: [] };
  } catch (error: any) {
    return {
      provider: 'marketstack',
      points: [],
      warnings: [`Marketstack error: ${error?.message || 'unknown error'}`],
    };
  }
}
