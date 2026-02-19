/**
 * Working Capital Details
 * Fetches detailed working capital components (AR, Inventory, AP, Days)
 */

import { rateLimitedFetch } from '../apiClient';
import { trackAPICall } from '../apiHealth';
import apiCache, { cacheKeys, TTL } from '../apiCache';

export interface WorkingCapitalDetails {
  ticker: string;
  // Current balances
  accountsReceivable: number;
  inventory: number;
  accountsPayable: number;
  otherCurrentAssets: number;
  otherCurrentLiabilities: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  netWorkingCapital: number;
  
  // Days calculations
  arDays: number;           // Days Sales Outstanding (DSO)
  inventoryDays: number;    // Days Inventory Outstanding (DIO)
  apDays: number;           // Days Payable Outstanding (DPO)
  cashConversionCycle: number; // DSO + DIO - DPO
  
  // Historical averages (if available)
  arDaysAvg: number | null;
  inventoryDaysAvg: number | null;
  apDaysAvg: number | null;
  
  // As % of revenue
  arPctRevenue: number;
  inventoryPctRevenue: number;
  apPctRevenue: number;
  nwcPctRevenue: number;
  
  dataSource: string;
  lastUpdated: string;
}

/**
 * Fetch working capital details
 */
export async function fetchWorkingCapitalDetails(
  ticker: string,
  revenue?: number
): Promise<WorkingCapitalDetails | null> {
  const cleanTicker = ticker.toUpperCase().trim();
  const cacheKey = cacheKeys.workingCapital(cleanTicker);
  
  // Check cache
  const cached = apiCache.get<WorkingCapitalDetails>(cacheKey);
  if (cached) {
    console.log(`[fetchWorkingCapitalDetails] Using cached data for ${cleanTicker}`);
    return cached;
  }
  
  // Try providers in order: FMP → Polygon → IEX Cloud
  let result: WorkingCapitalDetails | null = null;
  
  // 1. Try FMP
  if (process.env.FMP_API_KEY) {
    result = await fetchFromFMP(cleanTicker, revenue);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  // 2. Try Polygon
  if (process.env.POLYGON_API_KEY) {
    result = await fetchFromPolygon(cleanTicker, revenue);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  // 3. Try IEX Cloud
  if (process.env.IEX_CLOUD_API_KEY) {
    result = await fetchFromIEXCloud(cleanTicker, revenue);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  // If no data available, return null (will use sector defaults)
  console.warn(`[fetchWorkingCapitalDetails] No working capital data available for ${cleanTicker}`);
  return null;
}

/**
 * Fetch from FMP
 */
async function fetchFromFMP(ticker: string, revenue?: number): Promise<WorkingCapitalDetails | null> {
  try {
    const apiKey = process.env.FMP_API_KEY;
    
    // Get balance sheet
    const balanceUrl = `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?limit=1&apikey=${apiKey}`;
    const balanceResponse = await trackAPICall('FMP', async () => {
      return await rateLimitedFetch('FMP', balanceUrl);
    });
    
    if (!balanceResponse.ok) return null;
    const balanceData = await balanceResponse.json();
    if (!Array.isArray(balanceData) || balanceData.length === 0) return null;
    
    const balance = balanceData[0];
    
    // Get income statement for revenue
    let annualRevenue = revenue;
    if (!annualRevenue) {
      const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`;
      const incomeResponse = await trackAPICall('FMP', async () => {
        return await rateLimitedFetch('FMP', incomeUrl);
      });
      
      if (incomeResponse.ok) {
        const incomeData = await incomeResponse.json();
        if (Array.isArray(incomeData) && incomeData.length > 0) {
          annualRevenue = incomeData[0].revenue || 0;
        }
      }
    }
    
    // Extract working capital components
    const accountsReceivable = balance.netReceivables || balance.accountsReceivable || 0;
    const inventory = balance.inventory || 0;
    const accountsPayable = balance.accountPayables || 0;
    const otherCurrentAssets = (balance.totalCurrentAssets || 0) - accountsReceivable - inventory - (balance.cashAndCashEquivalents || 0);
    const otherCurrentLiabilities = (balance.totalCurrentLiabilities || 0) - accountsPayable;
    const totalCurrentAssets = balance.totalCurrentAssets || 0;
    const totalCurrentLiabilities = balance.totalCurrentLiabilities || 0;
    const netWorkingCapital = totalCurrentAssets - totalCurrentLiabilities;
    
    // Calculate days (assuming 365-day year)
    const arDays = annualRevenue && annualRevenue > 0 ? (accountsReceivable / annualRevenue) * 365 : 0;
    const inventoryDays = annualRevenue && annualRevenue > 0 ? (inventory / annualRevenue) * 365 : 0;
    const apDays = annualRevenue && annualRevenue > 0 ? (accountsPayable / annualRevenue) * 365 : 0;
    const cashConversionCycle = arDays + inventoryDays - apDays;
    
    // Calculate as % of revenue
    const arPctRevenue = annualRevenue && annualRevenue > 0 ? accountsReceivable / annualRevenue : 0;
    const inventoryPctRevenue = annualRevenue && annualRevenue > 0 ? inventory / annualRevenue : 0;
    const apPctRevenue = annualRevenue && annualRevenue > 0 ? accountsPayable / annualRevenue : 0;
    const nwcPctRevenue = annualRevenue && annualRevenue > 0 ? netWorkingCapital / annualRevenue : 0;
    
    return {
      ticker: ticker.toUpperCase(),
      accountsReceivable,
      inventory,
      accountsPayable,
      otherCurrentAssets,
      otherCurrentLiabilities,
      totalCurrentAssets,
      totalCurrentLiabilities,
      netWorkingCapital,
      arDays: Math.round(arDays),
      inventoryDays: Math.round(inventoryDays),
      apDays: Math.round(apDays),
      cashConversionCycle: Math.round(cashConversionCycle),
      arDaysAvg: null, // Would need historical data
      inventoryDaysAvg: null,
      apDaysAvg: null,
      arPctRevenue,
      inventoryPctRevenue,
      apPctRevenue,
      nwcPctRevenue,
      dataSource: 'FMP',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[fetchFromFMP] Error:', error);
    return null;
  }
}

/**
 * Fetch from Polygon
 */
async function fetchFromPolygon(ticker: string, revenue?: number): Promise<WorkingCapitalDetails | null> {
  try {
    // Polygon implementation would go here
    return null;
  } catch (error) {
    console.error('[fetchFromPolygon] Error:', error);
    return null;
  }
}

/**
 * Fetch from IEX Cloud
 */
async function fetchFromIEXCloud(ticker: string, revenue?: number): Promise<WorkingCapitalDetails | null> {
  try {
    const apiKey = process.env.IEX_CLOUD_API_KEY;
    const url = `https://cloud.iexapis.com/stable/stock/${ticker}/balance-sheet?token=${apiKey}`;
    
    const response = await trackAPICall('IEX_CLOUD', async () => {
      return await rateLimitedFetch('IEX_CLOUD', url);
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    
    // IEX Cloud has different structure
    // Implementation would parse their format
    return null;
  } catch (error) {
    console.error('[fetchFromIEXCloud] Error:', error);
    return null;
  }
}
