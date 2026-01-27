/**
 * Generic Market Data Provider Types
 * Reusable across the application
 */

export type PriceBar = {
  date: string; // YYYY-MM-DD
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

export type NewsItem = {
  title: string;
  url: string;
  source: string; // Publisher name
  publishedAt: string; // ISO timestamp
  summary?: string;
};

export type EventItem = {
  type: 'earnings' | 'guidance' | 'filing' | 'macro' | 'analyst' | 'other';
  title: string;
  date: string; // YYYY-MM-DD
  url?: string;
  source?: string;
};

export type PriceSeriesParams = {
  ticker: string;
  start: string; // ISO date or YYYY-MM-DD
  end: string; // ISO date or YYYY-MM-DD
  interval?: 'daily' | 'weekly';
};

export type NewsSearchParams = {
  ticker: string;
  start: string; // ISO date or YYYY-MM-DD
  end: string; // ISO date or YYYY-MM-DD
  limit?: number;
};

export type CompanyEventsParams = {
  ticker: string;
  start: string; // ISO date or YYYY-MM-DD
  end: string; // ISO date or YYYY-MM-DD
};

/**
 * Market Provider Interface
 * All providers must implement this interface
 */
export interface MarketProvider {
  /**
   * Get price series (OHLCV bars)
   */
  getPriceSeries(params: PriceSeriesParams): Promise<PriceBar[]>;
  
  /**
   * Search news for the ticker
   */
  searchNews(params: NewsSearchParams): Promise<NewsItem[]>;
  
  /**
   * Get company-specific events (earnings, filings, etc.)
   */
  getCompanyEvents(params: CompanyEventsParams): Promise<EventItem[]>;
}

