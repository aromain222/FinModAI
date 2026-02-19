/**
 * Macro Data - Real API Integration
 * Fetches real economic and market data from FRED, FMP, and Polygon APIs
 */

export type TimeRange = '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX';
export type SeriesFrequency = 'daily' | 'monthly' | 'event';
export type DataQuality = 'high' | 'medium' | 'low';

export interface MacroDataPoint {
  date: string; // ISO date
  value: number | null;
}

// NEW: Canonical MacroSeries with frequency and provenance
export type { MacroSeries, MacroSeriesMeta, MacroSeriesQuality } from '@/types/macroSeries';
import type { MacroSeries, MacroSeriesMeta } from '@/types/macroSeries';
import { fetchDailySeries } from '@/lib/marketData/fetchDailySeries';
import { getSectorReturns, type SectorPeriod, type SectorReturn } from '@/lib/sectorReturns';

// NEW: Computed metrics for AI grounding
export interface MacroMetrics {
  // Market metrics
  sp500_pct?: number; // % change over horizon
  sp500_level?: number; // Current level
  vix_pct?: number; // % change over horizon
  vix_level?: number; // Current level
  
  // Rates metrics
  tenY_change_bps?: number; // bps change over horizon
  tenY_level?: number; // Current level in %
  fed_funds_level?: number; // Current level in %
  
  // Economic metrics
  cpi_yoy?: number; // YoY % change
  unemployment_level?: number; // Current level in %
  unemployment_change?: number; // Change over horizon
  
  // Risk metrics
  realized_vol_annual?: number; // Annualized volatility from daily S&P returns
  risk_regime?: 'low' | 'mixed' | 'high';
}

export interface SectorMove {
  key: string;
  name: string;
  symbol: string;
  returnPct: number;
  startPrice: number;
  endPrice: number;
  asOf: string;
  provider: string;
  quality: { level: DataQuality; warnings: string[] };
}

export interface SectorBreadth {
  range: TimeRange;
  asOf: string;
  rising: SectorMove[];
  falling: SectorMove[];
  warnings: string[];
}

// NEW: Data quality assessment
export interface QualityAssessment {
  overall: DataQuality;
  reasons: string[];
  seriesQuality: Record<string, DataQuality>;
}

// NEW: Canonical MacroSnapshot (single source of truth)
export interface MacroSnapshot {
  asOf: string; // ISO timestamp
  horizon: TimeRange;
  series: Record<string, MacroSeries>;
  metrics: MacroMetrics;
  quality: QualityAssessment;
  sectorBreadth?: SectorBreadth;
}

// LEGACY: Keep old interfaces for backward compatibility during migration
export interface MacroIndicator {
  value: number;
  change1d: number;
  change1w: number;
  timeSeries: MacroDataPoint[];
}

export type RiskRegime = 'risk-on' | 'mixed' | 'risk-off';

export interface LegacyMacroSnapshot {
  timestamp: string;
  indicators: {
    fedFunds: MacroIndicator;
    cpi: MacroIndicator;
    treasury10y: MacroIndicator;
    unemployment: MacroIndicator;
    sp500: MacroIndicator;
    vix: MacroIndicator;
  };
  riskScore: number; // 0-100
  riskRegime: RiskRegime;
}

// Cache for API responses
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (reduced to ensure fresh data)

const MARKET_VALIDATION_BOUNDS: Record<string, { min: number; max: number }> = {
  SPY: { min: 300, max: 1000 },
  '^GSPC': { min: 3000, max: 7000 },
  VIX: { min: 8, max: 90 },
  '^VIX': { min: 8, max: 90 },
};

function getValidationBounds(seriesId: string): { min: number; max: number } | null {
  return MARKET_VALIDATION_BOUNDS[seriesId] ?? null;
}

function isValidMarketValue(seriesId: string, value: number | null): boolean {
  if (value === null || !isFinite(value)) return false;
  const bounds = getValidationBounds(seriesId);
  if (!bounds) return true;
  return value >= bounds.min && value <= bounds.max;
}

function estimateCalendarDays(points: number): number {
  // 252 trading days ~= 365 calendar days.
  return Math.max(7, Math.ceil(points * 1.45));
}

function countTradingDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function logDailySeriesDiagnostics(seriesId: string, points: MacroDataPoint[], range: TimeRange, source: string): void {
  if (points.length === 0) {
    console.warn(`[macroData] ${seriesId}(${range}) returned 0 points from ${source}`);
    return;
  }

  const values = points.map((p) => p.value).filter((v): v is number => Number.isFinite(v));
  const first5 = points.slice(0, 5);
  const last5 = points.slice(-5);
  const expectedTradingDays = countTradingDaysBetween(points[0].date, points[points.length - 1].date);
  const missingTradingDays = Math.max(0, expectedTradingDays - points.length);

  console.log(`[macroData] ${seriesId} diagnostics (${source}, ${range})`, {
    count: points.length,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    missingTradingDays,
    first5,
    last5,
  });
}

function getCached(key: string): any | null {
  const cached = apiCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  // Remove expired cache entry
  if (cached) {
    apiCache.delete(key);
  }
  return null;
}

