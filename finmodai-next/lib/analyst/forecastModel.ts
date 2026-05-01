export type ForecastModelSource = 'timesfm' | 'flat_fallback' | string;

export type AnalystForecastModelPayload = {
  modelType: 'FORECAST_MODEL';
  title: string;
  ticker: string;
  companyName?: string | null;
  horizonYears: number;
  units: 'USD millions';
  historical: number[];
  forecast: number[];
  growthPath: number[];
  latestActual: number | null;
  terminalForecast: number | null;
  cagr: number | null;
  confidence: number;
  source: ForecastModelSource;
  attributionExplanation?: string | null;
  warning?: string | null;
  generatedAt: string;
};

export function labelForecastSource(source: ForecastModelSource): string {
  if (source === 'timesfm') return 'TimesFM online';
  if (source === 'flat_fallback') return 'Fallback';
  return source.replace(/_/g, ' ');
}

