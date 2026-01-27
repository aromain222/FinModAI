/**
 * External Financial Data Providers
 * 
 * Real implementations for Polygon, Finnhub, and FMP APIs
 * with comprehensive error handling and diagnostics.
 */

export type ProviderName = 'polygon' | 'finnhub' | 'fmp' | 'alpha-vantage';

export type ProviderReason = 
  | 'missing-key' 
  | 'auth' 
  | 'rate-limit' 
  | 'server' 
  | 'no-data' 
  | 'parse-error'
  | 'network-error';

export interface ProviderLTMResult {
  ok: boolean;
  provider: ProviderName;
  status?: number;
  reason?: ProviderReason;
  
  // Financial values in millions
  revenueMillions?: number;
  ebitdaMillions?: number;
  netIncomeMillions?: number;
  marketCapMillions?: number;
  sharesOutstandingMillions?: number;
  cashMillions?: number;
  debtMillions?: number;
  
  // Metadata
  companyName?: string;
  raw?: unknown; // Small subset for debugging
}

/**
 * Fetch from Polygon API
 * https://polygon.io/docs/stocks/get_vx_reference_financials
 */
export async function fetchFromPolygon(ticker: string): Promise<ProviderLTMResult> {
  const provider: ProviderName = 'polygon';
  
  // Check for API key
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.log('[Polygon] Missing POLYGON_API_KEY env var');
    return { ok: false, provider, reason: 'missing-key' };
  }
  
  try {
    // Use Polygon's reference ticker endpoint for basic data
    const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
    console.log(`[Polygon] Fetching: https://api.polygon.io/v3/reference/tickers/${ticker}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    
    // Handle HTTP errors
    if (response.status === 401 || response.status === 403) {
      console.log(`[Polygon] Auth error (${response.status}) – check API key or plan`);
      return { ok: false, provider, status: response.status, reason: 'auth' };
    }
    
    if (response.status === 429) {
      console.log('[Polygon] Rate limited');
      return { ok: false, provider, status: response.status, reason: 'rate-limit' };
    }
    
    if (response.status >= 500) {
      console.log(`[Polygon] Server error (${response.status})`);
      return { ok: false, provider, status: response.status, reason: 'server' };
    }
    
    if (!response.ok) {
      console.log(`[Polygon] HTTP error (${response.status})`);
      return { ok: false, provider, status: response.status, reason: 'no-data' };
    }
    
    // Parse response
    const data = await response.json();
    
    if (!data.results) {
      console.log('[Polygon] No results in response');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    const result = data.results;
    
    // Extract market cap
    const marketCapMillions = result.market_cap ? result.market_cap / 1_000_000 : undefined;
    const sharesOutstandingMillions = result.share_class_shares_outstanding 
      ? result.share_class_shares_outstanding / 1_000_000 
      : undefined;
    
    // Polygon ticker endpoint doesn't have financials, so we need to fetch them separately
    // For now, return what we have
    if (!marketCapMillions || marketCapMillions <= 0) {
      console.log('[Polygon] No valid market cap data');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    console.log(`[Polygon] ✅ Basic data fetched for ${ticker}`);
    
    // Try to fetch financials
    const financialsUrl = `https://api.polygon.io/vX/reference/financials?ticker=${ticker}&limit=1&apiKey=${apiKey}`;
    console.log(`[Polygon] Fetching financials: https://api.polygon.io/vX/reference/financials?ticker=${ticker}`);
    
    const financialsResponse = await fetch(financialsUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (financialsResponse.ok) {
      const financialsData = await financialsResponse.json();
      
      if (financialsData.results && financialsData.results.length > 0) {
        const latest = financialsData.results[0];
        const financials = latest.financials;
        
        // Extract income statement data
        const revenueMillions = financials?.income_statement?.revenues?.value 
          ? financials.income_statement.revenues.value / 1_000_000 
          : undefined;
        
        const netIncomeMillions = financials?.income_statement?.net_income_loss?.value
          ? financials.income_statement.net_income_loss.value / 1_000_000
          : undefined;
        
        // Extract balance sheet data
        const cashMillions = financials?.balance_sheet?.cash_and_cash_equivalents?.value
          ? financials.balance_sheet.cash_and_cash_equivalents.value / 1_000_000
          : undefined;
        
        const debtMillions = financials?.balance_sheet?.long_term_debt?.value
          ? financials.balance_sheet.long_term_debt.value / 1_000_000
          : undefined;
        
        // Estimate EBITDA (if not directly available)
        const ebitdaMillions = revenueMillions ? revenueMillions * 0.25 : undefined;
        
        return {
          ok: true,
          provider,
          status: 200,
          revenueMillions,
          ebitdaMillions,
          netIncomeMillions,
          marketCapMillions,
          sharesOutstandingMillions,
          cashMillions,
          debtMillions,
          companyName: result.name,
          raw: {
            ticker: result.ticker,
            name: result.name,
            market_cap: result.market_cap,
            shares: result.share_class_shares_outstanding,
          },
        };
      }
    }
    
    // Return basic data if financials not available
    return {
      ok: true,
      provider,
      status: 200,
      marketCapMillions,
      sharesOutstandingMillions,
      companyName: result.name,
      raw: {
        ticker: result.ticker,
        name: result.name,
        market_cap: result.market_cap,
      },
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('[Polygon] Request timeout');
        return { ok: false, provider, reason: 'network-error' };
      }
      console.log('[Polygon] Parse/network error:', error.message);
      return { ok: false, provider, reason: 'parse-error' };
    }
    console.log('[Polygon] Unknown error:', error);
    return { ok: false, provider, reason: 'parse-error' };
  }
}

