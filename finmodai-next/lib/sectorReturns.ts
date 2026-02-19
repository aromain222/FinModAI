/**
 * Sector Returns Calculator
 * 
 * Computes sector performance using ETF proxies with proper trading day alignment
 * Supports: 1D, 1W, 1M, 3M, 6M, YTD
 */

import { fetchDailySeries } from '@/lib/marketData/fetchDailySeries';

export type SectorPeriod = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'YTD' | 'MAX';
export type SectorQualityLevel = 'high' | 'medium' | 'low';

export interface SectorReturn {
  sector: string;
  ticker: string;
  startClose: number;
  endClose: number;
  returnPct: number;
  asOfDate: string; // ISO date string of end_close date
  startDate: string; // ISO date string of start_close date
  provider?: string;
  quality?: {
    level: SectorQualityLevel;
    warnings: string[];
  };
}

export interface SectorReturnsResult {
  period: SectorPeriod;
  returns: SectorReturn[];
  rising: SectorReturn[]; // Top by returnPct desc
  falling: SectorReturn[]; // Bottom by returnPct asc
  generatedAt: string;
  warnings?: string[];
}

/**
 * Sector ETF mapping (all 11 required ETFs)
 */
const SECTOR_ETFS: Array<{ ticker: string; sector: string }> = [
  { ticker: 'XLK', sector: 'Technology' },
  { ticker: 'XLF', sector: 'Financials' },
  { ticker: 'XLV', sector: 'Healthcare' },
  { ticker: 'XLY', sector: 'Consumer Discretionary' },
  { ticker: 'XLP', sector: 'Consumer Staples' },
  { ticker: 'XLI', sector: 'Industrials' },
  { ticker: 'XLE', sector: 'Energy' },
  { ticker: 'XLB', sector: 'Materials' },
  { ticker: 'XLU', sector: 'Utilities' },
  { ticker: 'XLRE', sector: 'Real Estate' },
  { ticker: 'XLC', sector: 'Communication Services' },
];

/**
 * Convert period to date range
 */
export function getPeriodDates(period: SectorPeriod): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  
  const startDate = new Date();
  
  switch (period) {
    case '1D':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '1W':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '1M':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '3M':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '6M':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '1Y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case '5Y':
      startDate.setFullYear(startDate.getFullYear() - 5);
      break;
    case 'MAX':
      startDate.setFullYear(startDate.getFullYear() - 10);
      break;
    case 'YTD':
      startDate.setMonth(0, 1); // January 1st
      break;
  }
  
  startDate.setHours(0, 0, 0, 0);
  
  return { startDate, endDate };
}

function countTradingDaysBetween(start: Date, end: Date): number {
  if (start > end) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function assessSectorQuality(quality: { repeatedValuePct: number; missingPct: number; maxGapDays: number }, warnings: string[]): { level: SectorQualityLevel; warnings: string[] } {
  let level: SectorQualityLevel = 'high';
  if (quality.repeatedValuePct > 0.6 || quality.missingPct > 0.5 || quality.maxGapDays > 10) {
    level = 'low';
  } else if (quality.repeatedValuePct > 0.3 || quality.missingPct > 0.25 || quality.maxGapDays > 5) {
    level = 'medium';
  }
  return { level, warnings };
}

/**
 * Get sector returns for a period
 */
export async function getSectorReturns(period: SectorPeriod): Promise<SectorReturnsResult> {
  const { startDate, endDate } = getPeriodDates(period);
  const startIso = startDate.toISOString().split('T')[0];
  const endIso = endDate.toISOString().split('T')[0];
  const rangePoints = Math.max(5, countTradingDaysBetween(startDate, endDate));

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[sectorReturns] Computing returns for ${period}: ${startIso} to ${endIso}`);
  }
  
  // Fetch data for all ETFs in parallel
  const sectorPromises = SECTOR_ETFS.map(async ({ ticker, sector }) => {
    try {
      const fetch = await fetchDailySeries({
        symbol: ticker,
        rangePoints,
        start: startIso,
        end: endIso,
      });
      const closes = fetch.points;

      if (!closes || closes.length === 0) {
        if (process.env.NODE_ENV !== 'production') console.warn(`[sectorReturns] No data for ${ticker}`);
        return null;
      }
      
      const inWindow = closes.filter((item) => item.date >= startIso && item.date <= endIso);
      if (inWindow.length < 2) {
        if (process.env.NODE_ENV !== 'production') console.warn(`[sectorReturns] Insufficient in-window data for ${ticker}`);
        return null;
      }

      const startPoint = inWindow[0];
      const endPoint = inWindow[inWindow.length - 1];
      const startClose = startPoint?.close ?? null;
      const endClose = endPoint?.close ?? null;
      
      if (!startClose || !endClose || startClose <= 0 || endClose <= 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[sectorReturns] Invalid prices for ${ticker}: start=${startClose}, end=${endClose}`);
        }
        return null;
      }
      
      const returnPct = ((endClose / startClose) - 1) * 100;
      if (!Number.isFinite(returnPct) || Math.abs(returnPct) > 100) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[sectorReturns] Discarding implausible return for ${ticker}: ${returnPct}`);
        }
        return null;
      }
      const quality = assessSectorQuality(fetch.quality, fetch.warnings);

      return {
        sector,
        ticker,
        startClose,
        endClose,
        returnPct,
        asOfDate: endPoint!.date.split('T')[0],
        startDate: startPoint!.date.split('T')[0],
        provider: fetch.provider,
        quality,
      } as SectorReturn;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.error(`[sectorReturns] Error processing ${ticker}:`, error);
      return null;
    }
  });
  
  const results = await Promise.allSettled(sectorPromises);
  
  // Filter out failed/null results
  const returns: SectorReturn[] = results
    .filter((r): r is PromiseFulfilledResult<SectorReturn> => 
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value);
  
  // Split by sign and sort independently (no mixing)
  const positives = returns.filter((r) => r.returnPct > 0).sort((a, b) => b.returnPct - a.returnPct);
  const negatives = returns.filter((r) => r.returnPct < 0).sort((a, b) => a.returnPct - b.returnPct);
  
  // Get top 10 rising and bottom 10 falling
  const rising = positives.slice(0, 10);
  const falling = negatives.slice(0, 10);

  const warnings: string[] = [];
  if (returns.length < 5) {
    warnings.push('Sector breadth limited: insufficient market data returned by providers.');
  }
  if (rising.length === 0) warnings.push('No sectors with positive returns in this window.');
  if (falling.length === 0) warnings.push('No sectors with negative returns in this window.');
  
  return {
    period,
    returns,
    rising,
    falling,
    generatedAt: new Date().toISOString(),
    warnings,
  };
}
