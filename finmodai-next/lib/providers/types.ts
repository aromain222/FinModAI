export type ProviderStatus = 'ok' | 'missing_key' | 'error';

export type MacroMetric = {
  value: number | null;
  unit: string;
  date: string | null;
  seriesId: string;
  source: string;
  status: ProviderStatus;
  error?: string;
};

export type MacroResult = {
  status: ProviderStatus;
  source: string;
  asOf: string;
  data: {
    cpi: MacroMetric;
    unemployment: MacroMetric;
    fedFunds: MacroMetric;
  };
  errors?: string[];
  debug?: Record<string, unknown>;
};

export type MarketPoint = { t: string; close: number };

export type MarketChartResult = {
  status: ProviderStatus;
  source: string;
  asOf: string;
  data: {
    symbol: string;
    range: '1D' | '1W' | '1M';
    points: MarketPoint[];
    changePct: number | null;
  };
  errors?: string[];
  debug?: Record<string, unknown>;
};

export type HeadlineItem = {
  id: string;
  title: string;
  source: string;
  url?: string;
  publishedAt: string;
  region?: string;
  sentiment?: 'bullish' | 'neutral' | 'bearish';
  tags?: string[];
  summary?: string;
};

export type HeadlinesResult = {
  status: ProviderStatus;
  source: string;
  asOf: string;
  data: {
    items: HeadlineItem[];
  };
  errors?: string[];
  debug?: Record<string, unknown>;
};

export type AiEnrichment = {
  macroSummary: {
    tone: 'Bullish' | 'Neutral' | 'Bearish';
    oneLiner: string;
    keyDrivers: string[];
    risks: string[];
  };
  marketNarrative: {
    oneLiner: string;
    drivers: string[];
    watch: string[];
  };
};

export type AiResult = {
  status: 'ok' | 'unavailable' | 'error';
  source: string;
  data?: AiEnrichment;
  errors?: string[];
};

export interface MacroProvider {
  getMacro: (params: { range: string; region: string; traceId: string }) => Promise<MacroResult>;
}

export interface MarketProvider {
  getMarketChart: (params: { symbol: string; range: '1D' | '1W' | '1M'; traceId: string }) => Promise<MarketChartResult>;
}

export interface NewsProvider {
  getHeadlines: (params: {
    range: '1D' | '1W' | '1M';
    region: string;
    sentiment?: 'all' | 'bullish' | 'neutral' | 'bearish';
    traceId: string;
  }) => Promise<HeadlinesResult>;
}
