/**
 * Historical Financial Data
 * Fetches 3-5 years of historical financial statements
 */

import { rateLimitedFetch } from '../apiClient';
import { trackAPICall } from '../apiHealth';
import apiCache, { cacheKeys, TTL } from '../apiCache';

export interface HistoricalFinancials {
  ticker: string;
  years: number[];
  revenue: number[];
  ebitda: number[];
  ebit: number[];
  netIncome: number[];
  grossProfit: number[];
  operatingIncome: number[];
  capex: number[];
  depreciation: number[];
  workingCapital: number[];
  totalAssets: number[];
  totalDebt: number[];
  cash: number[];
  sharesOutstanding: number[];
  dataSource: string;
  lastUpdated: string;
}

/**
 * Fetch historical financials (3-5 years)
 */
export async function fetchHistoricalFinancials(
  ticker: string,
  years: number = 5
): Promise<HistoricalFinancials | null> {
  const cleanTicker = ticker.toUpperCase().trim();
  const cacheKey = cacheKeys.historicalFinancials(cleanTicker, years);
  
  // Check cache
  const cached = apiCache.get<HistoricalFinancials>(cacheKey);
  if (cached) {
    console.log(`[fetchHistoricalFinancials] Using cached data for ${cleanTicker}`);
    return cached;
  }
  
  // Try providers in order: FMP → Polygon → IEX Cloud
  let result: HistoricalFinancials | null = null;
  
  // 1. Try FMP (best for historical data)
  if (process.env.FMP_API_KEY) {
    result = await fetchFromFMP(cleanTicker, years);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  // 2. Try Polygon
  if (process.env.POLYGON_API_KEY) {
    result = await fetchFromPolygon(cleanTicker, years);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  // 3. Try IEX Cloud
  if (process.env.IEX_CLOUD_API_KEY) {
    result = await fetchFromIEXCloud(cleanTicker, years);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  console.warn(`[fetchHistoricalFinancials] No historical data available for ${cleanTicker}`);
  return null;
}

/**
 * Fetch from FMP API
 */
async function fetchFromFMP(ticker: string, years: number): Promise<HistoricalFinancials | null> {
  try {
    const apiKey = process.env.FMP_API_KEY;
    
    // Fetch income statements
    const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=${years}&apikey=${apiKey}`;
    const incomeResponse = await trackAPICall('FMP', async () => {
      return await rateLimitedFetch('FMP', incomeUrl);
    });
    
    if (!incomeResponse.ok) return null;
    const incomeData = await incomeResponse.json();
    if (!Array.isArray(incomeData) || incomeData.length === 0) return null;
    
    // Fetch balance sheets
    const balanceUrl = `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?limit=${years}&apikey=${apiKey}`;
    const balanceResponse = await trackAPICall('FMP', async () => {
      return await rateLimitedFetch('FMP', balanceUrl);
    });
    
    let balanceData: any[] = [];
    if (balanceResponse.ok) {
      balanceData = await balanceResponse.json();
    }
    
    // Fetch cash flow statements
    const cashflowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${ticker}?limit=${years}&apikey=${apiKey}`;
    const cashflowResponse = await trackAPICall('FMP', async () => {
      return await rateLimitedFetch('FMP', cashflowUrl);
    });
    
    let cashflowData: any[] = [];
    if (cashflowResponse.ok) {
      cashflowData = await cashflowResponse.json();
    }
    
    // Sort by date (most recent first)
    incomeData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    balanceData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    cashflowData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Extract data arrays
    const yearsArray: number[] = [];
    const revenue: number[] = [];
    const ebitda: number[] = [];
    const ebit: number[] = [];
    const netIncome: number[] = [];
    const grossProfit: number[] = [];
    const operatingIncome: number[] = [];
    const capex: number[] = [];
    const depreciation: number[] = [];
    const workingCapital: number[] = [];
    const totalAssets: number[] = [];
    const totalDebt: number[] = [];
    const cash: number[] = [];
    const sharesOutstanding: number[] = [];
    
    for (let i = 0; i < Math.min(incomeData.length, years); i++) {
      const income = incomeData[i];
      const balance = balanceData[i] || {};
      const cashflow = cashflowData[i] || {};
      
      // Extract year from date
      const date = new Date(income.date);
      yearsArray.push(date.getFullYear());
      
      // Income statement
      revenue.push(income.revenue || 0);
      grossProfit.push(income.grossProfit || 0);
      operatingIncome.push(income.operatingIncome || 0);
      ebitda.push(income.ebitda || 0);
      ebit.push(income.ebit || 0);
      netIncome.push(income.netIncome || 0);
      depreciation.push(income.depreciationAndAmortization || 0);
      
      // Balance sheet
      totalAssets.push(balance.totalAssets || 0);
      totalDebt.push(balance.totalDebt || 0);
      cash.push(balance.cashAndCashEquivalents || 0);
      sharesOutstanding.push(income.weightedAverageShsOut || income.weightedAverageShsOutDil || 0);
      
      // Calculate working capital
      const currentAssets = balance.totalCurrentAssets || 0;
      const currentLiabilities = balance.totalCurrentLiabilities || 0;
      workingCapital.push(currentAssets - currentLiabilities);
      
      // Cash flow
      capex.push(Math.abs(cashflow.capitalExpenditure || 0));
    }
    
    return {
      ticker: ticker.toUpperCase(),
      years: yearsArray,
      revenue,
      ebitda,
      ebit,
      netIncome,
      grossProfit,
      operatingIncome,
      capex,
      depreciation,
      workingCapital,
      totalAssets,
      totalDebt,
      cash,
      sharesOutstanding,
      dataSource: 'FMP',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[fetchFromFMP] Error:', error);
    return null;
  }
}

/**
 * Fetch from Polygon API
 */
async function fetchFromPolygon(ticker: string, years: number): Promise<HistoricalFinancials | null> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    // Polygon API implementation would go here
    // Note: Polygon requires different endpoints for financials
    return null;
  } catch (error) {
    console.error('[fetchFromPolygon] Error:', error);
    return null;
  }
}

/**
 * Fetch from IEX Cloud
 */
async function fetchFromIEXCloud(ticker: string, years: number): Promise<HistoricalFinancials | null> {
  try {
    const apiKey = process.env.IEX_CLOUD_API_KEY;
    const url = `https://cloud.iexapis.com/stable/time-series/FUNDAMENTAL_VALUATIONS/${ticker}?token=${apiKey}`;
    
    const response = await trackAPICall('IEX_CLOUD', async () => {
      return await rateLimitedFetch('IEX_CLOUD', url);
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    
    // IEX Cloud has different data structure
    // Implementation would parse their format
    return null;
  } catch (error) {
    console.error('[fetchFromIEXCloud] Error:', error);
    return null;
  }
}
