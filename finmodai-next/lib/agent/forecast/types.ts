/**
 * CapitalBase Forecast Agent — Types
 *
 * Implements the strict 2-step protocol:
 * 1) REQUEST_DATA
 * 2) FORECAST_RESULT (after data is provided)
 */

export type ForecastAgentInput = {
  userRequest: string;
  ticker?: string;
  horizonYears?: number; // default: 4
  data?: ForecastAgentProvidedData | null;
};

export type ForecastDataSource = 'FINNHUB' | 'POLYGON' | 'FMP' | 'ALPHA_VANTAGE' | 'INTERNAL' | 'UNKNOWN';

export type ForecastRequiredData = {
  priceHistory?: { source: ForecastDataSource; range: string };
  fundamentals?: { source: ForecastDataSource; metrics: string[]; range?: string };
  sectorBenchmarks?: { source: ForecastDataSource; sector: string };
  macroContext?: { source: ForecastDataSource; range?: string };
  newsEvents?: { source: ForecastDataSource; range?: string };
};

export type ForecastAgentRequestData = {
  action: 'REQUEST_DATA';
  required: ForecastRequiredData;
};

export type ForecastAgentScenario = {
  revenueGrowth: number | null; // % / year
  margin: number | null; // EBITDA margin (%)
  valuationMultiple: number | null; // e.g., EV/EBITDA
  impliedCAGR: number | null; // % / year
  rationale: string;
};

export type ForecastAgentForecastResult = {
  action: 'FORECAST_RESULT';
  ticker: string | null;
  horizonYears: number;
  dataCoverage: {
    label: 'Strong' | 'Partial' | 'Weak';
    missing: string[];
  };
  historicalContext: {
    revenueCAGR_5Y: number | null;
    ebitdaMarginAvg_5Y: number | null;
    fcfMarginAvg_5Y: number | null;
    priceCAGR_5Y: number | null;
    currentMultiple: { metric: 'EV/EBITDA'; value: number | null } | null;
  };
  scenarios: {
    base: ForecastAgentScenario;
    bull: ForecastAgentScenario;
    bear: ForecastAgentScenario;
  };
  priceRange: {
    low: number | null;
    base: number | null;
    high: number | null;
  };
  recommendedModels: Array<{ type: 'OPERATING' | 'DCF' | 'COMPS'; reason: string }>;
  keyRisks: string[];
  whatToWatch: string[];
};

export type ForecastAgentOutput = ForecastAgentRequestData | ForecastAgentForecastResult;

export type ForecastAgentProvidedData = {
  priceHistory?: {
    ticker?: string;
    points: Array<{ t: string; close: number }>;
  };
  fundamentals?: {
    ticker?: string;
    currency?: string;
    annual?: Array<{
      periodEndISO?: string;
      year?: number;
      revenue?: number; // $ millions
      ebitda?: number; // $ millions
      fcf?: number; // $ millions
      shares?: number; // millions
    }>;
    ttm?: {
      revenue?: number; // $ millions
      ebitdaMarginPct?: number; // %
      fcf?: number; // $ millions
      shares?: number; // millions
      evToEbitda?: number; // multiple
    };
  };
  sectorBenchmarks?: {
    sector?: string;
    etfTicker?: string;
    priceCAGR_5Y?: number; // %
  };
  macroContext?: unknown;
  newsEvents?: unknown;
};

export type ForecastAgentResponse = {
  traceId: string;
  status: 'ok' | 'error';
  result?: ForecastAgentOutput;
  error?: { code: string; message: string; details?: unknown };
};
