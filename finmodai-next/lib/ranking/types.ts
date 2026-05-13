// ─────────────────────────────────────────────────────────────────────────────
// Ranking engine types
// ─────────────────────────────────────────────────────────────────────────────

export type Signal = 'green' | 'yellow' | 'red';

export type ValuationSignal = 'undervalued' | 'fair' | 'overvalued';

export type ValuationSignalSummary = {
  impliedUpside: number | null;
  impliedGrowth: number | null;
  valuationSignal: ValuationSignal;
  summary: string;
};

export type ScoreBreakdown = {
  /** TimesFM price forecast return mapped to 0–10. */
  forecastSignal: number;
  /** Upcoming catalyst density and direction. */
  catalystStrength: number;
  /** Trend shape of forecast + recent historical momentum. */
  momentum: number;
  /** Earnings proximity and beat-probability setup. */
  earningsSetup: number;
  /** DCF-lite and reverse-DCF valuation context. */
  valuationSignal: number;
  /** Inverted volatility / negative event penalty. */
  riskAdjustment: number;
};

export type CatalystChannel = 'estimate' | 'multiple' | 'positioning' | 'risk' | 'macro';

export type CatalystDirection = 'positive' | 'negative' | 'neutral';

export type RankedCatalyst = {
  title: string;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
  kind: 'company_news' | 'macro' | 'earnings' | 'event';
  channel: CatalystChannel;
  direction: CatalystDirection;
  impactPct: number;
  confidence: number;
  rankScore: number;
  reason: string;
  priced: string;
  estimateRisk: string;
  multipleImpact: string;
  positioningRisk: string;
  horizon: string;
};

export type CryptoMarketRegime = {
  regime: 'risk-on' | 'neutral' | 'risk-off';
  btc7dPct: number;
  btc30dPct: number;
  eth7dPct: number;
  eth30dPct: number;
  dailyVolPct: number;
  leader: 'BTC' | 'ETH' | 'mixed';
  confidence: number;
  source: 'binance' | 'fallback';
  asOf: string;
  pmRead: string;
};

export type AiHedgeFundSentiment = {
  action: string;
  bullish: number;
  bearish: number;
  neutral: number;
  confidence: number;
  bullPct: number;
  netBias: number;
  alignment: 'confirms' | 'conflicts' | 'mixed';
  updatedAt: string;
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
    companyCatalystCount?: number;
    macroCatalystCount?: number;
    dataSource: 'live' | 'mock';
    scoredAt: string;
    valuation?: ValuationSignalSummary;
    catalysts?: RankedCatalyst[];
    cryptoRegime?: CryptoMarketRegime | null;
    aiHedgeFund?: AiHedgeFundSentiment;
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
  what_happened?: string;
  why_it_matters?: string;
  published_at?: string;
  kind?: 'earnings' | 'macro' | 'company_news' | 'event' | 'ownership' | 'transcript' | string;
  direction?: 'positive' | 'negative' | 'neutral' | string;
  magnitude?: 'low' | 'medium' | 'high' | string;
  impact?: string;
  timing?: string | null;
  sources?: Array<{ source?: string; title?: string; url?: string; published_at?: string }>;
  impacted_tickers?: Array<{ ticker?: string; direction?: string; rationale?: string }>;
  impacted_sectors?: Array<{ sector?: string; direction?: string; rationale?: string }>;
  model_impact?: {
    impact_summary?: {
      direction?: string;
      primary_driver?: string;
      valuation_change?: number;
    };
  };
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
