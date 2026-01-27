/**
 * Unified Facts Contract - Single source of truth for market data facts
 * Used across all CapitalBase features (models, market, macro, preview, downloads)
 */

export type FactSourceProvider =
  | 'fmp'
  | 'finnhub'
  | 'polygon'
  | 'alphavantage'
  | 'databento'
  | 'yfinance'
  | 'sec'
  | 'results'
  | 'sheet'
  | 'derived'
  | 'manual'
  | 'unknown';

export type FactConfidence = 'high' | 'medium' | 'low';
export type FactFreshness = 'realtime' | 'delayed' | 'unknown';

export type FactSource = {
  primary?: FactSourceProvider | null;
  fallbacks: FactSourceProvider[];
};

export type Facts = {
  ticker: string;
  companyName?: string | null;
  currency?: string | null;
  exchange?: string | null;

  price?: number | null; // latest price
  sharesOutstanding?: number | null; // shares (in millions if scale is MILLIONS)
  marketCap?: number | null;

  // model-critical derived inputs (still optional; we can compute later)
  asOf?: string | null; // ISO timestamp of the quote/facts
  source: FactSource;
  confidence: FactConfidence;
  freshness: FactFreshness;
  missing: string[]; // list of missing fields that the model would like
};

/**
 * Helper type for Facts with traceId (API response format)
 */
export type FactsResponse = {
  ok: boolean;
  data?: Facts;
  error?: string;
  details?: string;
  traceId: string;
};

