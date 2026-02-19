/**
 * Get LTM (Last Twelve Months) Financials
 * Fetches financial data from various sources
 */

import { rateLimitedFetch } from './apiClient';
import { apiHealthMonitor, trackAPICall } from './apiHealth';
import apiCache, { cacheKeys, TTL } from './apiCache';
import { isDemoMode } from '@/lib/demo/isDemoMode';
import { getDemoFundamentals, getDemoQuote, getDemoSnapshot } from '@/lib/data/providers/demoProvider';

export interface LTMFinancials {
  ticker: string;
  companyName?: string;
  sector?: string;
  industry?: string;
  
  // Income statement
  revenue: number;
  grossProfit?: number;
  operatingIncome?: number;
  ebitda?: number;
  netIncome?: number;
  
  // Balance sheet
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  cash?: number;
  totalDebt?: number;
  
  // Derived metrics
  grossMargin?: number;
  operatingMargin?: number;
  ebitdaMargin?: number;
  netMargin?: number;
  
  // Shares
  sharesOutstanding?: number;
  marketCap?: number;
  beta?: number;
  
  // Metadata
  dataSource: string;
  fiscalPeriod?: string;
  lastUpdated: string;
}

/**
 * Check if financials have minimum required data
 */
function hasMinimumData(data: Partial<LTMFinancials>): boolean {
  return !!(data.revenue && data.revenue > 0);
}

/**
 * Fetch LTM financials for a ticker
 * Enhanced with caching, rate limiting, health monitoring, and comprehensive fallback chain
 */
