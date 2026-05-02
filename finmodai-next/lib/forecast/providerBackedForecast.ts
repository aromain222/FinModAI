import { fetchHistoricalFinancials } from '@/lib/data/historicalFinancials';
import { getHistoricalChart } from '@/lib/providers/fmp';
import { fetchStooqPrices } from '@/lib/stooq';

export type ProviderBackedPriceForecast = {
  ticker: string;
  historical: { dates: string[]; prices: number[]; volumes?: number[] };
  forecast: {
    dates: string[];
    values: number[];
    lower: number[];
    upper: number[];
  };
  model_available: true;
  horizon_days: number;
  model_source: 'provider_trend_fallback';
  methodology: string;
  warnings: string[];
};

export type ProviderBackedRevenueForecast = {
  ticker: string;
  historical: { labels: string[]; revenue: number[] };
  forecast: {
    labels: string[];
    values: number[];
    lower: number[];
    upper: number[];
  };
  model_available: true;
  implied_growth_rate: number;
  model_source: 'historical_financials_fallback';
  methodology: string;
  warnings: string[];
};

type PriceHistory = { dates: string[]; prices: number[]; volumes?: number[]; warnings: string[] };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

async function fetchYahooPriceHistory(ticker: string, warnings: string[]): Promise<PriceHistory | null> {
  try {
    const symbol = encodeURIComponent(ticker.trim().toUpperCase());
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=6mo&interval=1d`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'CapitalBase/1.0' },
    });
    if (!response.ok) {
      warnings.push(`yahoo:${response.status}`);
      return null;
    }

    const json = await response.json();
    const result = Array.isArray(json?.chart?.result) ? json.chart.result[0] : null;
    const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes: Array<number | null> = Array.isArray(result?.indicators?.quote?.[0]?.close)
      ? result.indicators.quote[0].close
      : [];
    const volumes: Array<number | null> = Array.isArray(result?.indicators?.quote?.[0]?.volume)
      ? result.indicators.quote[0].volume
      : [];
    const points = timestamps
      .map((timestamp, index) => ({
        date: isoDate(new Date(timestamp * 1000)),
        close: Number(closes[index]),
        volume: Number(volumes[index]),
      }))
      .filter((point) => Number.isFinite(point.close) && point.close > 0);

    if (points.length < 30) {
      warnings.push('yahoo:insufficient_price_history');
      return null;
    }

    return {
      dates: points.map((point) => point.date),
      prices: points.map((point) => point.close),
      volumes: points.map((point) => Number.isFinite(point.volume) && point.volume > 0 ? point.volume : 0),
      warnings,
    };
  } catch (error) {
    warnings.push(`yahoo:${error instanceof Error ? error.message : 'fetch_failed'}`);
    return null;
  }
}

async function fetchPriceHistory(ticker: string): Promise<PriceHistory | null> {
  const warnings: string[] = [];
  const normalizedTicker = ticker.trim().toUpperCase();
  const fmp = await getHistoricalChart(ticker, '6M');
  if (fmp.ok && fmp.data.length >= 30) {
    return {
      dates: fmp.data.map((point) => point.date),
      prices: fmp.data.map((point) => point.close),
      volumes: fmp.data.map((point) => point.volume),
      warnings,
    };
  }
  if (!fmp.ok) warnings.push(`fmp:${fmp.error.code}`);

  const yahoo = await fetchYahooPriceHistory(normalizedTicker, warnings);
  if (yahoo) return yahoo;

  const end = new Date();
  const start = addDays(end, -210);
  const stooqSymbols = normalizedTicker === 'GOOGL'
    ? ['GOOGL', 'GOOG']
    : [normalizedTicker];
  for (const symbol of stooqSymbols) {
    const stooq = await fetchStooqPrices(symbol, start, end);
    if (stooq && stooq.prices.length >= 30) {
      const ordered = [...stooq.prices].sort((a, b) => a.date.localeCompare(b.date));
      if (symbol !== normalizedTicker) warnings.push(`stooq_alias:${symbol}`);
      return {
        dates: ordered.map((point) => point.date),
        prices: ordered.map((point) => point.close),
        volumes: ordered.map((point) => point.volume),
        warnings,
      };
    }
  }

  warnings.push('stooq:no_price_history');
  return null;
}

export async function buildProviderBackedPriceForecast(
  ticker: string,
  horizonDays: number,
): Promise<ProviderBackedPriceForecast | null> {
  const horizon = Math.min(180, Math.max(5, Math.round(horizonDays)));
  const history = await fetchPriceHistory(ticker);
  if (!history) return null;

  const dates = history.dates;
  const prices = history.prices.filter((price) => Number.isFinite(price) && price > 0);
  if (dates.length !== prices.length || prices.length < 30) return null;

  const trailing = prices.slice(-Math.min(90, prices.length));
  const returns: number[] = [];
  for (let i = 1; i < trailing.length; i += 1) {
    returns.push(Math.log(trailing[i] / trailing[i - 1]));
  }
  if (returns.length < 20) return null;

  const first = trailing[0];
  const last = trailing[trailing.length - 1];
  const trailingDailyDrift = Math.log(last / first) / Math.max(1, trailing.length - 1);
  const meanDailyReturn = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const dailyDrift = clamp((trailingDailyDrift * 0.75) + (meanDailyReturn * 0.25), -0.0012, 0.0012);
  const dailyVol = clamp(sampleStdDev(returns), 0.004, 0.06);
  const lastDate = new Date(dates[dates.length - 1]);
  const forecastDates: string[] = [];
  const values: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];

  for (let day = 1; day <= horizon; day += 1) {
    const projected = last * Math.exp(dailyDrift * day);
    const band = 1.28 * dailyVol * Math.sqrt(day);
    forecastDates.push(isoDate(addDays(lastDate, day)));
    values.push(Number(projected.toFixed(2)));
    lower.push(Number((projected * Math.exp(-band)).toFixed(2)));
    upper.push(Number((projected * Math.exp(band)).toFixed(2)));
  }

  return {
    ticker: ticker.toUpperCase(),
    historical: { dates, prices, volumes: history.volumes },
    forecast: { dates: forecastDates, values, lower, upper },
    model_available: true,
    horizon_days: horizon,
    model_source: 'provider_trend_fallback',
    methodology: 'Provider-backed fallback: extrapolates trailing price momentum from FMP or Stooq end-of-day history with a volatility band.',
    warnings: history.warnings,
  };
}

export async function buildProviderBackedRevenueForecast(
  ticker: string,
  quarters: number,
): Promise<ProviderBackedRevenueForecast | null> {
  const quarterCount = Math.min(8, Math.max(1, Math.round(quarters)));
  const historical = await fetchHistoricalFinancials(ticker, 5);
  if (!historical || historical.revenue.length < 2) return null;

  const ordered = historical.years
    .map((year, index) => ({ year, revenue: historical.revenue[index] }))
    .filter((point) => Number.isFinite(point.revenue) && point.revenue > 0)
    .sort((a, b) => a.year - b.year);
  if (ordered.length < 2) return null;

  const latestAnnualRevenue = ordered[ordered.length - 1].revenue;
  const growthRates = ordered.slice(1).map((point, index) => point.revenue / ordered[index].revenue - 1);
  const averageGrowth = growthRates.reduce((sum, value) => sum + value, 0) / growthRates.length;
  const impliedGrowthRate = clamp(averageGrowth, -0.1, 0.25);
  const quarterlyGrowth = Math.pow(1 + impliedGrowthRate, 0.25) - 1;
  const latestQuarterRunRate = latestAnnualRevenue / 4;
  const now = new Date();
  const labels: string[] = [];
  const values: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];

  for (let i = 1; i <= quarterCount; i += 1) {
    const value = latestQuarterRunRate * ((1 + quarterlyGrowth) ** i);
    const forecastDate = addDays(now, i * 91);
    const quarter = Math.floor(forecastDate.getMonth() / 3) + 1;
    labels.push(`Q${quarter} ${forecastDate.getFullYear()}`);
    values.push(Number(value.toFixed(0)));
    lower.push(Number((value * 0.94).toFixed(0)));
    upper.push(Number((value * 1.06).toFixed(0)));
  }

  return {
    ticker: ticker.toUpperCase(),
    historical: {
      labels: ordered.map((point) => String(point.year)),
      revenue: ordered.map((point) => point.revenue),
    },
    forecast: { labels, values, lower, upper },
    model_available: true,
    implied_growth_rate: impliedGrowthRate,
    model_source: 'historical_financials_fallback',
    methodology: `Provider-backed fallback: projects quarterly revenue from ${historical.dataSource} annual revenue history using clipped historical growth.`,
    warnings: [],
  };
}
