export type ForecastModelSource = 'timesfm' | 'flat_fallback' | string;

export type ForecastNewsWatchItem = {
  title: string;
  timing: string | null;
  impact: string;
  source?: string | null;
  url?: string | null;
  kind?: 'earnings' | 'macro' | 'company_news' | 'event' | 'ownership' | 'transcript';
  sourceType?: 'live_news' | 'strategic_fallback' | 'calendar' | 'market_event';
  rank?: {
    score: number;
    reason: string;
  };
  eventForecast?: {
    expectedResult: string;
    surpriseToWatch?: string;
    transmissionPath?: string;
    stockImpact: string;
    direction: 'positive' | 'negative' | 'neutral';
    confidence: number;
    priceImpactPct?: number;
    priceImpactRangePct?: {
      downside: number;
      upside: number;
    };
  };
};

export type AnalystForecastModelPayload = {
  modelType: 'FORECAST_MODEL';
  forecastKind?: 'revenue' | 'price';
  title: string;
  ticker: string;
  companyName?: string | null;
  horizonYears: number;
  horizonLabel?: string | null;
  units: 'USD millions' | 'USD/share';
  historical: number[];
  forecast: number[];
  lower?: number[];
  upper?: number[];
  historicalDates?: string[];
  forecastDates?: string[];
  growthPath: number[];
  latestActual: number | null;
  terminalForecast: number | null;
  cagr: number | null;
  returnPct?: number | null;
  newsWatch?: ForecastNewsWatchItem[];
  confidence: number;
  source: ForecastModelSource;
  attributionExplanation?: string | null;
  warning?: string | null;
  generatedAt: string;
};

export function labelForecastSource(source: ForecastModelSource): string {
  if (source === 'timesfm') return 'TimesFM online';
  if (source === 'flat_fallback') return 'Fallback';
  if (source === 'provider_trend_fallback') return 'Provider trend';
  return source.replace(/_/g, ' ');
}
