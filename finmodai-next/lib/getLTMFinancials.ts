/**
 * Centralized LTM Financial Data Fetcher
 * 
 * Fetches Last-Twelve-Months (LTM) financial data from multiple sources
 * with intelligent fallback to ensure NO ZERO VALUES.
 * 
 * Data Sources (in order):
 * 1. Polygon API
 * 2. Finnhub API
 * 3. Financial Modeling Prep (FMP) API
 * 4. Fallback Engine (sector-based estimates)
 */

import { buildFallbackEstimates, type Sector } from '@/lib/fallbackEngine';
import { getSector } from '@/lib/sectorMapping';

export interface LTMFinancials {
  ticker: string;
  companyName: string;
  
  // Income Statement
  revenue: number;          // LTM Revenue ($ millions)
  ebitda: number;           // LTM EBITDA ($ millions)
  ebit: number;             // LTM EBIT ($ millions)
  netIncome: number;        // LTM Net Income ($ millions)
  
  // Balance Sheet
  cash: number;             // Cash & equivalents ($ millions)
  totalDebt: number;        // Total debt ($ millions)
  netDebt: number;          // Total debt - cash ($ millions)
  
  // Market Data
  marketCap: number;        // Market capitalization ($ millions)
  enterpriseValue: number;  // EV = Market Cap + Net Debt ($ millions)
  sharesOutstanding: number; // Shares outstanding (millions)
  price: number;            // Current price per share
  
  // Metadata
  dataSource: 'polygon' | 'finnhub' | 'fmp' | 'alpha-vantage' | 'fallback';
  estimatedFields: string[]; // Fields that were estimated
}

/**
 * Main function: Get LTM financials with guaranteed non-zero values
 */
export async function getLTMFinancials(ticker: string): Promise<LTMFinancials> {
  console.log(`[getLTMFinancials] Fetching data for ${ticker}`);
  
  const cleanTicker = ticker.trim().toUpperCase();
  
  // Try each data source in order
  try {
    // 1. Try Polygon API
    const polygonData = await fetchFromPolygon(cleanTicker);
    if (polygonData && isDataComplete(polygonData)) {
      console.log(`[getLTMFinancials] ✅ Polygon data complete for ${cleanTicker}`);
      return polygonData;
    }
    console.log(`[getLTMFinancials] ⚠️ Polygon data incomplete for ${cleanTicker}`);
  } catch (error) {
    console.log(`[getLTMFinancials] ❌ Polygon failed for ${cleanTicker}:`, error);
  }
  
  try {
    // 2. Try Finnhub API
    const finnhubData = await fetchFromFinnhub(cleanTicker);
    if (finnhubData && isDataComplete(finnhubData)) {
      console.log(`[getLTMFinancials] ✅ Finnhub data complete for ${cleanTicker}`);
      return finnhubData;
    }
    console.log(`[getLTMFinancials] ⚠️ Finnhub data incomplete for ${cleanTicker}`);
  } catch (error) {
    console.log(`[getLTMFinancials] ❌ Finnhub failed for ${cleanTicker}:`, error);
  }
  
  try {
    // 3. Try FMP API
    const fmpData = await fetchFromFMP(cleanTicker);
    if (fmpData && isDataComplete(fmpData)) {
      console.log(`[getLTMFinancials] ✅ FMP data complete for ${cleanTicker}`);
      return fmpData;
    }
    console.log(`[getLTMFinancials] ⚠️ FMP data incomplete for ${cleanTicker}`);
  } catch (error) {
    console.log(`[getLTMFinancials] ❌ FMP failed for ${cleanTicker}:`, error);
  }
  
  try {
    // 4. Try Alpha Vantage API
    const alphaVantageData = await fetchFromAlphaVantage(cleanTicker);
    if (alphaVantageData && isDataComplete(alphaVantageData)) {
      console.log(`[getLTMFinancials] ✅ Alpha Vantage data complete for ${cleanTicker}`);
      return alphaVantageData;
    }
    console.log(`[getLTMFinancials] ⚠️ Alpha Vantage data incomplete for ${cleanTicker}`);
  } catch (error) {
    console.log(`[getLTMFinancials] ❌ Alpha Vantage failed for ${cleanTicker}:`, error);
  }
  
  // 5. All APIs failed - use fallback engine
  console.log(`[getLTMFinancials] 🔄 Using fallback engine for ${cleanTicker}`);
  return buildFallbackFinancials(cleanTicker);
}

/**
 * Check if financial data is complete (no zeros or nulls)
 */
function isDataComplete(data: Partial<LTMFinancials>): boolean {
  const required = ['revenue', 'ebitda', 'ebit', 'netIncome', 'cash', 'totalDebt', 'marketCap'];
  
  for (const field of required) {
    const value = data[field as keyof LTMFinancials];
    if (value === null || value === undefined || value === 0) {
      return false;
    }
  }
  
  return true;
}

/**
 * Fetch from Polygon API
 */
