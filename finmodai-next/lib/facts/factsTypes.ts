export type FactSource =
  | 'results'
  | 'sheet'
  | 'fmp'
  | 'stooq'
  | 'polygon'
  | 'finnhub'
  | 'alphavantage'
  | 'sec'
  | 'openai'
  | 'derived'
  | 'unknown'
  | 'unavailable';

export type Fact<T> = {
  value: T | null;
  source: FactSource;
  asOf?: string;
  confidence: 'high' | 'med' | 'low';
  notes?: string[];
};

export type ResolvedModelFacts = {
  ticker: string;
  companyName: Fact<string>;
  sharesOutstandingMm: Fact<number>;
  marketPrice: Fact<number>;
  marketCap: Fact<number>;
  netDebtMillions: Fact<number>;
};