/**
 * Fetch from Finnhub API
 * https://finnhub.io/docs/api/company-basic-financials
 */
export async function fetchFromFinnhub(ticker: string): Promise<ProviderLTMResult> {
  const provider: ProviderName = 'finnhub';
  
  // Check for API key
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.log('[Finnhub] Missing FINNHUB_API_KEY env var');
    return { ok: false, provider, reason: 'missing-key' };
  }
  
  try {
    // Fetch company profile
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`;
    console.log(`[Finnhub] Fetching: https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}`);
    
    const profileResponse = await fetch(profileUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    // Handle HTTP errors
    if (profileResponse.status === 401 || profileResponse.status === 403) {
      console.log(`[Finnhub] Auth error (${profileResponse.status}) – check API key or plan`);
      return { ok: false, provider, status: profileResponse.status, reason: 'auth' };
    }
    
    if (profileResponse.status === 429) {
      console.log('[Finnhub] Rate limited');
      return { ok: false, provider, status: profileResponse.status, reason: 'rate-limit' };
    }
    
    if (profileResponse.status >= 500) {
      console.log(`[Finnhub] Server error (${profileResponse.status})`);
      return { ok: false, provider, status: profileResponse.status, reason: 'server' };
    }
    
    if (!profileResponse.ok) {
      console.log(`[Finnhub] HTTP error (${profileResponse.status})`);
      return { ok: false, provider, status: profileResponse.status, reason: 'no-data' };
    }
    
    const profile = await profileResponse.json();
    
    if (!profile || !profile.name) {
      console.log('[Finnhub] No profile data');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    // Fetch basic financials
    const metricsUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`;
    console.log(`[Finnhub] Fetching metrics: https://finnhub.io/api/v1/stock/metric?symbol=${ticker}`);
    
    const metricsResponse = await fetch(metricsUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!metricsResponse.ok) {
      console.log(`[Finnhub] Metrics fetch failed (${metricsResponse.status})`);
      return { ok: false, provider, status: metricsResponse.status, reason: 'no-data' };
    }
    
    const metrics = await metricsResponse.json();
    
    if (!metrics || !metrics.metric) {
      console.log('[Finnhub] No metrics data');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    const m = metrics.metric;
    
    // Extract financial data
    const marketCapMillions = profile.marketCapitalization; // Already in millions
    const sharesOutstandingMillions = profile.shareOutstanding; // Already in millions
    
    // Calculate revenue from revenue per share TTM
    const revenueMillions = m.revenuePerShareTTM && sharesOutstandingMillions
      ? m.revenuePerShareTTM * sharesOutstandingMillions
      : undefined;
    
    // Calculate net income from EPS TTM
    const netIncomeMillions = m.epsTTM && sharesOutstandingMillions
      ? m.epsTTM * sharesOutstandingMillions
      : undefined;
    
    // Estimate EBITDA from EBITDA margin if available
    const ebitdaMillions = revenueMillions && m.ebitdaMarginTTM
      ? revenueMillions * m.ebitdaMarginTTM
      : revenueMillions
      ? revenueMillions * 0.25
      : undefined;
    
    // Check if we have meaningful data
    if (!marketCapMillions || marketCapMillions <= 0) {
      console.log('[Finnhub] No valid market cap data');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    console.log(`[Finnhub] ✅ Data fetched for ${ticker}`);
    
    return {
      ok: true,
      provider,
      status: 200,
      revenueMillions,
      ebitdaMillions,
      netIncomeMillions,
      marketCapMillions,
      sharesOutstandingMillions,
      companyName: profile.name,
      raw: {
        ticker: profile.ticker,
        name: profile.name,
        marketCap: marketCapMillions,
        revenuePerShareTTM: m.revenuePerShareTTM,
        epsTTM: m.epsTTM,
      },
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('[Finnhub] Request timeout');
        return { ok: false, provider, reason: 'network-error' };
      }
      console.log('[Finnhub] Parse/network error:', error.message);
      return { ok: false, provider, reason: 'parse-error' };
    }
    console.log('[Finnhub] Unknown error:', error);
    return { ok: false, provider, reason: 'parse-error' };
  }
}

