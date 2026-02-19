import { fetchStooqPrices } from '@/lib/stooq';
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
  try {
    const dataset = await fetchStooqPrices(symbol, start, end);
    if (!dataset || !dataset.prices || dataset.prices.length === 0) {
      return { provider: 'stooq', points: [], warnings: [`Stooq no data for ${symbol}`] };
    }

    const points = dataset.prices
      .map((item) => {
        const close = typeof item?.close === 'number' ? item.close : Number(item?.close);
        if (!Number.isFinite(close)) return null;
        const date = item?.date ? new Date(item.date).toISOString() : undefined;
        if (!date) return null;
        return { date, close };
      })
      .filter((point): point is { date: string; close: number } => point !== null);

    if (points.length === 0) {
      return { provider: 'stooq', points: [], warnings: [`Stooq returned no valid points for ${symbol}`] };
    }

    return { provider: 'stooq', points, warnings: [] };
  } catch (error: any) {
    return {
      provider: 'stooq',
      points: [],
      warnings: [`Stooq error: ${error?.message || 'unknown error'}`],
    };
  }
}
