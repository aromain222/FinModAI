/**
 * Data models for Stock Move Explainer
 */

export type PriceBar = {
  date: string; // ISO date string (YYYY-MM-DD)
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
  date: string; // ISO date string (YYYY-MM-DD)
  url?: string;
  source?: string;
};

export type MoveEvent = {
  date: string; // ISO date string (YYYY-MM-DD)
  returnPct: number; // Percentage return (e.g., 8.4 for +8.4%)
  direction: 'up' | 'down';
  rank: number; // 1 = largest move
  close: number; // Closing price on that date
  previousClose?: number; // Previous period's close
  // Benchmark context (optional, populated when benchmark is enabled)
  benchmarkReturnPct?: number; // Benchmark return for same window
  excessReturnPct?: number; // Stock return - benchmark return
  moveClass?: 'idiosyncratic' | 'market-driven' | 'sector-driven'; // Classification
  benchmarkTicker?: 'SPY' | 'QQQ'; // Which benchmark was used
};

export type CatalystEvidence = {
  kind: 'news' | 'event';
  title: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  date?: string; // For events
};

export type Catalyst = {
  label: string; // Short summary (e.g., "Earnings beat + raised guidance")
  confidence: 'high' | 'medium' | 'low';
  evidence: CatalystEvidence[]; // Top evidence (combined)
  eventEvidence?: CatalystEvidence[]; // Event evidence separately
  newsEvidence?: CatalystEvidence[]; // News evidence separately
  rationale: string; // Explanation of why this is a catalyst
};

export type BenchmarkComparison = {
  ticker: string; // e.g., "SPY" or "QQQ"
  returnPct: number; // Benchmark return for the same period
  excessReturnPct: number; // Stock return - benchmark return
  context: 'idiosyncratic' | 'sector-driven' | 'market-driven';
};

export type MoveExplanation = {
  headline: string; // One-line summary
  explanation: string; // 3-6 sentences
  drivers: string[]; // Bullet points
  certainty: 'high' | 'med' | 'low';
  citations: Array<{
    title: string;
    url: string;
    source: string;
    publishedAt: string;
  }>;
  benchmarkComparison?: BenchmarkComparison;
};

export type MoveWithCatalysts = {
  move: MoveEvent;
  catalysts: Catalyst[];
  aiExplanation?: MoveExplanation;
  benchmarkComparison?: BenchmarkComparison;
};

/**
 * Market provider interface for pluggable data sources
 */
export type MarketProviderConfig = {
  ticker: string;
  start: string; // ISO date
  end: string; // ISO date
  interval: 'daily' | 'weekly';
  limit?: number; // For news search
  traceId?: string;
};

export type MarketProvider = {
  /**
   * Get price series (OHLCV bars)
   */
  getPriceSeries(config: MarketProviderConfig): Promise<PriceBar[]>;
  
  /**
   * Get company-specific events (earnings, filings, etc.)
   */
  getCompanyEvents(config: MarketProviderConfig): Promise<EventItem[]>;
  
  /**
   * Search news for the ticker
   */
  searchNews(config: MarketProviderConfig): Promise<NewsItem[]>;
  
  /**
   * Get benchmark series (optional, for SPY/QQQ comparison)
   */
  getBenchmarkSeries?(benchmarkTicker: string, config: Omit<MarketProviderConfig, 'ticker'>): Promise<PriceBar[]>;
};