/**
 * Fetch from Financial Modeling Prep (FMP) API
 * https://site.financialmodelingprep.com/developer/docs
 */
export async function fetchFromFMP(ticker: string): Promise<ProviderLTMResult> {
  const provider: ProviderName = 'fmp';
  
  // Check for API key
  const apiKey = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
  if (!apiKey) {
    console.log('[FMP] Missing FMP_API_KEY env var');
    return { ok: false, provider, reason: 'missing-key' };
  }
  
  try {
    // Fetch income statement (annual)
    const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`;
    console.log(`[FMP] Fetching: https://financialmodelingprep.com/api/v3/income-statement/${ticker}`);
    
    const incomeResponse = await fetch(incomeUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    // Handle HTTP errors
    if (incomeResponse.status === 401 || incomeResponse.status === 403) {
      console.log(`[FMP] Auth error (${incomeResponse.status}) – check API key or plan`);
      return { ok: false, provider, status: incomeResponse.status, reason: 'auth' };
    }
    
    if (incomeResponse.status === 429) {
      console.log('[FMP] Rate limited');
      return { ok: false, provider, status: incomeResponse.status, reason: 'rate-limit' };
    }
    
    if (incomeResponse.status >= 500) {
      console.log(`[FMP] Server error (${incomeResponse.status})`);
      return { ok: false, provider, status: incomeResponse.status, reason: 'server' };
    }
    
    if (!incomeResponse.ok) {
      console.log(`[FMP] HTTP error (${incomeResponse.status})`);
      return { ok: false, provider, status: incomeResponse.status, reason: 'no-data' };
    }
    
    const incomeData = await incomeResponse.json();
    
    if (!incomeData || !Array.isArray(incomeData) || incomeData.length === 0) {
      console.log('[FMP] No income statement data');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    const latest = incomeData[0];
    
    // Extract income statement data (FMP returns in dollars, convert to millions)
    const revenueMillions = latest.revenue ? latest.revenue / 1_000_000 : undefined;
    const netIncomeMillions = latest.netIncome ? latest.netIncome / 1_000_000 : undefined;
    
    // Calculate EBITDA if available, otherwise estimate
    const ebitdaMillions = latest.ebitda 
      ? latest.ebitda / 1_000_000
      : latest.operatingIncome
      ? latest.operatingIncome / 1_000_000
      : revenueMillions
      ? revenueMillions * 0.25
      : undefined;
    
    // Fetch balance sheet for cash and debt
    const balanceUrl = `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?limit=1&apikey=${apiKey}`;
    console.log(`[FMP] Fetching balance sheet: https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}`);
    
    const balanceResponse = await fetch(balanceUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    let cashMillions: number | undefined;
    let debtMillions: number | undefined;
    
    if (balanceResponse.ok) {
      const balanceData = await balanceResponse.json();
      if (balanceData && Array.isArray(balanceData) && balanceData.length > 0) {
        const latestBalance = balanceData[0];
        cashMillions = latestBalance.cashAndCashEquivalents 
          ? latestBalance.cashAndCashEquivalents / 1_000_000 
          : undefined;
        debtMillions = latestBalance.totalDebt 
          ? latestBalance.totalDebt / 1_000_000 
          : undefined;
      }
    }
    
    // Fetch market cap
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`;
    console.log(`[FMP] Fetching quote: https://financialmodelingprep.com/api/v3/quote/${ticker}`);
    
    const quoteResponse = await fetch(quoteUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    let marketCapMillions: number | undefined;
    let sharesOutstandingMillions: number | undefined;
    let companyName: string | undefined;
    
    if (quoteResponse.ok) {
      const quoteData = await quoteResponse.json();
      if (quoteData && Array.isArray(quoteData) && quoteData.length > 0) {
        const quote = quoteData[0];
        marketCapMillions = quote.marketCap ? quote.marketCap / 1_000_000 : undefined;
        sharesOutstandingMillions = quote.sharesOutstanding ? quote.sharesOutstanding / 1_000_000 : undefined;
        companyName = quote.name;
      }
    }
    
    // Check if we have meaningful data
    if (!revenueMillions || revenueMillions <= 0) {
      console.log('[FMP] No valid revenue data');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    console.log(`[FMP] ✅ Data fetched for ${ticker}`);
    
    return {
      ok: true,
      provider,
      status: 200,
      revenueMillions,
      ebitdaMillions,
      netIncomeMillions,
      marketCapMillions,
      sharesOutstandingMillions,
      cashMillions,
      debtMillions,
      companyName: companyName || latest.symbol,
      raw: {
        symbol: latest.symbol,
        date: latest.date,
        revenue: latest.revenue,
        netIncome: latest.netIncome,
        ebitda: latest.ebitda,
      },
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('[FMP] Request timeout');
        return { ok: false, provider, reason: 'network-error' };
      }
      console.log('[FMP] Parse/network error:', error.message);
      return { ok: false, provider, reason: 'parse-error' };
    }
    console.log('[FMP] Unknown error:', error);
    return { ok: false, provider, reason: 'parse-error' };
  }
}

/**
 * Fetch from Alpha Vantage API
 * https://www.alphavantage.co/documentation/
 */
export async function fetchFromAlphaVantage(ticker: string): Promise<ProviderLTMResult> {
  const provider: ProviderName = 'alpha-vantage';
  
  // Check for API key
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    console.log('[Alpha Vantage] Missing ALPHA_VANTAGE_API_KEY env var');
    return { ok: false, provider, reason: 'missing-key' };
  }
  
  try {
    // Fetch company overview (includes financials)
    const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${apiKey}`;
    console.log(`[Alpha Vantage] Fetching: https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}`);
    
    const overviewResponse = await fetch(overviewUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    // Handle HTTP errors
    if (overviewResponse.status === 401 || overviewResponse.status === 403) {
      console.log(`[Alpha Vantage] Auth error (${overviewResponse.status}) – check API key`);
      return { ok: false, provider, status: overviewResponse.status, reason: 'auth' };
    }
    
    if (overviewResponse.status === 429) {
      console.log('[Alpha Vantage] Rate limited');
      return { ok: false, provider, status: overviewResponse.status, reason: 'rate-limit' };
    }
    
    if (overviewResponse.status >= 500) {
      console.log(`[Alpha Vantage] Server error (${overviewResponse.status})`);
      return { ok: false, provider, status: overviewResponse.status, reason: 'server' };
    }
    
    if (!overviewResponse.ok) {
      console.log(`[Alpha Vantage] HTTP error (${overviewResponse.status})`);
      return { ok: false, provider, status: overviewResponse.status, reason: 'no-data' };
    }
    
    const overview = await overviewResponse.json();
    
    // Check for API limit message
    if (overview.Note && overview.Note.includes('API call frequency')) {
      console.log('[Alpha Vantage] API call frequency limit reached');
      return { ok: false, provider, reason: 'rate-limit' };
    }
    
    // Check if we have data
    if (!overview.Symbol || overview.Symbol !== ticker) {
      console.log('[Alpha Vantage] No data for ticker');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    // Extract financial data (Alpha Vantage returns in full dollars)
    const revenueMillions = overview.RevenueTTM 
      ? parseFloat(overview.RevenueTTM) / 1_000_000 
      : undefined;
    
    const ebitdaMillions = overview.EBITDA 
      ? parseFloat(overview.EBITDA) / 1_000_000 
      : undefined;
    
    const netIncomeMillions = overview.ProfitMargin && revenueMillions
      ? revenueMillions * parseFloat(overview.ProfitMargin)
      : undefined;
    
    const marketCapMillions = overview.MarketCapitalization 
      ? parseFloat(overview.MarketCapitalization) / 1_000_000 
      : undefined;
    
    const sharesOutstandingMillions = overview.SharesOutstanding 
      ? parseFloat(overview.SharesOutstanding) / 1_000_000 
      : undefined;
    
    // Fetch balance sheet for cash and debt
    const balanceSheetUrl = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${ticker}&apikey=${apiKey}`;
    console.log(`[Alpha Vantage] Fetching balance sheet: https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${ticker}`);
    
    const balanceSheetResponse = await fetch(balanceSheetUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    let cashMillions: number | undefined;
    let debtMillions: number | undefined;
    
    if (balanceSheetResponse.ok) {
      const balanceSheet = await balanceSheetResponse.json();
      
      if (balanceSheet.annualReports && balanceSheet.annualReports.length > 0) {
        const latest = balanceSheet.annualReports[0];
        
        cashMillions = latest.cashAndCashEquivalentsAtCarryingValue
          ? parseFloat(latest.cashAndCashEquivalentsAtCarryingValue) / 1_000_000
          : latest.cashAndShortTermInvestments
          ? parseFloat(latest.cashAndShortTermInvestments) / 1_000_000
          : undefined;
        
        debtMillions = latest.longTermDebt
          ? parseFloat(latest.longTermDebt) / 1_000_000
          : latest.shortLongTermDebtTotal
          ? parseFloat(latest.shortLongTermDebtTotal) / 1_000_000
          : undefined;
      }
    }
    
    // Check if we have meaningful data
    if (!revenueMillions || revenueMillions <= 0) {
      console.log('[Alpha Vantage] No valid revenue data');
      return { ok: false, provider, reason: 'no-data' };
    }
    
    console.log(`[Alpha Vantage] ✅ Data fetched for ${ticker}`);
    
    return {
      ok: true,
      provider,
      status: 200,
      revenueMillions,
      ebitdaMillions,
      netIncomeMillions,
      marketCapMillions,
      sharesOutstandingMillions,
      cashMillions,
      debtMillions,
      companyName: overview.Name,
      raw: {
        symbol: overview.Symbol,
        name: overview.Name,
        sector: overview.Sector,
        industry: overview.Industry,
        revenueTTM: overview.RevenueTTM,
        ebitda: overview.EBITDA,
        marketCap: overview.MarketCapitalization,
      },
    };
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('[Alpha Vantage] Request timeout');
        return { ok: false, provider, reason: 'network-error' };
      }
      console.log('[Alpha Vantage] Parse/network error:', error.message);
      return { ok: false, provider, reason: 'parse-error' };
    }
    console.log('[Alpha Vantage] Unknown error:', error);
    return { ok: false, provider, reason: 'parse-error' };
  }
}

/**
 * Check if provider result has sufficient data
 */
export function hasMinimumData(result: ProviderLTMResult): boolean {
  if (!result.ok) return false;
  
  // At minimum, we need revenue OR market cap
  const hasRevenue = result.revenueMillions && result.revenueMillions > 0;
  const hasMarketCap = result.marketCapMillions && result.marketCapMillions > 0;
  
  return hasRevenue || hasMarketCap;
}