async function fetchFromPolygon(ticker: string): Promise<LTMFinancials | null> {
  const { fetchFromPolygon: polygonFetch, hasMinimumData } = await import('@/lib/data/providers');
  
  const result = await polygonFetch(ticker);
  
  if (!hasMinimumData(result)) {
    return null;
  }
  
  // Convert provider result to LTMFinancials
  return convertProviderResult(result, ticker);
}

/**
 * Fetch from Finnhub API
 */
async function fetchFromFinnhub(ticker: string): Promise<LTMFinancials | null> {
  const { fetchFromFinnhub: finnhubFetch, hasMinimumData } = await import('@/lib/data/providers');
  
  const result = await finnhubFetch(ticker);
  
  if (!hasMinimumData(result)) {
    return null;
  }
  
  return convertProviderResult(result, ticker);
}

/**
 * Fetch from Financial Modeling Prep (FMP) API
 */
async function fetchFromFMP(ticker: string): Promise<LTMFinancials | null> {
  const { fetchFromFMP: fmpFetch, hasMinimumData } = await import('@/lib/data/providers');
  
  const result = await fmpFetch(ticker);
  
  if (!hasMinimumData(result)) {
    return null;
  }
  
  return convertProviderResult(result, ticker);
}

/**
 * Fetch from Alpha Vantage API
 */
async function fetchFromAlphaVantage(ticker: string): Promise<LTMFinancials | null> {
  const { fetchFromAlphaVantage: alphaVantageFetch, hasMinimumData } = await import('@/lib/data/providers');
  
  const result = await alphaVantageFetch(ticker);
  
  if (!hasMinimumData(result)) {
    return null;
  }
  
  return convertProviderResult(result, ticker);
}

/**
 * Convert provider result to LTMFinancials format
 */
function convertProviderResult(
  result: import('@/lib/data/providers').ProviderLTMResult,
  ticker: string
): LTMFinancials | null {
  // Estimate missing fields using available data
  const revenue = result.revenueMillions || (result.marketCapMillions ? result.marketCapMillions * 0.5 : 0);
  const ebitda = result.ebitdaMillions || revenue * 0.25;
  const ebit = ebitda * 0.90;
  const netIncome = result.netIncomeMillions || ebit * 0.79;
  const cash = result.cashMillions || revenue * 0.10;
  const totalDebt = result.debtMillions || ebitda * 2.0;
  const netDebt = totalDebt - cash;
  const marketCap = result.marketCapMillions || netIncome * 20;
  const enterpriseValue = marketCap + netDebt;
  const sharesOutstanding = result.sharesOutstandingMillions || 100;
  const price = marketCap / sharesOutstanding;
  
  // Track which fields were estimated
  const estimatedFields: string[] = [];
  if (!result.revenueMillions) estimatedFields.push('revenue');
  if (!result.ebitdaMillions) estimatedFields.push('ebitda');
  if (!result.netIncomeMillions) estimatedFields.push('netIncome');
  if (!result.cashMillions) estimatedFields.push('cash');
  if (!result.debtMillions) estimatedFields.push('totalDebt');
  if (!result.marketCapMillions) estimatedFields.push('marketCap');
  if (!result.sharesOutstandingMillions) estimatedFields.push('sharesOutstanding');
  
  return {
    ticker,
    companyName: result.companyName || `${ticker} Inc.`,
    revenue,
    ebitda,
    ebit,
    netIncome,
    cash,
    totalDebt,
    netDebt,
    marketCap,
    enterpriseValue,
    sharesOutstanding,
    price,
    dataSource: result.provider,
    estimatedFields,
  };
}

/**
 * Build fallback financials using sector-based estimates
 * NEVER returns zero values - uses realistic sector-based estimates
 */
function buildFallbackFinancials(ticker: string): LTMFinancials {
  console.log(`[buildFallbackFinancials] Generating estimates for ${ticker}`);
  
  // Get sector for intelligent defaults
  const sector: Sector = getSector(ticker);
  
  // Generate realistic base revenue (in millions)
  // Range: $500M to $5B depending on sector
  const baseRevenue = generateRealisticRevenue(sector);
  
  // Use fallback engine with realistic base
  const fallbacks = buildFallbackEstimates({
    sector,
    forecastYears: 1,
    revenueHistory: [{ year: 2023, revenue: baseRevenue }],
    marginHistory: undefined,
    peerMetrics: undefined,
    ltmEbitdaForDebt: baseRevenue * 0.25, // Estimate EBITDA for debt calc
    blendedCostOfDebt: 0.07,
  });
  
  // Calculate financials (all in millions)
  const revenue = fallbacks.revenue.baseYearRevenue;
  const ebitdaMargin = fallbacks.ebitdaMargin.ebitdaMargin;
  const ebitda = revenue * ebitdaMargin;
  const ebit = ebitda * 0.90; // EBIT typically 90% of EBITDA
  const netIncome = ebit * (1 - 0.21); // After 21% tax
  
  // Balance sheet items
  const cash = revenue * 0.10; // 10% of revenue
  const totalDebt = fallbacks.debtCapacity.chosenDebt;
  const netDebt = totalDebt - cash;
  
  // Market data (estimate)
  const peRatio = getSectorPERatio(sector);
  const marketCap = Math.max(netIncome * peRatio, revenue * 2); // At least 2x revenue
  const enterpriseValue = marketCap + netDebt;
  const sharesOutstanding = 100; // Assume 100M shares
  const price = marketCap / sharesOutstanding;
  
  console.log(`[buildFallbackFinancials] Generated for ${ticker} (${sector}):`, {
    revenue: `$${(revenue / 1000).toFixed(1)}B`,
    ebitda: `$${(ebitda / 1000).toFixed(1)}B`,
    ebitdaMargin: `${(ebitdaMargin * 100).toFixed(1)}%`,
    marketCap: `$${(marketCap / 1000).toFixed(1)}B`,
  });
  
  return {
    ticker,
    companyName: `${ticker} Inc.`,
    revenue,
    ebitda,
    ebit,
    netIncome,
    cash,
    totalDebt,
    netDebt,
    marketCap,
    enterpriseValue,
    sharesOutstanding,
    price,
    dataSource: 'fallback',
    estimatedFields: [
      'revenue',
      'ebitda',
      'ebit',
      'netIncome',
      'cash',
      'totalDebt',
      'marketCap',
      'sharesOutstanding',
      'price',
    ],
  };
}

