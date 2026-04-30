export type PriceForecastResult = {
  ticker: string;
  historical: { dates: string[]; prices: number[] };
  forecast: {
    dates: string[];
    values: number[];
    lower: number[];
    upper: number[];
  } | null;
  model_available: boolean;
  horizon_days: number;
  model_source?: 'timesfm' | 'provider_trend_fallback' | string;
  methodology?: string;
  warnings?: string[];
};

export type RevenueForecastResult = {
  ticker: string;
  historical: { labels: string[]; revenue: number[] };
  forecast: {
    labels: string[];
    values: number[];
    lower: number[];
    upper: number[];
  } | null;
  model_available: boolean;
  implied_growth_rate: number | null;
  model_source?: 'timesfm' | 'historical_financials_fallback' | string;
  methodology?: string;
  warnings?: string[];
};

export async function fetchPriceForecast(ticker: string, horizon = 30): Promise<PriceForecastResult | null> {
  try {
    const res = await fetch(`/api/timesfm?type=price&ticker=${encodeURIComponent(ticker)}&horizon=${horizon}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PriceForecastResult;
  } catch {
    return null;
  }
}

export async function fetchRevenueForecast(ticker: string, quarters = 4): Promise<RevenueForecastResult | null> {
  try {
    const res = await fetch(`/api/timesfm?type=revenue&ticker=${encodeURIComponent(ticker)}&quarters=${quarters}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as RevenueForecastResult;
  } catch {
    return null;
  }
}