export async function getLTMFinancials(
  ticker: string,
  opts?: { forceLive?: boolean }
): Promise<LTMFinancials | null> {
  const cleanTicker = ticker.toUpperCase().trim();

  if (!isDemoMode()) {
    throw new Error('Demo mode is required; live financial data is disabled.');
  }

  const fundamentals = await getDemoFundamentals(cleanTicker);
  if (!fundamentals) {
    console.warn(`[getLTMFinancials] Demo snapshot not found for ${cleanTicker}`);
    return null;
  }
  const quote = await getDemoQuote(cleanTicker);
  const snapshot = await getDemoSnapshot(cleanTicker);
  const toFinite = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value.replace(/[$,\s]/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const revenue = fundamentals.revenueLTM ?? 0;
  const ebitda = fundamentals.ebitdaLTM ?? 0;
  const netIncome = fundamentals.netIncomeLTM ?? 0;
  const cash = fundamentals.cash ?? 0;
  const totalDebt = fundamentals.totalDebt ?? 0;
  const sharesOutstanding =
    fundamentals.sharesOutstanding ??
    (quote?.sharesOutstanding ?? 0);
  const snapshotMarketCap = toFinite(snapshot?.market_cap);
  const snapshotPrice = toFinite(snapshot?.share_price);
  const derivedMarketCap =
    snapshotPrice !== null && sharesOutstanding && sharesOutstanding > 0
      ? snapshotPrice * sharesOutstanding
      : null;
  const marketCap = quote?.marketCap ?? snapshotMarketCap ?? derivedMarketCap ?? undefined;

  return {
    ticker: cleanTicker,
    companyName: fundamentals.companyName || cleanTicker,
    sector: fundamentals.sector || undefined,
    revenue,
    ebitda,
    netIncome,
    cash,
    totalDebt,
    sharesOutstanding,
    marketCap,
    ebitdaMargin: revenue > 0 && ebitda ? ebitda / revenue : undefined,
    netMargin: revenue > 0 && netIncome ? netIncome / revenue : undefined,
    dataSource: 'demo_snapshots',
    fiscalPeriod: 'LTM',
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Fetch from Financial Modeling Prep API
 */
async function fetchFromFMP(ticker: string): Promise<LTMFinancials | null> {
  try {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      console.log(`[fetchFromFMP] FMP_API_KEY not found in environment`);
      return null;
    }
    console.log(`[fetchFromFMP] Attempting to fetch ${ticker} from FMP API...`);
    
    // Fetch income statement
    const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`;
    console.log(`[fetchFromFMP] Fetching income statement from: ${incomeUrl.replace(apiKey, '***')}`);
    const incomeResponse = await fetch(incomeUrl);
    if (!incomeResponse.ok) {
      console.error(`[fetchFromFMP] Income statement fetch failed: ${incomeResponse.status} ${incomeResponse.statusText}`);
      const errorText = await incomeResponse.text().catch(() => 'Unable to read error');
      console.error(`[fetchFromFMP] Error details: ${errorText.substring(0, 200)}`);
      return null;
    }
    
    const incomeData = await incomeResponse.json();
    if (!Array.isArray(incomeData) || incomeData.length === 0) {
      console.warn(`[fetchFromFMP] Income statement data is empty or not an array for ${ticker}`);
      return null;
    }
    const statement = incomeData[0];
    console.log(`[fetchFromFMP] ✅ Successfully fetched income statement for ${ticker}:`, {
      revenue: statement.revenue,
      ebitda: statement.ebitda,
      netIncome: statement.netIncome,
      period: statement.period
    });
    
    // Fetch profile/quote for shares outstanding and market cap
    let sharesOutstanding: number | undefined;
    let marketCap: number | undefined;
    let currentPrice: number | undefined;
    
    try {
      const profileUrl = `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${apiKey}`;
      const profileResponse = await fetch(profileUrl);
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        if (Array.isArray(profileData) && profileData.length > 0) {
          const profile = profileData[0];
          sharesOutstanding = profile.mktCap && profile.price 
            ? profile.mktCap / profile.price 
            : profile.sharesOutstanding;
          marketCap = profile.mktCap;
          currentPrice = profile.price;
        }
      }
    } catch (profileError) {
      console.warn('[fetchFromFMP] Failed to fetch profile:', profileError);
    }
    
    // If shares outstanding still missing, try to derive from market cap and price
    if (!sharesOutstanding && marketCap && currentPrice && currentPrice > 0) {
      sharesOutstanding = marketCap / currentPrice;
    }
    
    // Also check income statement for weighted average shares
    if (!sharesOutstanding) {
      sharesOutstanding = statement.weightedAverageShsOut || statement.weightedAverageShsOutDil;
    }
    
    const result = {
      ticker: ticker.toUpperCase(),
      companyName: statement.symbol || ticker.toUpperCase(),
      revenue: statement.revenue || 0,
      grossProfit: statement.grossProfit,
      operatingIncome: statement.operatingIncome,
      ebitda: statement.ebitda,
      netIncome: statement.netIncome,
      grossMargin: statement.grossProfitRatio,
      operatingMargin: statement.operatingIncomeRatio,
      ebitdaMargin: statement.ebitda && statement.revenue ? statement.ebitda / statement.revenue : undefined,
      netMargin: statement.netIncomeRatio,
      sharesOutstanding,
      marketCap,
      dataSource: 'FMP',
      fiscalPeriod: statement.period,
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`[fetchFromFMP] ✅ Returning LTM financials for ${ticker}:`, {
      revenue: result.revenue,
      ebitda: result.ebitda,
      netIncome: result.netIncome,
      sharesOutstanding: result.sharesOutstanding,
      dataSource: result.dataSource
    });
    
    return result;
  } catch (error) {
    console.error('[fetchFromFMP] Error:', error);
    return null;
  }
}

/**
 * Fetch from Alpha Vantage API
 */
async function fetchFromAlphaVantage(ticker: string): Promise<LTMFinancials | null> {
  try {
    const apiKey = process.env.ALPHAVANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY;
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data || data.Note) return null; // API limit reached
    
    const revenue = parseFloat(data.RevenueTTM) || 0;
    const grossProfit = parseFloat(data.GrossProfitTTM) || undefined;
    const ebitda = parseFloat(data.EBITDA) || undefined;
    const netIncome = parseFloat(data.ProfitMargin) ? revenue * parseFloat(data.ProfitMargin) : undefined;
    
    return {
      ticker: ticker.toUpperCase(),
      companyName: data.Name,
      sector: data.Sector,
      industry: data.Industry,
      revenue,
      grossProfit,
      ebitda,
      netIncome,
      marketCap: parseFloat(data.MarketCapitalization) || undefined,
      sharesOutstanding: parseFloat(data.SharesOutstanding) || undefined,
      grossMargin: grossProfit && revenue ? grossProfit / revenue : undefined,
      ebitdaMargin: ebitda && revenue ? ebitda / revenue : undefined,
      netMargin: parseFloat(data.ProfitMargin) || undefined,
      dataSource: 'Alpha Vantage',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[fetchFromAlphaVantage] Error:', error);
    return null;
  }
}

/**
 * Generate synthetic financials as fallback
 */
function generateSyntheticFinancials(ticker: string): LTMFinancials {
  // Generate reasonable synthetic data based on ticker
  const baseRevenue = 1000000000; // $1B base
  const randomFactor = Math.random() * 5 + 0.5; // 0.5x to 5.5x
  const revenue = baseRevenue * randomFactor;
  
  const grossMargin = 0.40 + Math.random() * 0.30; // 40-70%
  const operatingMargin = 0.15 + Math.random() * 0.20; // 15-35%
  const ebitdaMargin = 0.20 + Math.random() * 0.25; // 20-45%
  const netMargin = 0.10 + Math.random() * 0.15; // 10-25%
  
  return {
    ticker: ticker.toUpperCase(),
    companyName: `${ticker.toUpperCase()} Inc.`,
    revenue,
    grossProfit: revenue * grossMargin,
    operatingIncome: revenue * operatingMargin,
    ebitda: revenue * ebitdaMargin,
    netIncome: revenue * netMargin,
    grossMargin,
    operatingMargin,
    ebitdaMargin,
    netMargin,
    sharesOutstanding: 100000000, // 100M shares
    marketCap: revenue * 2, // 2x revenue multiple
    dataSource: 'Synthetic',
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Fetch from Nasdaq Data Link (formerly Quandl)
 */
async function fetchFromNasdaqDataLink(ticker: string): Promise<LTMFinancials | null> {
  try {
    const apiKey = process.env.NASDAQ_DATA_LINK_API_KEY;
    if (!apiKey) return null;
    
    // Sharadar Core US Fundamentals (SF1) dataset
    const url = `https://data.nasdaq.com/api/v3/datasets/SHARADAR/SF1/${ticker}_MRQ.json?api_key=${apiKey}`;
    
    const response = await trackAPICall('NASDAQ_DATA_LINK', async () => {
      return await rateLimitedFetch('NASDAQ_DATA_LINK', url);
    });
    
    if (!response.ok) {
      console.warn(`[Nasdaq] Failed to fetch ${ticker}: ${response.status}`);
      return null;
    }
    
    const json = await response.json();
    const data = json?.dataset?.data?.[0]; // Most recent quarter
    
    if (!data || !Array.isArray(data) || data.length < 6) {
      console.warn(`[Nasdaq] No data or insufficient columns for ${ticker}`);
      return null;
    }
    
    // SF1 column mapping (approximate - check actual API docs)
    // Columns: [date, revenue, netinc, equity, assets, liabilities, ...]
    // Defensive: ensure we have enough elements before destructuring
    const date = data[0];
    const revenue = data[1];
    const netIncome = data[2];
    const equity = data[3];
    const assets = data[4];
    const liabilities = data[5];
    
    return {
      ticker: ticker.toUpperCase(),
      companyName: ticker,
      revenue: revenue || 0,
      netIncome: netIncome || undefined,
      totalEquity: equity || undefined,
      totalAssets: assets || undefined,
      totalLiabilities: liabilities || undefined,
      dataSource: 'Nasdaq Data Link',
      fiscalPeriod: date,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`[Nasdaq] Error fetching ${ticker}:`, error.message);
    return null;
  }
}

/**
 * Fetch from IEX Cloud
 */
async function fetchFromIEXCloud(ticker: string): Promise<LTMFinancials | null> {
  try {
    const apiKey = process.env.IEX_CLOUD_API_KEY;
    if (!apiKey) return null;
    
    const url = `https://cloud.iexapis.com/stable/stock/${ticker}/financials?token=${apiKey}`;
    
    const response = await trackAPICall('IEX_CLOUD', async () => {
      return await rateLimitedFetch('IEX_CLOUD', url);
    });
    
    if (!response.ok) {
      console.warn(`[IEX Cloud] Failed to fetch ${ticker}: ${response.status}`);
      return null;
    }
    
    const json = await response.json();
    const financials = json?.financials?.[0]; // Most recent
    
    if (!financials) {
      console.warn(`[IEX Cloud] No financials for ${ticker}`);
      return null;
    }
    
    return {
      ticker: ticker.toUpperCase(),
      companyName: ticker,
      revenue: financials.totalRevenue || 0,
      grossProfit: financials.grossProfit || undefined,
      operatingIncome: financials.operatingIncome || undefined,
      netIncome: financials.netIncome || undefined,
      totalAssets: financials.totalAssets || undefined,
      totalLiabilities: financials.totalLiabilities || undefined,
      cash: financials.cashAndCashEquivalents || undefined,
      totalDebt: financials.totalDebt || undefined,
      dataSource: 'IEX Cloud',
      fiscalPeriod: financials.fiscalDate,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`[IEX Cloud] Error fetching ${ticker}:`, error.message);
    return null;
  }
}
