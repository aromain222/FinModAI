/**
 * Price Data Providers
 * Multiple implementations with fallback chain
 */

import { ENV } from '@/lib/env/server';
import { fetchYFinancePrices, type YFinanceRange } from '@/lib/market/yfinance';
import { fetchPolygonSeries } from '@/lib/providers/market/polygon';
import { fetchStooqDailyCSV, filterByRange } from '@/lib/providers/market/stooq';
import { ProviderError, notConfigured, providerFailure } from '@/lib/providers/errors';
import { fetchWithTimeout } from '@/lib/providers/utils';
import type { PriceBar, MarketProviderConfig } from '../types';
import { normalizeMarketDate, normalizePriceSeries } from './registry';
import { getMarketSeries } from '@/lib/market/provider';
import type { MarketRange } from '@/lib/market/provider';

/**
 * Convert MarketRange to date range
 */
function getDateRange(range: MarketRange): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  
  switch (range) {
    case '1D':
      start.setDate(start.getDate() - 1);
      break;
    case '1W':
      start.setDate(start.getDate() - 7);
      break;
    case '1M':
      start.setMonth(start.getMonth() - 1);
      break;
    case '3M':
      start.setMonth(start.getMonth() - 3);
      break;
    case '6M':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1Y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case '5Y':
      start.setFullYear(start.getFullYear() - 5);
      break;
  }
  
  return { start, end };
}

/**
 * Yahoo Finance price provider (fallback, no key needed)
 */
export async function fetchPriceYahoo(config: MarketProviderConfig): Promise<PriceBar[]> {
  const { ticker, start, end, interval, traceId } = config;
  
  try {
    // Determine appropriate range
    const endDate = new Date(end);
    const startDate = new Date(start);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    let range: YFinanceRange = '1M';
    if (daysDiff <= 7) range = '1W';
    else if (daysDiff <= 30) range = '1M';
    else if (daysDiff <= 90) range = '3M';
    else if (daysDiff <= 180) range = '6M';
    else if (daysDiff <= 365) range = '1Y';
    else range = '5Y';
    
    const yfData = await fetchYFinancePrices(ticker, range);
    
    if (!yfData || !yfData.points || yfData.points.length === 0) {
      throw new Error('No data from yfinance');
    }
    
    // Filter by date range and convert
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const bars: PriceBar[] = yfData.points
      .filter(p => {
        if (!p.c || !Number.isFinite(p.c) || p.c <= 0) return false;
        const date = normalizeMarketDate(p.t);
        return date >= startStr && date <= endStr;
      })
      .map(p => ({
        date: normalizeMarketDate(p.t),
        open: p.o ?? undefined,
        high: p.h ?? undefined,
        low: p.l ?? undefined,
        close: p.c!,
        volume: p.v ?? undefined,
      }));
    
    return normalizePriceSeries(bars);
  } catch (error: any) {
    throw providerFailure('yahoo', error?.message || 'yfinance failed', 0);
  }
}

/**
 * Polygon price provider
 */
export async function fetchPricePolygon(config: MarketProviderConfig): Promise<PriceBar[]> {
  const { ticker, start, end, traceId } = config;
  
  if (!ENV.POLYGON_API_KEY) {
    throw notConfigured('polygon');
  }
  
  try {
    // Determine appropriate range
    const endDate = new Date(end);
    const startDate = new Date(start);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    let range: MarketRange = '1M';
    if (daysDiff <= 7) range = '1W';
    else if (daysDiff <= 30) range = '1M';
    else if (daysDiff <= 90) range = '3M';
    else if (daysDiff <= 180) range = '6M';
    else if (daysDiff <= 365) range = '1Y';
    else range = '5Y';
    
    const result = await fetchPolygonSeries({
      symbol: ticker,
      range,
      traceId: traceId || 'move-explainer',
    });
    
    // Filter by date range and convert
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const bars: PriceBar[] = result.data.points
      .filter(p => {
        if (!p.v || !Number.isFinite(p.v) || p.v <= 0) return false;
        const date = normalizeMarketDate(p.t);
        return date >= startStr && date <= endStr;
      })
      .map(p => ({
        date: normalizeMarketDate(p.t),
        close: p.v,
        // Polygon aggregates may not have OHLCV separately in this endpoint
      }));
    
    return normalizePriceSeries(bars);
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('polygon', error?.message || 'polygon fetch failed', 0);
  }
}

/**
 * Alpha Vantage price provider
 */
