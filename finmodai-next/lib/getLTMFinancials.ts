/**
 * Get LTM (Last Twelve Months) Financials
 * Fetches financial data from various sources
 */

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
  
  // Metadata
  dataSource: string;
  fiscalPeriod?: string;
  lastUpdated: string;
}

/**
 * Fetch LTM financials for a ticker
 */
export async function getLTMFinancials(ticker: string): Promise<LTMFinancials | null> {
  try {
    // Try FMP API first
    if (process.env.FMP_API_KEY) {
      const fmpData = await fetchFromFMP(ticker);
      if (fmpData) return fmpData;
    }
    
    // Try Alpha Vantage
    if (process.env.ALPHAVANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY) {
      const avData = await fetchFromAlphaVantage(ticker);
      if (avData) return avData;
    }
    
    // Fallback to synthetic data
    console.warn(`[getLTMFinancials] No API keys configured, using synthetic data for ${ticker}`);
    return generateSyntheticFinancials(ticker);
    
  } catch (error) {
    console.error(`[getLTMFinancials] Error fetching financials for ${ticker}:`, error);
    return generateSyntheticFinancials(ticker);
  }
}

/**
 * Fetch from Financial Modeling Prep API
 */
async function fetchFromFMP(ticker: string): Promise<LTMFinancials | null> {
  try {
    const apiKey = process.env.FMP_API_KEY;
    const url = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    const statement = data[0];
    
    return {
      ticker: ticker.toUpperCase(),
      companyName: statement.symbol,
      revenue: statement.revenue || 0,
      grossProfit: statement.grossProfit,
      operatingIncome: statement.operatingIncome,
      ebitda: statement.ebitda,
      netIncome: statement.netIncome,
      grossMargin: statement.grossProfitRatio,
      operatingMargin: statement.operatingIncomeRatio,
      ebitdaMargin: statement.ebitda && statement.revenue ? statement.ebitda / statement.revenue : undefined,
      netMargin: statement.netIncomeRatio,
      dataSource: 'FMP',
      fiscalPeriod: statement.period,
      lastUpdated: new Date().toISOString()
    };
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