/**
 * Generate realistic revenue based on sector
 * Returns value in millions
 */
function generateRealisticRevenue(sector: Sector): number {
  switch (sector) {
    case 'software':
    case 'internet':
    case 'fintech':
      return 2000 + Math.random() * 3000; // $2B - $5B
    case 'luxury':
    case 'consumer':
      return 1500 + Math.random() * 3500; // $1.5B - $5B
    case 'industrial':
    case 'energy':
      return 3000 + Math.random() * 5000; // $3B - $8B
    case 'telecom':
    case 'financials':
      return 5000 + Math.random() * 10000; // $5B - $15B
    case 'staples':
      return 2000 + Math.random() * 5000; // $2B - $7B
    default:
      return 1000 + Math.random() * 4000; // $1B - $5B
  }
}

/**
 * Get sector-appropriate P/E ratio
 */
function getSectorPERatio(sector: Sector): number {
  switch (sector) {
    case 'software':
    case 'internet':
      return 25;
    case 'fintech':
      return 20;
    case 'luxury':
      return 22;
    case 'consumer':
    case 'staples':
      return 18;
    case 'industrial':
      return 16;
    case 'telecom':
      return 14;
    case 'energy':
      return 12;
    case 'financials':
      return 15;
    default:
      return 18;
  }
}

/**
 * Calculate enterprise value from components
 */
export function calculateEnterpriseValue(
  marketCap: number,
  totalDebt: number,
  cash: number
): number {
  const netDebt = totalDebt - cash;
  const ev = marketCap + netDebt;
  
  console.log(`[calculateEnterpriseValue] Market Cap: $${(marketCap / 1000).toFixed(1)}B, Net Debt: $${(netDebt / 1000).toFixed(1)}B, EV: $${(ev / 1000).toFixed(1)}B`);
  
  return ev;
}

/**
 * Fill missing fields in partial financials
 */
export function fillMissingFinancials(
  partial: Partial<LTMFinancials>,
  ticker: string
): LTMFinancials {
  console.log(`[fillMissingFinancials] Filling gaps for ${ticker}`);
  
  // If we have most data, just fill the gaps
  if (partial.revenue && partial.revenue > 0) {
    const revenue = partial.revenue;
    const ebitda = partial.ebitda || revenue * 0.20;
    const ebit = partial.ebit || ebitda * 0.90;
    const netIncome = partial.netIncome || ebit * 0.79;
    const cash = partial.cash || revenue * 0.10;
    const totalDebt = partial.totalDebt || ebitda * 2.0;
    const netDebt = totalDebt - cash;
    const marketCap = partial.marketCap || netIncome * 20;
    const enterpriseValue = marketCap + netDebt;
    const sharesOutstanding = partial.sharesOutstanding || 100;
    const price = partial.price || marketCap / sharesOutstanding;
    
    const estimatedFields: string[] = [];
    if (!partial.ebitda) estimatedFields.push('ebitda');
    if (!partial.ebit) estimatedFields.push('ebit');
    if (!partial.netIncome) estimatedFields.push('netIncome');
    if (!partial.cash) estimatedFields.push('cash');
    if (!partial.totalDebt) estimatedFields.push('totalDebt');
    if (!partial.marketCap) estimatedFields.push('marketCap');
    
    return {
      ticker,
      companyName: partial.companyName || `${ticker} Inc.`,
      revenue,
      ebitda,
      ebit,
      netIncome,
      cash,
      totalDebt,
      netDebt,
      marketCap,
      enterpriseValue,
      sharesOutstanding,
      price,
      dataSource: partial.dataSource || 'fallback',
      estimatedFields,
    };
  }
  
  // No usable data - use full fallback
  return buildFallbackFinancials(ticker);
}

