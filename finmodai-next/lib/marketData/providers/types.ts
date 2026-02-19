export type MarketOHLCPoint = { date: string; close: number | null };

export type MarketFetchProvider =
  | 'polygon'
  | 'fmp'
  | 'twelve'
  | 'marketstack'
  | 'fasttrack'
  | 'stooq'
  | 'fallback';

export type MarketFetchResult = {
  provider: MarketFetchProvider;
  points: MarketOHLCPoint[];
  warnings: string[];
};
