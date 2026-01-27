/**
 * Yahoo Finance Price Provider
 * Uses yfinance Python script (no API key required)
 */

import { fetchYFinancePrices, type YFinanceRange } from '@/lib/market/yfinance';
import type { PriceBar, PriceSeriesParams } from '../types';
import { normalizeMarketDate, normalizePriceSeries } from '../registry';

/**
 * Determine appropriate yfinance range based on date span
 */
function getYFinanceRange(start: string, end: string): YFinanceRange {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysDiff <= 7) return '1W';
  if (daysDiff <= 30) return '1M';
  if (daysDiff <= 90) return '3M';
  if (daysDiff <= 180) return '6M';
  if (daysDiff <= 365) return '1Y';
  return '5Y';
}

/**
 * Yahoo Finance price provider implementation
 */
export async function fetchPriceYahoo(params: PriceSeriesParams): Promise<PriceBar[]> {
  const { ticker, start, end } = params;
  
  try {
    const range = getYFinanceRange(start, end);
    const yfData = await fetchYFinancePrices(ticker, range);
    
    if (!yfData || !yfData.points || yfData.points.length === 0) {
      throw new Error('No data from yfinance');
    }
    
    // Filter by date range and convert to PriceBar[]
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
    
    // Normalize and sort ascending
    return normalizePriceSeries(bars);
  } catch (error: any) {
    throw new Error(`Yahoo Finance provider failed: ${error?.message || String(error)}`);
  }
}

