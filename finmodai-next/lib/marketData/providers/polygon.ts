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
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return { provider: 'polygon', points: [], warnings: ['POLYGON_API_KEY missing'] };
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${start}/${end}?apiKey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      return {
        provider: 'polygon',
        points: [],
        warnings: [`Polygon response ${response.status}`],
      };
    }

    const json = await response.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    const points = results
      .map((item: any) => {
        const close = typeof item?.c === 'number' ? item.c : Number(item?.c);
        if (!Number.isFinite(close)) return null;
        const date = item?.t ? new Date(item.t).toISOString() : undefined;
        if (!date) return null;
        return { date, close };
      })
      .filter((point: any) => point !== null);

    return { provider: 'polygon', points, warnings: [] };
  } catch (error: any) {
    return {
      provider: 'polygon',
      points: [],
      warnings: [`Polygon error: ${error?.message || 'unknown error'}`],
    };
  }
}