export async function fetchPriceAlphaVantage(config: MarketProviderConfig): Promise<PriceBar[]> {
  const { ticker, start, end, traceId } = config;
  
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw notConfigured('alphavantage');
  }
  
  try {
    // Alpha Vantage TIME_SERIES_DAILY endpoint
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}&outputsize=full`;
    
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 10000);
    
    if (!res.ok) {
      throw providerFailure('alphavantage', `HTTP ${res.status}`, res.status);
    }
    
    const json = await res.json();
    
    // Check for API errors
    if (json['Error Message']) {
      throw providerFailure('alphavantage', json['Error Message'], 0);
    }
    
    if (json['Note']) {
      // Rate limit note
      throw providerFailure('alphavantage', 'Rate limit exceeded', 429);
    }
    
    const timeSeries = json['Time Series (Daily)'];
    if (!timeSeries || typeof timeSeries !== 'object') {
      throw providerFailure('alphavantage', 'No time series data', 0);
    }
    
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const bars: PriceBar[] = Object.entries(timeSeries)
      .filter(([dateStr]) => {
        const date = normalizeMarketDate(dateStr);
        return date >= startStr && date <= endStr;
      })
      .map(([dateStr, data]: [string, any]) => ({
        date: normalizeMarketDate(dateStr),
        open: parseFloat(data['1. open']),
        high: parseFloat(data['2. high']),
        low: parseFloat(data['3. low']),
        close: parseFloat(data['4. close']),
        volume: parseFloat(data['5. volume']),
      }))
      .filter(bar => Number.isFinite(bar.close) && bar.close > 0);
    
    return normalizePriceSeries(bars);
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('alphavantage', error?.message || 'alphavantage fetch failed', 0);
  }
}

/**
 * Stooq price provider (fallback)
 */
export async function fetchPriceStooq(config: MarketProviderConfig): Promise<PriceBar[]> {
  const { ticker, start, end, traceId } = config;
  
  try {
    const endDate = new Date(end);
    const startDate = new Date(start);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    let range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' = '1M';
    if (daysDiff <= 7) range = '1W';
    else if (daysDiff <= 30) range = '1M';
    else if (daysDiff <= 90) range = '3M';
    else if (daysDiff <= 365) range = '1Y';
    else range = '5Y';
    
    const stooqPoints = filterByRange(
      await fetchStooqDailyCSV(ticker, traceId || 'move-explainer'),
      range
    );
    
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const bars: PriceBar[] = stooqPoints
      .filter(p => {
        const date = normalizeMarketDate(p.t);
        return date >= startStr && date <= endStr;
      })
      .map(p => ({
        date: normalizeMarketDate(p.t),
        close: p.close,
      }))
      .filter(bar => Number.isFinite(bar.close) && bar.close > 0);
    
    return normalizePriceSeries(bars);
  } catch (error: any) {
    throw providerFailure('stooq', error?.message || 'stooq fetch failed', 0);
  }
}

/**
 * Unified price provider with fallback chain
 */
export async function fetchPriceSeriesWithFallback(config: MarketProviderConfig): Promise<{
  bars: PriceBar[];
  provider: string;
  warnings: string[];
}> {
  const { ticker, traceId } = config;
  const warnings: string[] = [];
  
  // Determine provider priority based on env vars
  // Priority: Polygon > Alpha Vantage > Unified Market Provider > Stooq > Yahoo
  
  const providers: Array<{ name: string; fn: () => Promise<PriceBar[]> }> = [];
  
  // 1. Polygon (if key available)
  if (ENV.POLYGON_API_KEY) {
    providers.push({
      name: 'polygon',
      fn: () => fetchPricePolygon(config),
    });
  }
  
  // 2. Alpha Vantage (if key available)
  const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (alphaVantageKey) {
    providers.push({
      name: 'alphavantage',
      fn: () => fetchPriceAlphaVantage(config),
    });
  }
  
  // 3. Unified market provider (uses existing fallback chain)
  providers.push({
    name: 'unified',
    fn: async () => {
      const endDate = new Date(config.end);
      const startDate = new Date(config.start);
      const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      
      let range: MarketRange = '1M';
      if (daysDiff <= 7) range = '1W';
      else if (daysDiff <= 30) range = '1M';
      else if (daysDiff <= 90) range = '3M';
      else if (daysDiff <= 180) range = '6M';
      else if (daysDiff <= 365) range = '1Y';
      else range = '5Y';
      
      const series = await getMarketSeries({
        ticker,
        range,
        traceId: traceId || 'move-explainer',
      });
      
      const startStr = normalizeMarketDate(config.start);
      const endStr = normalizeMarketDate(config.end);
      
      return series.points
        .filter(p => {
          const date = normalizeMarketDate(p.t);
          return date >= startStr && date <= endStr;
        })
        .map(p => ({
          date: normalizeMarketDate(p.t),
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
          volume: p.volume,
        }));
    },
  });
  
  // 4. Stooq (no key needed)
  providers.push({
    name: 'stooq',
    fn: () => fetchPriceStooq(config),
  });
  
  // 5. Yahoo Finance (last resort, no key needed)
  providers.push({
    name: 'yahoo',
    fn: () => fetchPriceYahoo(config),
  });
  
  // Try providers in order
  for (const provider of providers) {
    try {
      const bars = await provider.fn();
      
      if (bars.length >= 2) {
        return {
          bars: normalizePriceSeries(bars),
          provider: provider.name,
          warnings,
        };
      }
      
      warnings.push(`${provider.name}_insufficient_data`);
    } catch (error: any) {
      warnings.push(`${provider.name}_failed:${error?.message || 'unknown'}`);
      // Continue to next provider
    }
  }
  
  // All providers failed
  throw new Error(`All price providers failed for ${ticker}. Last warnings: ${warnings.join(', ')}`);
}