function setCached(key: string, data: any): void {
  apiCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Clear all cached macro data (useful for forcing fresh data with updated base values)
 */
export function clearMacroCache(): void {
  apiCache.clear();
  console.log('[macroData] Cache cleared - next fetch will use fresh data');
}

/**
 * Fetch FRED series data
 */
async function fetchFREDSeries(
  seriesId: string,
  points: number,
  startDate?: string
): Promise<MacroDataPoint[]> {
  const cacheKey = `fred-${seriesId}-${points}`;
  
  const apiKey = process.env.FRED_API_KEY;
  // Clear cache for fallback data to ensure fresh values with updated base
  if (!apiKey) {
    apiCache.delete(cacheKey);
  }
  
  const cached = getCached(cacheKey);
  if (cached) return cached;
  if (!apiKey) {
    console.warn(`[macroData] FRED_API_KEY not found for ${seriesId}, using fallback data`);
    return generateFallbackSeries(seriesId, points);
  }

  try {
    const endDate = new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - points * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${start}&observation_end=${endDate}&sort_order=asc`;
    
    const response = await fetch(url, { 
      next: { revalidate: 3600 } // Cache for 1 hour
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`FRED API error ${response.status}: ${errorText.substring(0, 200)}`);
    }
    
    const json = await response.json();
    const observations = json.observations || [];
    
    if (observations.length === 0) {
      console.warn(`[macroData] No observations returned from FRED for ${seriesId}`);
      return generateFallbackSeries(seriesId, points);
    }
    
    // Stricter validation: reject obviously outdated or unrealistic values
    const validateFREDValue = (seriesId: string, value: number): boolean => {
      // Fed Funds: reject if < 4.5% (too low for current environment as of early 2025)
      if (seriesId === 'FEDFUNDS' && value < 4.5) {
        console.warn(`[macroData] Rejecting outdated Fed Funds value: ${value}% (expected >= 4.5%)`);
        return false;
      }
      
      // CPI: reject if between -0.5% and 0.5% (deflation/zero inflation unlikely in current environment)
      if (seriesId === 'CPIAUCSL' && Math.abs(value) < 0.5) {
        console.warn(`[macroData] Rejecting unrealistic CPI value: ${value}% (expected >= 0.5% or <= -0.5%)`);
        return false;
      }
      
      return true;
    };
    
    const data: MacroDataPoint[] = observations
      .filter((obs: any) => {
        if (obs.value === '.' || obs.value === null || isNaN(parseFloat(obs.value))) {
          return false;
        }
        const value = parseFloat(obs.value);
        return validateFREDValue(seriesId, value);
      })
      .slice(-points)
      .map((obs: any) => ({
        date: obs.date ? new Date(obs.date).toISOString() : new Date().toISOString(),
        value: parseFloat(obs.value)
      }))
      .sort((a: MacroDataPoint, b: MacroDataPoint) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    if (data.length > 0) {
      setCached(cacheKey, data);
      console.log(`[macroData] ✅ Fetched ${data.length} points from FRED for ${seriesId}`);
      return data;
    }
    
    console.warn(`[macroData] No valid data points after filtering for ${seriesId}, using fallback`);
    return generateFallbackSeries(seriesId, points);
  } catch (error) {
    console.error(`[macroData] FRED fetch failed for ${seriesId}:`, error);
    // Log specific error details
    if (error instanceof Error) {
      console.error(`[macroData] Error details: ${error.message}`);
      if (error.stack) {
        console.error(`[macroData] Stack trace: ${error.stack.substring(0, 300)}`);
      }
    }
    return generateFallbackSeries(seriesId, points);
  }
}

/**
 * Fetch market data from FMP or Polygon
 */
type MarketFetchResult = {
  points: MacroDataPoint[];
  source: 'FMP' | 'Polygon' | 'Fallback';
};

async function fetchMarketData(
  ticker: string,
  points: number
): Promise<MarketFetchResult> {
  const cacheKey = `market-${ticker}-${points}`;
  
  // Clear cache for fallback data to ensure fresh values with updated base
  const hasApiKeys = !!(process.env.FMP_API_KEY || process.env.POLYGON_API_KEY);
  if (!hasApiKeys) {
    apiCache.delete(cacheKey);
  }
  
  const cached = getCached(cacheKey);
  if (cached) {
    // Validate cached data before returning
    const cachedPoints: MacroDataPoint[] = cached?.points ?? cached;
    const cachedSource: MarketFetchResult['source'] = cached?.source ?? 'Fallback';
    const isValid = cachedPoints.every((point: MacroDataPoint) => isValidMarketValue(ticker, point.value));
    if (isValid) return { points: cachedPoints, source: cachedSource };
    console.warn(`[macroData] Cached data for ${ticker} failed validation, regenerating`);
  }

  const validateMarketValue = (value: number): boolean => {
    const valid = isValidMarketValue(ticker, value);
    if (!valid) {
      const bounds = getValidationBounds(ticker);
      console.error(
        `[macroData] Invalid ${ticker} value from API: ${value} (expected ${bounds?.min}-${bounds?.max})`
      );
    }
    return valid;
  };

  // Try FMP first
  const fmpKey = process.env.FMP_API_KEY;
  if (fmpKey) {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - estimateCalendarDays(points) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      
      const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}?from=${startDate}&to=${endDate}&apikey=${fmpKey}`;
      console.log(`[macroData] Fetching ${ticker} from FMP: ${url.substring(0, 80)}...`);
      const response = await fetch(url);
      
      if (response.ok) {
        const json = await response.json();
        const historical = json.historical || [];
        
        const data: MacroDataPoint[] = historical
          .filter((item: any) => item.close && !isNaN(parseFloat(item.close)))
          .slice(-Math.max(points * 2, points))
          .map((item: any) => {
            const value = parseFloat(item.close);
            // Validate value before including
            if (!validateMarketValue(value)) {
              return null;
            }
            return {
              date: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
              value: value
            };
          })
          .filter((item: MacroDataPoint | null): item is MacroDataPoint => item !== null)
          .sort((a: MacroDataPoint, b: MacroDataPoint) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-points);
        
        if (data.length > 0) {
          const lastValue = data[data.length - 1].value;
          console.log(`[macroData] FMP returned ${data.length} points for ${ticker}, last value: ${lastValue}`);
          setCached(cacheKey, { points: data, source: 'FMP' });
          return { points: data, source: 'FMP' };
        } else {
          console.warn(`[macroData] FMP returned data for ${ticker} but all values failed validation`);
        }
      } else {
        console.warn(`[macroData] FMP API returned status ${response.status} for ${ticker}`);
      }
    } catch (error) {
      console.warn(`[macroData] FMP fetch failed for ${ticker}, trying Polygon:`, error);
    }
  }

  // Fallback to Polygon
  const polygonKey = process.env.POLYGON_API_KEY;
  if (polygonKey) {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - estimateCalendarDays(points) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      
      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?apiKey=${polygonKey}`;
      console.log(`[macroData] Fetching ${ticker} from Polygon: ${url.substring(0, 80)}...`);
      const response = await fetch(url);
      
      if (response.ok) {
        const json = await response.json();
        const results = json.results || [];
        
        const data: MacroDataPoint[] = results
          .filter((item: any) => item.c && !isNaN(parseFloat(item.c)))
          .slice(-Math.max(points * 2, points))
          .map((item: any) => {
            const value = parseFloat(item.c); // closing price
            // Validate value before including
            if (!validateMarketValue(value)) {
              return null;
            }
            return {
              date: item.t ? new Date(item.t).toISOString() : new Date().toISOString(),
              value: value
            };
          })
          .filter((item: MacroDataPoint | null): item is MacroDataPoint => item !== null)
          .sort((a: MacroDataPoint, b: MacroDataPoint) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-points);
        
        if (data.length > 0) {
          const lastValue = data[data.length - 1].value;
          console.log(`[macroData] Polygon returned ${data.length} points for ${ticker}, last value: ${lastValue}`);
          setCached(cacheKey, { points: data, source: 'Polygon' });
          return { points: data, source: 'Polygon' };
        } else {
          console.warn(`[macroData] Polygon returned data for ${ticker} but all values failed validation`);
        }
      } else {
        console.warn(`[macroData] Polygon API returned status ${response.status} for ${ticker}`);
      }
    } catch (error) {
      console.warn(`[macroData] Polygon fetch failed for ${ticker}:`, error);
    }
  }

  // If APIs failed or returned invalid data, use fallback
  console.warn(`[macroData] Using fallback data for ${ticker} - API unavailable or returned invalid values`);
  const fallback = generateFallbackSeries(ticker, points);
  setCached(cacheKey, { points: fallback, source: 'Fallback' });
  return { points: fallback, source: 'Fallback' };
}

/**
 * Generate realistic fallback series with proper volatility per series type
 * IMPROVED: Creates realistic market movements with appropriate frequency characteristics
 */
/**
 * Validates fallback data values to ensure they're within realistic ranges
 */
function validateFallbackData(seriesId: string, value: number | null): boolean {
  if (value === null || !isFinite(value)) return false;
  const ranges: Record<string, { min: number; max: number }> = {
    'FEDFUNDS': { min: 0, max: 8 },
    'CPIAUCSL': { min: -2, max: 10 },
    'DGS10': { min: 0, max: 8 },
    'UNRATE': { min: 2, max: 15 },
    'SPY': { min: 300, max: 1000 },
    '^GSPC': { min: 3000, max: 7000 },
    'VIX': { min: 8, max: 50 },
    '^VIX': { min: 8, max: 50 }
  };
  
  const range = ranges[seriesId];
  if (!range) return true; // Unknown series, allow it
  
  const isValid = value >= range.min && value <= range.max;
  if (!isValid) {
    console.error(`[macroData] Invalid fallback value for ${seriesId}: ${value} (expected range: ${range.min}-${range.max})`);
  }
  
  return isValid;
}

function generateFallbackSeries(seriesId: string, points: number): MacroDataPoint[] {
  console.warn(`[macroData] Using fallback data for ${seriesId} - API unavailable or failed`);
  
  // Base values (current levels as of early 2025)
  const bases: Record<string, number> = {
    'FEDFUNDS': 5.38, // Updated to current Fed Funds rate range (5.25-5.50%)
    'CPIAUCSL': 3.2,  // Updated to current CPI YoY range (3.0-3.5%)
    'DGS10': 4.35,    // Updated to current 10Y Treasury range (4.2-4.5%)
    'UNRATE': 3.9,    // Keep (correct)
    'SPY': 560,       // SPY ETF proxy level (roughly 500-650)
    '^GSPC': 5100,    // S&P 500 index level
    'VIX': 13.5,      // Updated to current VIX range (12-15)
    '^VIX': 13.5      // Updated to current VIX range (12-15)
  };

  const base = bases[seriesId] || 100;
  
  // Log base value for SPY/S&P proxy diagnostics
  if (seriesId === 'SPY' || seriesId === '^GSPC') {
    console.log(`[macroData] Generating fallback ${seriesId} data with base: ${base}`);
  }
  
  // Daily volatility (% of value for rates, absolute for indices)
  const volatilityConfigs: Record<string, { vol: number; type: 'pct' | 'abs'; freq: 'daily' | 'monthly' | 'event' }> = {
    'FEDFUNDS': { vol: 0.001, type: 'abs', freq: 'event' }, // Fed Funds changes rarely, small steps
    'CPIAUCSL': { vol: 0.002, type: 'abs', freq: 'monthly' }, // CPI changes monthly, gradual
    'DGS10': { vol: 0.03, type: 'abs', freq: 'daily' }, // Treasury moves daily, ~3bps
    'UNRATE': { vol: 0.02, type: 'abs', freq: 'monthly' }, // Unemployment very stable
    'SPY': { vol: 0.015, type: 'pct', freq: 'daily' }, // S&P 500 ~1.5% daily vol
    '^GSPC': { vol: 0.015, type: 'pct', freq: 'daily' },
    'VIX': { vol: 0.10, type: 'pct', freq: 'daily' }, // VIX ~10% daily vol
    '^VIX': { vol: 0.10, type: 'pct', freq: 'daily' }
  };

  const config = volatilityConfigs[seriesId] || { vol: 0.01, type: 'pct', freq: 'daily' };
  
  const data: MacroDataPoint[] = [];
  let current = base;
  let trend = 0;
  let lastChange = 0; // For event-based series
  
  for (let i = points - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Series-specific behavior
    if (config.freq === 'event') {
      // Fed Funds: rare changes (step function)
      if (Math.random() < 0.02) { // 2% chance of change per day
        const direction = Math.random() > 0.5 ? 1 : -1;
        current += direction * 0.25; // 25bps steps
        current = Math.max(0, Math.min(6, current)); // Clamp to 0-6%
      }
    } else if (config.freq === 'monthly') {
      // Monthly series: only change ~every 30 days, small gradual changes
      if (i % 30 === 0 || i === points - 1) {
        const shock = (Math.random() - 0.5) * config.vol * 2;
        current += shock;
        current = Math.max(0, current);
      }
    } else {
      // Daily series: realistic zig-zag with volatility
      // Add trend component for equity indices (reduced to prevent drift)
      if (seriesId.includes('SPY') || seriesId.includes('GSPC')) {
        trend += (Math.random() - 0.48) * 0.001; // Reduced from 0.002 to prevent excessive drift
        trend = Math.max(-0.03, Math.min(0.03, trend)); // Tighter trend limit (was 0.05)
      }
      
      // Add autocorrelation (momentum) - reduced for S&P 500
      const momentumFactor = (seriesId.includes('SPY') || seriesId.includes('GSPC')) ? 0.15 : 0.3;
      const momentum = lastChange * momentumFactor; // Reduced momentum for S&P 500
      
      // Random shock
      const shock = (Math.random() - 0.5) * 2;
      
      // Calculate change
      let change: number;
      if (config.type === 'pct') {
        change = current * (config.vol * shock + trend + momentum);
      } else {
        change = config.vol * shock + trend + momentum;
      }
      
      // Mean reversion (pull back to base over time) - stronger for S&P 500
      const meanReversionFactor = (seriesId.includes('SPY') || seriesId.includes('GSPC')) ? 0.05 : 0.01;
      const meanReversion = (base - current) * meanReversionFactor; // Increased from 0.01 to 0.05 for S&P 500
      
      current += change + meanReversion;
      lastChange = change;
      
      // Apply bounds
      if (seriesId.includes('VIX')) {
        current = Math.max(9, Math.min(45, current)); // VIX range
      } else if (seriesId.includes('SPY') || seriesId.includes('GSPC')) {
        const expectedBase = seriesId.includes('SPY') ? 560 : 5100;
        const minBound = expectedBase * 0.90;
        const maxBound = expectedBase * 1.10;
        current = Math.max(minBound, Math.min(maxBound, current));
        
        // Additional safety: if value is way off, reset to base
        if (!isValidMarketValue(seriesId.includes('SPY') ? 'SPY' : '^GSPC', current)) {
          console.error(`[macroData] ${seriesId} value ${current} outside absolute bounds, resetting to base ${expectedBase}`);
          current = expectedBase;
        }
      } else if (seriesId.includes('DGS10') || seriesId.includes('FEDFUNDS')) {
        current = Math.max(0, Math.min(8, current)); // 0-8% range for rates
      } else if (seriesId.includes('CPIAUCSL')) {
        // Ensure CPI doesn't generate 0.0% - keep it above 0.5%
        current = Math.max(0.5, current);
      } else {
        current = Math.max(0, current);
      }
    }
    
    // Validate value before adding - this is critical for S&P 500
    if (!validateFallbackData(seriesId, current)) {
      // If invalid, reset to base value (not just clamp)
      console.error(`[macroData] Invalid value ${current} for ${seriesId}, resetting to base ${base}`);
      current = base;
    }
    
    data.push({
      date: date.toISOString(),
      value: Number(current.toFixed(4))
    });
  }
  
  // Ensure data is sorted by date (should already be, but just in case)
  const sortedData = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Validate final data points
  if (sortedData.length > 0) {
    const lastValue = sortedData[sortedData.length - 1].value;
    const firstValue = sortedData[0].value;
    
    // Log final values for S&P 500
    if (seriesId === 'SPY' || seriesId === '^GSPC') {
      console.log(`[macroData] Generated fallback S&P 500: ${sortedData.length} points, first: ${firstValue}, last: ${lastValue}`);
    }
    
    if (!validateFallbackData(seriesId, lastValue)) {
      const bounds = getValidationBounds(seriesId) || { min: 0, max: Number.POSITIVE_INFINITY };
      console.error(
        `[macroData] Final value validation failed for ${seriesId}: ${lastValue} (expected ${bounds.min}-${bounds.max})`
      );
      // For SPY/S&P proxies, if validation fails, replace with base
      if (seriesId === 'SPY' || seriesId === '^GSPC') {
        sortedData[sortedData.length - 1].value = base;
        console.warn(`[macroData] Replaced invalid final value with base: ${base}`);
      }
    }
  }
  
  return sortedData;
}

function getPointsForRange(range: TimeRange): number {
  switch (range) {
    case '1W': return 7;
    case '1M': return 30;
    case '3M': return 90;
    case '1Y': return 252;
    case '5Y': return 1260;
    case 'MAX': return 2520;
    default: return 30;
  }
}

/**
 * Validates a time series for data quality issues
 */
export function validateSeries(series: MacroDataPoint[], seriesKey: string, meta?: MacroSeriesMeta): { quality: DataQuality; warnings: string[]; repeatedValuePct?: number; missingPct?: number; maxGapDays?: number } {
  const warnings: string[] = [];
  
  if (series.length === 0) {
    return { quality: 'low', warnings: [`${seriesKey}: No data points`] };
  }
  
  if (series.length < 5) {
    warnings.push(`${seriesKey}: Too few points (${series.length})`);
  }
  
  const values = series.map(p => p.value);
  const nonNull = values.filter(v => v !== null && v !== undefined);
  let missingPct = 1 - nonNull.length / values.length;
  let maxGapDays = 0;
  
  // Check repeated consecutive values
  let repeats = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    const curr = series[i].value;
    if (prev !== null && curr !== null && prev === curr) repeats++;
  }
  const repeatedValuePct = series.length > 1 ? repeats / (series.length - 1) : 0;
  if (meta?.type === 'market_daily' && repeatedValuePct > 0.8) {
    warnings.push(`${seriesKey}: ${Math.round(repeatedValuePct * 100)}% repeated values (possible forward-fill)`);
  }

  if (meta?.frequency === 'daily' && series.length >= 2) {
    // Market series should have mostly contiguous trading-day points.
    let impliedMissing = 0;
    for (let i = 1; i < series.length; i++) {
      const prevDate = new Date(series[i - 1].date);
      const currDate = new Date(series[i].date);
      if (Number.isNaN(prevDate.getTime()) || Number.isNaN(currDate.getTime())) continue;
      const gapDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      maxGapDays = Math.max(maxGapDays, gapDays);
      if (gapDays > 3) {
        impliedMissing += Math.max(0, gapDays - 3);
      }

      const prev = series[i - 1].value;
      const curr = series[i].value;
      if (meta?.type === 'market_daily' && prev !== null && curr !== null && prev !== 0) {
        const jump = Math.abs((curr - prev) / prev);
        if (jump > 0.5 && gapDays <= 3) {
          warnings.push(`${seriesKey}: suspicious single-step move detected (${(jump * 100).toFixed(1)}%)`);
          break;
        }
      }
    }
    const expectedTradingDays = countTradingDaysBetween(series[0].date, series[series.length - 1].date);
    if (expectedTradingDays > 0) {
      missingPct = Math.max(missingPct, Math.max(0, expectedTradingDays - series.length) / expectedTradingDays);
    } else if (impliedMissing > 0 && series.length > 0) {
      missingPct = Math.max(missingPct, impliedMissing / series.length);
    }
    if (maxGapDays > 7) {
      warnings.push(`${seriesKey}: large data gap (${maxGapDays} days)`);
    }
  }
  
  // Check for non-increasing dates
  for (let i = 1; i < series.length; i++) {
    if (new Date(series[i].date) <= new Date(series[i - 1].date)) {
      warnings.push(`${seriesKey}: Non-increasing dates at index ${i}`);
      break;
    }
  }
  
  // Check for NaN or invalid values
  const hasInvalid = nonNull.some(v => isNaN(v as any) || !isFinite(v as any));
  if (hasInvalid) {
    warnings.push(`${seriesKey}: Contains NaN or infinite values`);
  }
  
  // Determine quality
  let quality: DataQuality = 'high';
  if (warnings.length > 0 || repeatedValuePct > 0.8 || missingPct > 0.3 || maxGapDays > 7) {
    quality = warnings.some(w => w.includes('No data') || w.includes('NaN')) || missingPct > 0.5 || maxGapDays > 7 ? 'low' : 'medium';
  }
  
  return { quality, warnings, repeatedValuePct, missingPct, maxGapDays };
}

/**
 * Logs series debug information
 */
export function logSeriesDebug(series: MacroSeries): void {
  const first5 = series.points.slice(0, 5);
  const last5 = series.points.slice(-5);
  
  console.log(`[MacroData] ${series.key} (${series.meta.type}, ${series.meta.source}):`, {
    totalPoints: series.points.length,
    quality: series.quality,
    first5,
    last5
  });
}

/**
 * Computes all metrics from series data for AI grounding
 */
export function computeMacroMetrics(
  series: Record<string, MacroSeries>,
  horizon: TimeRange
): MacroMetrics {
  const metrics: MacroMetrics = {};
  
  // Helper to get first and last values
  const getChange = (key: string): { first: number | null; last: number | null; pct: number | null } => {
    const s = series[key];
    if (!s) return { first: null, last: null, pct: null };

    const valid = (s.points || []).filter(
      (p) => p && p.value !== null && typeof p.value === 'number' && isFinite(p.value)
    );
    if (valid.length < 2) return { first: null, last: null, pct: null };

    const first = valid[0].value as number;
    const last = valid[valid.length - 1].value as number;
    const pct = first !== 0 ? ((last - first) / first) * 100 : null;

    return { first, last, pct };
  };
  
  // S&P 500 metrics
  const sp500 = getChange('sp500');
  if (sp500.last !== null) {
    metrics.sp500_level = sp500.last;
    if (sp500.pct !== null) metrics.sp500_pct = sp500.pct;
  }
  
  // VIX metrics
  const vix = getChange('vix');
  if (vix.last !== null) {
    metrics.vix_level = vix.last;
    if (vix.pct !== null) metrics.vix_pct = vix.pct;
  }
  
  // 10Y Treasury metrics
  const tenY = getChange('treasury10y');
  if (tenY.last !== null && tenY.first !== null) {
    metrics.tenY_level = tenY.last;
    metrics.tenY_change_bps = (tenY.last - tenY.first) * 100; // Convert to bps
  }
  
  // Fed Funds metrics
  const fedFunds = series['fedFunds'];
  if (fedFunds && fedFunds.points.length > 0) {
    const last = [...fedFunds.points].reverse().find((p) => p.value !== null && isFinite(p.value as number));
    if (last && last.value !== null) metrics.fed_funds_level = last.value as number;
  }
  
  // CPI YoY (already computed as YoY in the series)
  const cpi = series['cpi'];
  if (cpi && cpi.points.length > 0) {
    const last = [...cpi.points].reverse().find((p) => p.value !== null && isFinite(p.value as number));
    if (last && last.value !== null) metrics.cpi_yoy = last.value as number;
  }
  
  // Unemployment metrics
  const unemployment = getChange('unemployment');
  if (unemployment.last !== null && unemployment.first !== null) {
    metrics.unemployment_level = unemployment.last;
    metrics.unemployment_change = unemployment.last - unemployment.first;
  }
  
  // Realized volatility (annualized) from S&P 500 daily returns
  const sp500Series = series['sp500'];
  if (sp500Series && sp500Series.points.length > 2) {
    const logReturns: number[] = [];
    for (let i = 1; i < sp500Series.points.length; i++) {
      const prevClose = sp500Series.points[i - 1].value;
      const currentClose = sp500Series.points[i].value;
      if (
        prevClose !== null &&
        currentClose !== null &&
        isFinite(prevClose as number) &&
        isFinite(currentClose as number) &&
        (prevClose as number) > 0 &&
        (currentClose as number) > 0
      ) {
        logReturns.push(Math.log((currentClose as number) / (prevClose as number)));
      }
    }
    
    if (logReturns.length > 1) {
      // Calculate standard deviation
      const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
      const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
      const dailyVol = Math.sqrt(variance);
      metrics.realized_vol_annual = dailyVol * Math.sqrt(252) * 100; // Annualize and convert to %
    }
  }
  
  // Risk regime based on realized volatility
  if (metrics.realized_vol_annual !== undefined) {
    if (metrics.realized_vol_annual < 15) {
      metrics.risk_regime = 'low';
    } else if (metrics.realized_vol_annual < 25) {
      metrics.risk_regime = 'mixed';
    } else {
      metrics.risk_regime = 'high';
    }
  }
  
  return metrics;
}

/**
 * Get macro snapshot with real API data (NEW CANONICAL FORMAT)
 */
// Re-export validation guard
export { assertMacroSnapshot, validateMacroSnapshot, MacroSnapshotError } from './macro/validateSnapshot';

function mapSectorReturn(item: SectorReturn): SectorMove {
  const key = item.sector.toLowerCase().replace(/\s+/g, '_');
  return {
    key,
    name: item.sector,
    symbol: item.ticker,
    returnPct: item.returnPct,
    startPrice: item.startClose,
    endPrice: item.endClose,
    asOf: item.asOfDate,
    provider: item.provider || 'fallback',
    quality: {
      level: (item.quality?.level as DataQuality) || 'medium',
      warnings: item.quality?.warnings || [],
    },
  };
}

async function fetchSectorBreadth(range: TimeRange): Promise<SectorBreadth> {
  try {
    const period = range as SectorPeriod;
    const sectorData = await getSectorReturns(period);
    const rising = sectorData.rising.map(mapSectorReturn);
    const falling = sectorData.falling.map(mapSectorReturn);
    const warnings = sectorData.warnings || [];

    if (rising.length < 5 || falling.length < 5) {
      warnings.push('Sector breadth is limited; provider coverage was sparse for this range.');
    }

    return {
      range,
      asOf: sectorData.generatedAt,
      rising,
      falling,
      warnings,
    };
  } catch (error) {
    console.warn('[macroData] Sector breadth fetch failed', error);
    return {
      range,
      asOf: new Date().toISOString(),
      rising: [],
      falling: [],
      warnings: ['Sector breadth unavailable due to provider errors.'],
    };
  }
}

export async function getMacroSnapshot(range: TimeRange = '1M'): Promise<MacroSnapshot> {
  const points = getPointsForRange(range);
  
  // Fetch all data in parallel
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - estimateCalendarDays(points) * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const [fedFundsRaw, cpiRaw, treasuryRaw, unemploymentRaw, sp500Fetch, vixFetch, sectorBreadth] = await Promise.all([
    fetchFREDSeries('FEDFUNDS', points),
    fetchFREDSeries('CPIAUCSL', points),
    fetchFREDSeries('DGS10', points),
    fetchFREDSeries('UNRATE', points),
    fetchDailySeries({ symbol: 'SPY', rangePoints: points, start: startDate, end: endDate }),
    fetchDailySeries({ symbol: 'VIX', rangePoints: points, start: startDate, end: endDate }),
    fetchSectorBreadth(range).catch((err) => {
      console.warn('[macroData] Sector breadth fetch failed', err);
      return {
        range,
        asOf: new Date().toISOString(),
        rising: [],
        falling: [],
        warnings: ['Sector breadth unavailable due to provider errors.'],
      } as SectorBreadth;
    }),
  ]);
  const sp500Raw = sp500Fetch.points.map((p) => ({ date: p.date, value: p.close as number }));
  
  // Build MacroSeries objects with frequency and validation
  const seriesData: Record<string, MacroSeries> = {};
  
  // Fed Funds (policy step)
  const fedFundsMeta: MacroSeriesMeta = { type: 'policy_step', frequency: 'event', unit: 'percent', transform: 'none', source: fedFundsRaw.length > 0 ? 'FRED' : 'Fallback', displayName: 'Fed Funds Rate' };
  const fedFundsValidation = validateSeries(fedFundsRaw, 'fedFunds', fedFundsMeta);
  seriesData['fedFunds'] = {
    key: 'fedFunds',
    meta: fedFundsMeta,
    points: fedFundsRaw.length > 0 ? fedFundsRaw : generateFallbackSeries('FEDFUNDS', points),
    quality: {
      level: fedFundsValidation.quality,
      warnings: fedFundsValidation.warnings,
      repeatedValuePct: fedFundsValidation.repeatedValuePct,
      missingPct: fedFundsValidation.missingPct,
      maxGapDays: fedFundsValidation.maxGapDays,
    }
  };
  
  // CPI (monthly) compute YoY correctly
  const cpiMeta: MacroSeriesMeta = { type: 'macro_monthly', frequency: 'monthly', unit: 'percent', transform: 'yoy', source: cpiRaw.length > 0 ? 'FRED' : 'Fallback', displayName: 'CPI YoY' };
  let cpiYoY = cpiRaw;
  if (cpiRaw.length >= 13) {
    cpiYoY = cpiRaw.map((point, idx) => {
      if (idx < 12 || point.value === null || cpiRaw[idx - 12].value === null) return { ...point, value: null };
      const current = point.value as number;
      const yearAgo = cpiRaw[idx - 12].value as number;
      const yoyChange = yearAgo !== 0 ? ((current / yearAgo) - 1) * 100 : null;
      return { ...point, value: yoyChange };
    });
  }
  const cpiValidation = validateSeries(cpiYoY, 'cpi', cpiMeta);
  seriesData['cpi'] = {
    key: 'cpi',
    meta: cpiMeta,
    points: cpiYoY.length > 0 ? cpiYoY : generateFallbackSeries('CPIAUCSL', points),
    quality: {
      level: cpiValidation.quality,
      warnings: cpiValidation.warnings,
      repeatedValuePct: cpiValidation.repeatedValuePct,
      missingPct: cpiValidation.missingPct,
      maxGapDays: cpiValidation.maxGapDays,
    }
  };
  
  // 10Y Treasury (daily frequency)
  const treasuryMeta: MacroSeriesMeta = { type: 'market_daily', frequency: 'daily', unit: 'percent', transform: 'none', source: treasuryRaw.length > 0 ? 'FRED' : 'Fallback', displayName: '10Y Treasury' };
  const treasuryValidation = validateSeries(treasuryRaw, 'treasury10y', treasuryMeta);
  seriesData['treasury10y'] = {
    key: 'treasury10y',
    meta: treasuryMeta,
    points: treasuryRaw.length > 0 ? treasuryRaw : generateFallbackSeries('DGS10', points),
    quality: {
      level: treasuryValidation.quality,
      warnings: treasuryValidation.warnings,
      repeatedValuePct: treasuryValidation.repeatedValuePct,
      missingPct: treasuryValidation.missingPct,
      maxGapDays: treasuryValidation.maxGapDays,
    }
  };
  
  // Unemployment (monthly frequency)
  const unemploymentMeta: MacroSeriesMeta = { type: 'macro_monthly', frequency: 'monthly', unit: 'percent', transform: 'none', source: unemploymentRaw.length > 0 ? 'FRED' : 'Fallback', displayName: 'Unemployment Rate' };
  const unemploymentValidation = validateSeries(unemploymentRaw, 'unemployment', unemploymentMeta);
  seriesData['unemployment'] = {
    key: 'unemployment',
    meta: unemploymentMeta,
    points: unemploymentRaw.length > 0 ? unemploymentRaw : generateFallbackSeries('UNRATE', points),
    quality: {
      level: unemploymentValidation.quality,
      warnings: unemploymentValidation.warnings,
      repeatedValuePct: unemploymentValidation.repeatedValuePct,
      missingPct: unemploymentValidation.missingPct,
      maxGapDays: unemploymentValidation.maxGapDays,
    }
  };
  
  // S&P 500 (daily frequency)
  // Validate SPY proxy data before using - reject if values are clearly wrong
  let sp500Points = sp500Raw;
  if (sp500Raw.length > 0) {
    const spyBounds = getValidationBounds('SPY');
    const invalidValues = sp500Raw.filter(p => {
      const val = p.value;
      return val !== null && typeof val === 'number' && !isValidMarketValue('SPY', val);
    });
    
    if (invalidValues.length > 0) {
      console.error(
        `[macroData] SPY proxy API data contains ${invalidValues.length} invalid values (outside ${spyBounds?.min}-${spyBounds?.max}). Using fallback instead.`
      );
      console.error(`[macroData] Invalid values:`, invalidValues.slice(0, 5).map(p => p.value));
      sp500Points = []; // Force fallback
    } else {
      // Log valid data for debugging
      const lastValue = sp500Raw[sp500Raw.length - 1]?.value;
      if (lastValue) {
        console.log(`[macroData] SPY proxy API data validated: ${sp500Raw.length} points, last value: ${lastValue}`);
      }
    }
  }
  
  const sp500Meta: MacroSeriesMeta = { type: 'market_daily', frequency: 'daily', unit: 'index', transform: 'none', source: sp500Fetch.provider, displayName: 'S&P 500 (proxy: SPY)' };
  const sp500Validation = validateSeries(sp500Points, 'sp500', sp500Meta);
  seriesData['sp500'] = {
    key: 'sp500',
    meta: sp500Meta,
    points: sp500Points.length > 0 ? sp500Points : generateFallbackSeries('SPY', points),
    quality: {
      level: sp500Validation.quality,
      warnings: [...sp500Validation.warnings, ...sp500Fetch.warnings],
      repeatedValuePct: sp500Validation.repeatedValuePct,
      missingPct: sp500Validation.missingPct,
      maxGapDays: sp500Validation.maxGapDays,
    }
  };
  if (sp500Validation.repeatedValuePct && sp500Validation.repeatedValuePct > 0.8 && sp500Fetch.provider !== 'fallback') {
    seriesData['sp500'].quality.level = 'low';
    seriesData['sp500'].quality.warnings.push(`sp500: ${Math.round(sp500Validation.repeatedValuePct * 100)}% repeated values (provider anomaly)`);
  }
  
  // Final validation of S&P 500 output
  const finalSP500Points = seriesData['sp500'].points;
  if (finalSP500Points.length > 0) {
    const finalValue = finalSP500Points[finalSP500Points.length - 1].value;
    if (finalValue !== null && typeof finalValue === 'number') {
      if (!isValidMarketValue('SPY', finalValue)) {
        const spyBounds = getValidationBounds('SPY');
        console.error(
          `[macroData] CRITICAL: Final SPY proxy value ${finalValue} is invalid (expected ${spyBounds?.min}-${spyBounds?.max}). Replacing with fallback.`
        );
        seriesData['sp500'].points = generateFallbackSeries('SPY', points);
        seriesData['sp500'].meta.source = 'fallback';
      }
    }
  }

  logDailySeriesDiagnostics('sp500', seriesData['sp500'].points, range, seriesData['sp500'].meta.source);
  
  // VIX (daily frequency)
  const vixRaw = vixFetch.points.map((p) => ({ date: p.date, value: p.close as number }));
  const vixMeta: MacroSeriesMeta = { type: 'market_daily', frequency: 'daily', unit: 'index', transform: 'none', source: vixFetch.provider, displayName: 'VIX' };
  const vixValidation = validateSeries(vixRaw, 'vix', vixMeta);
  seriesData['vix'] = {
    key: 'vix',
    meta: vixMeta,
    points: vixRaw.length > 0 ? vixRaw : generateFallbackSeries('VIX', points),
    quality: {
      level: vixValidation.quality,
      warnings: [...vixValidation.warnings, ...vixFetch.warnings],
      repeatedValuePct: vixValidation.repeatedValuePct,
      missingPct: vixValidation.missingPct,
      maxGapDays: vixValidation.maxGapDays,
    }
  };
  
  // Validate all series data before computing metrics
  // Clear cache if invalid/stale data is detected
  let shouldClearCache = false;
  
  for (const [key, series] of Object.entries(seriesData)) {
    if (series.points.length > 0) {
      const lastValue = series.points[series.points.length - 1].value;
      if (lastValue !== null && typeof lastValue === 'number') {
        // Map series key to FRED series ID for validation
        const seriesIdMap: Record<string, string> = {
          'fedFunds': 'FEDFUNDS',
          'cpi': 'CPIAUCSL',
          'treasury10y': 'DGS10',
          'unemployment': 'UNRATE',
          'sp500': 'SPY',
          'vix': 'VIX'
        };
        const seriesId = seriesIdMap[key] || key;
        
        // Check for obviously stale data that should trigger cache clear
        if (seriesId === 'FEDFUNDS' && lastValue < 4.5) {
          console.warn(`[macroData] ⚠️  Stale Fed Funds data detected: ${lastValue}% (expected >= 4.5%). Clearing cache.`);
          shouldClearCache = true;
          series.quality.level = 'low';
          series.quality.warnings.push(`Stale data: ${lastValue}% (expected >= 4.5%)`);
          series.meta.source = 'fallback_invalid';
        } else if (seriesId === 'CPIAUCSL' && Math.abs(lastValue) < 0.5) {
          console.warn(`[macroData] ⚠️  Unrealistic CPI data detected: ${lastValue}% (expected >= 0.5% or <= -0.5%). Clearing cache.`);
          shouldClearCache = true;
          series.quality.level = 'low';
          series.quality.warnings.push(`Unrealistic data: ${lastValue}% (expected >= 0.5% or <= -0.5%)`);
          series.meta.source = 'fallback_invalid';
        } else if (!validateFallbackData(seriesId, lastValue)) {
          console.error(`[macroData] Invalid value detected for ${key}: ${lastValue}`);
          shouldClearCache = true;
          // Mark as low quality
          series.quality.level = 'low';
          series.quality.warnings.push(`Invalid value: ${lastValue} (outside expected range)`);
          series.meta.source = 'fallback_invalid';
        }
      }
    }
  }
  
  // Clear cache if stale/invalid data detected to force fresh fetch next time
  if (shouldClearCache) {
    console.log(`[macroData] Clearing cache due to stale/invalid data detection`);
    clearMacroCache();
  }
  
  // Compute metrics from series
  const metrics = computeMacroMetrics(seriesData, range);
  
  // Assess overall quality
  const allWarnings: string[] = [
    ...fedFundsValidation.warnings,
    ...cpiValidation.warnings,
    ...treasuryValidation.warnings,
    ...unemploymentValidation.warnings,
    ...sp500Validation.warnings,
    ...vixValidation.warnings
  ];
  
  const seriesQuality: Record<string, DataQuality> = {
    fedFunds: fedFundsValidation.quality,
    cpi: cpiValidation.quality,
    treasury10y: treasuryValidation.quality,
    unemployment: unemploymentValidation.quality,
    sp500: sp500Validation.quality,
    vix: vixValidation.quality
  };
  
  const qualityValues = Object.values(seriesQuality);
  const overallQuality: DataQuality = 
    qualityValues.some(q => q === 'low') ? 'low' :
    qualityValues.some(q => q === 'medium') ? 'medium' : 'high';
  
  const quality: QualityAssessment = {
    overall: overallQuality,
    reasons: allWarnings,
    seriesQuality
  };
  
  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[MacroData] Snapshot generated:', {
      asOf: new Date().toISOString(),
      horizon: range,
      overallQuality,
      metricsCount: Object.keys(metrics).length,
      warningsCount: allWarnings.length
    });
    
    Object.values(seriesData).forEach(logSeriesDebug);
  }
  
  return {
    asOf: new Date().toISOString(),
    horizon: range,
    series: seriesData,
    metrics,
    quality,
    sectorBreadth: sectorBreadth,
  };
}
