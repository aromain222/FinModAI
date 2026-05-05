// ─────────────────────────────────────────────────────────────────────────────
// Ranking engine types
// ─────────────────────────────────────────────────────────────────────────────

export type Signal = 'green' | 'yellow' | 'red';

export type ScoreBreakdown = {
  /** TimesFM price forecast return mapped to 0–10. Weight 0.30. */
  forecastSignal: number;
  /** Upcoming catalyst density and direction. Weight 0.25. */
  catalystStrength: number;
  /** Trend shape of forecast + recent historical momentum. Weight 0.20. */
  momentum: number;
  /** Earnings proximity and beat-probability setup. Weight 0.15. */
  earningsSetup: number;
  /** Inverted volatility / negative event penalty. Weight 0.10. */
  riskAdjustment: number;
};

export type RankedStock = {
  ticker: string;
  /** Weighted composite, clamped [1, 10], rounded to 1 dp. */
  score: number;
  /** green ≥ 7.0 | yellow ≥ 4.0 | red < 4.0 */
  signal: Signal;
  horizonWeeks: number;
  primaryReason: string;
  mainRisk: string;
  breakdown: ScoreBreakdown;
  meta: {
    forecastReturnPct: number | null;
    catalystCount: number;
    dataSource: 'live' | 'mock';
    scoredAt: string;
  };
};

export type RankRequest = {
  tickers: string[];
  /** Default 6 */
  horizonWeeks?: number;
};

export type RankResponse = {
  stocks: RankedStock[];
  scoredAt: string;
  horizonWeeks: number;
};

// ── Upstream API shapes (defensive — only what we actually read) ──────────

export type PriceForecastData = {
  model_available?: boolean;
  forecast?: { values: number[]; dates?: string[] } | null;
  historical?: { prices: number[]; dates?: string[] } | null;
  timesfm_status?: string;
};

export type EventItem = {
  title?: string;
  headline?: string;
  kind?: 'earnings' | 'macro' | 'company_news' | 'event' | 'ownership' | 'transcript' | string;
  direction?: 'positive' | 'negative' | 'neutral' | string;
  magnitude?: 'low' | 'medium' | 'high' | string;
  impact?: string;
  timing?: string | null;
  eventForecast?: {
    direction?: 'positive' | 'negative' | 'neutral';
    confidence?: number;
    priceImpactPct?: number;
  } | null;
  rank?: { score: number; reason?: string } | null;
};

export type EventsPayload = {
  events?: EventItem[];
  items?: EventItem[];
  success?: boolean;
};
