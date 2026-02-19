/**
 * Stooq Integration
 * 
 * Provides historical OHLCV price data from Stooq.com
 * Used for price history, volatility, beta estimation, and charts
 * 
 * Symbol format: {ticker}.us (e.g., AAPL.us)
 * Data provenance is explicitly labeled
 */

import { sampleStandardDeviation, linearRegression, linearRegressionLine } from 'simple-statistics';
import { subDays, format } from 'date-fns';
import { validateNumeric, labelDataProvenance, toFiniteNumber, type DataPoint } from './dataQuality';

export interface StooqPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StooqDataset {
  ticker: string;
  prices: StooqPrice[];
  source: 'stooq';
}

export interface VolatilityResult extends DataPoint<number> {
  annualizedVolatility?: number;
  dailyVolatility?: number;
  dataPoints?: number;
}

export interface BetaResult extends DataPoint<number> {
  beta?: number;
  correlation?: number;
  dataPoints?: number;
}

/**
 * Fetches historical price data from Stooq
 * 
 * @param ticker - Stock ticker (will be converted to {ticker}.us format)
 * @param startDate - Start date (ISO string or Date)
 * @param endDate - End date (ISO string or Date)
 */
export async function fetchStooqPrices(
  ticker: string,
  startDate: Date | string,
  endDate: Date | string = new Date()
): Promise<StooqDataset | null> {
  try {
    const symbol = ticker.toUpperCase().includes('.US') ? ticker : `${ticker.toUpperCase()}.US`;
    
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

    // Stooq CSV format: Date,Open,High,Low,Close,Volume
    // URL: https://stooq.com/q/d/l/?s={symbol}&d1={yyyymmdd}&d2={yyyymmdd}&i=d
    const startStr = format(start, 'yyyyMMdd');
    const endStr = format(end, 'yyyyMMdd');
    
    const url = `https://stooq.com/q/d/l/?s=${symbol}&d1=${startStr}&d2=${endStr}&i=d`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[stooq] Failed to fetch ${symbol}: ${response.status}`);
      return null;
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    if (lines.length < 2) {
      console.warn(`[stooq] No data returned for ${symbol}`);
      return null;
    }

    // Skip header row
    const prices: StooqPrice[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 6) continue;

      const [dateStr, openStr, highStr, lowStr, closeStr, volumeStr] = parts;
      
      const close = parseFloat(closeStr);
      const open = parseFloat(openStr);
      const high = parseFloat(highStr);
      const low = parseFloat(lowStr);
      const volume = parseFloat(volumeStr);

      // Validate all numeric values
      const closeValidation = validateNumeric(close, 'close');
      if (!closeValidation.valid || closeValidation.value === null) continue;

      prices.push({
        date: dateStr,
        open: isNaN(open) ? closeValidation.value : open,
        high: isNaN(high) ? closeValidation.value : high,
        low: isNaN(low) ? closeValidation.value : low,
        close: closeValidation.value,
        volume: isNaN(volume) ? 0 : volume,
      });
    }

    if (prices.length === 0) {
      console.warn(`[stooq] No valid prices parsed for ${symbol}`);
      return null;
    }

    return {
      ticker: symbol,
      prices,
      source: 'stooq',
    };
  } catch (error) {
    console.error(`[stooq] Error fetching ${ticker}:`, error);
    return null;
  }
}

/**
 * Gets the most recent closing price for a ticker
 */
export async function getLastClose(ticker: string): Promise<DataPoint<number> | null> {
  const endDate = new Date();
  const startDate = subDays(endDate, 7); // Get last week to ensure we have data

  const dataset = await fetchStooqPrices(ticker, startDate, endDate);
  
  if (!dataset || dataset.prices.length === 0) {
    return null;
  }

  // Prices are typically in descending order (most recent first)
  const lastPrice = dataset.prices[0];
  const validPrice = toFiniteNumber(lastPrice.close);
  
  if (!validPrice) {
    return null;
  }
  
  return labelDataProvenance(
    validPrice,
    'stooq',
    `Last close as of ${lastPrice.date}`
  );
}

/**
 * Calculates historical volatility (annualized standard deviation of returns)
 * 
 * @param ticker - Stock ticker
 * @param days - Number of days of history (default 252 = 1 year)
 */
export async function calculateHistoricalVolatility(
  ticker: string,
  days: number = 252
): Promise<VolatilityResult | null> {
  const endDate = new Date();
  const startDate = subDays(endDate, days + 10); // Extra days to ensure enough data

  const dataset = await fetchStooqPrices(ticker, startDate, endDate);
  
  if (!dataset || dataset.prices.length < 30) {
    console.warn(`[stooq] Insufficient data for volatility calculation: ${dataset?.prices.length || 0} days`);
    return null;
  }

  // Calculate daily returns
  const returns: number[] = [];
  for (let i = 1; i < dataset.prices.length; i++) {
    const prevClose = dataset.prices[i].close;
    const currClose = dataset.prices[i - 1].close;
    
    if (prevClose > 0) {
      const dailyReturn = (currClose - prevClose) / prevClose;
      returns.push(dailyReturn);
    }
  }

  if (returns.length < 20) {
    console.warn(`[stooq] Insufficient returns for volatility: ${returns.length}`);
    return null;
  }

  // Calculate daily volatility using simple-statistics
  const dailyVol = sampleStandardDeviation(returns);
  
  // Annualize (sqrt(252) for trading days)
  const annualizedVol = toFiniteNumber(dailyVol * Math.sqrt(252));
  
  if (!annualizedVol) {
    return null;
  }

  return {
    value: annualizedVol,
    quality: 'verified',
    source: 'Stooq price history',
    annualizedVolatility: annualizedVol,
    dailyVolatility: toFiniteNumber(dailyVol) || 0,
    dataPoints: returns.length,
  };
}

/**
 * Estimates beta using linear regression against a benchmark
 * 
 * @param ticker - Stock ticker
 * @param benchmark - Benchmark ticker (default SPY)
 * @param days - Number of days of history (default 252 = 1 year)
 */
export async function estimateBeta(
  ticker: string,
  benchmark: string = 'SPY',
  days: number = 252
): Promise<BetaResult | null> {
  const endDate = new Date();
  const startDate = subDays(endDate, days + 10);

  // Fetch both stock and benchmark data
  const [stockData, benchmarkData] = await Promise.all([
    fetchStooqPrices(ticker, startDate, endDate),
    fetchStooqPrices(benchmark, startDate, endDate),
  ]);

  if (!stockData || !benchmarkData) {
    console.warn(`[stooq] Failed to fetch data for beta calculation`);
    return null;
  }

  if (stockData.prices.length < 30 || benchmarkData.prices.length < 30) {
    console.warn(`[stooq] Insufficient data for beta calculation`);
    return null;
  }

  // Align dates and calculate returns
  const stockReturns: number[] = [];
  const benchmarkReturns: number[] = [];

  // Create a map of benchmark prices by date
  const benchmarkMap = new Map(
    benchmarkData.prices.map(p => [p.date, p.close])
  );

  for (let i = 1; i < stockData.prices.length; i++) {
    const currDate = stockData.prices[i - 1].date;
    const prevDate = stockData.prices[i].date;
    
    const stockCurr = stockData.prices[i - 1].close;
    const stockPrev = stockData.prices[i].close;
    
    const benchmarkCurr = benchmarkMap.get(currDate);
    const benchmarkPrev = benchmarkMap.get(prevDate);

    if (benchmarkCurr && benchmarkPrev && stockPrev > 0 && benchmarkPrev > 0) {
      const stockReturn = (stockCurr - stockPrev) / stockPrev;
      const benchmarkReturn = (benchmarkCurr - benchmarkPrev) / benchmarkPrev;
      
      stockReturns.push(stockReturn);
      benchmarkReturns.push(benchmarkReturn);
    }
  }

  if (stockReturns.length < 20) {
    console.warn(`[stooq] Insufficient aligned returns for beta: ${stockReturns.length}`);
    return null;
  }

  // Prepare data points for regression: [[x1, y1], [x2, y2], ...]
  const regressionData: [number, number][] = benchmarkReturns.map((x, i) => [x, stockReturns[i]]);

  try {
    // Linear regression: y = mx + b, where m is beta
    const regression = linearRegression(regressionData);
    const beta = regression.m; // Slope is beta

    // Calculate correlation
    const meanStock = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const meanBenchmark = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;
    
    let covariance = 0;
    let stockVariance = 0;
    let benchmarkVariance = 0;
    
    for (let i = 0; i < stockReturns.length; i++) {
      const stockDiff = stockReturns[i] - meanStock;
      const benchmarkDiff = benchmarkReturns[i] - meanBenchmark;
      covariance += stockDiff * benchmarkDiff;
      stockVariance += stockDiff * stockDiff;
      benchmarkVariance += benchmarkDiff * benchmarkDiff;
    }
    
    const correlation = covariance / Math.sqrt(stockVariance * benchmarkVariance);
    
    const validBeta = toFiniteNumber(beta);
    const validCorrelation = toFiniteNumber(correlation);
    
    if (!validBeta) {
      return null;
    }

    return {
      value: validBeta,
      quality: 'verified',
      source: `Stooq regression vs ${benchmark}`,
      beta: validBeta,
      correlation: validCorrelation || undefined,
      dataPoints: stockReturns.length,
    };
  } catch (error) {
    console.error(`[stooq] Error calculating beta:`, error);
    return null;
  }
}

/**
 * Gets a price chart dataset for visualization
 * Returns data in a format ready for Recharts
 */
export async function getPriceChartData(
  ticker: string,
  days: number = 90
): Promise<Array<{ date: string; price: number }> | null> {
  const endDate = new Date();
  const startDate = subDays(endDate, days);

  const dataset = await fetchStooqPrices(ticker, startDate, endDate);
  
  if (!dataset || dataset.prices.length === 0) {
    return null;
  }

  // Reverse to get chronological order (oldest first)
  return dataset.prices
    .reverse()
    .map(p => ({
      date: p.date,
      price: p.close,
    }));
}
