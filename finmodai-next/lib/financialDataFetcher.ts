/**
 * Financial Data Fetcher
 * Unified interface for fetching financial data from multiple sources
 */

export interface FinancialData {
  ticker: string;
  revenue: number;
  ebitda?: number;
  netIncome?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  marketCap?: number;
  sharesOutstanding?: number;
}

export async function fetchFinancialData(ticker: string): Promise<FinancialData | null> {
  // Stub implementation - would fetch from real APIs
  return {
    ticker: ticker.toUpperCase(),
    revenue: 100000000000,
    ebitda: 25000000000,
    netIncome: 15000000000,
    totalAssets: 200000000000,
    totalLiabilities: 100000000000,
    marketCap: 150000000000,
    sharesOutstanding: 1000000000
  };
}

export interface EnrichedCompanyData {
  ticker: string;
  name: string;
  sector?: string | null;
  revenue: number | null;
  ebitda: number | null;
  ebit: number | null;
  netIncome: number | null;
  shares: number | null;
  sharesSource?: 'Reported' | 'Derived (Mkt Cap ÷ Price)' | 'User Provided' | 'Unavailable';
  netDebt: number | null;
  price: number | null;
  marketCap?: number | null;
  cash?: number | null;
  totalDebt?: number | null;
}

export async function fetchAndEnrichBatch(
  tickers: Array<{ ticker: string; source: 'auto' | 'custom' }>
): Promise<EnrichedCompanyData[]> {
  const { getLTMFinancials } = await import('./getLTMFinancials');
  const { resolveSharesOutstanding, resolveMarketCap } = await import('./sharesResolution');
  const { getDemoQuote, getDemoSnapshot } = await import('@/lib/data/providers/demoProvider');
  
  const results: EnrichedCompanyData[] = [];

  const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value.replace(/[$,\s]/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  
  for (const { ticker } of tickers.filter(item => item && item.ticker && typeof item.ticker === 'string')) {
    try {
      const cleanTicker = ticker.toUpperCase();
      
      // Fetch financial data
      let ltm = await getLTMFinancials(cleanTicker);
      if (ltm?.dataSource === 'Synthetic') {
        ltm = null;
      }
      if (!ltm) {
        // No fabricated data: return nulls and allow caller to handle missing fields.
        results.push({
          ticker: cleanTicker,
          name: `${cleanTicker} Inc.`,
          revenue: null,
          ebitda: null,
          ebit: null,
          netIncome: null,
          shares: null,
          sharesSource: 'Unavailable',
          netDebt: null,
          price: null,
          marketCap: null,
          cash: null,
          totalDebt: null,
        });
        continue;
      }
      
      // Always attempt demo quote/snapshot hydration when available.
      // This keeps demo-backed runs populated even if DEMO_MODE flag is not globally set.
      let price: number | null = null;
      let demoQuote: Awaited<ReturnType<typeof getDemoQuote>> = null;
      let demoSnapshot: Awaited<ReturnType<typeof getDemoSnapshot>> = null;
      try {
        demoSnapshot = await getDemoSnapshot(cleanTicker);
      } catch {
        demoSnapshot = null;
      }
      try {
        demoQuote = await getDemoQuote(cleanTicker);
      } catch {
        demoQuote = null;
      }
      const snapshotPrice = toFiniteNumber(demoSnapshot?.share_price);
      price = toFiniteNumber(demoQuote?.price) ?? snapshotPrice ?? null;
      
      // Get reported shares and market cap
      const snapshotShares = toFiniteNumber(demoSnapshot?.shares_outstanding);
      const snapshotMarketCap = toFiniteNumber(demoSnapshot?.market_cap);
      const reportedShares =
        toFiniteNumber(ltm.sharesOutstanding) ??
        toFiniteNumber(demoQuote?.sharesOutstanding) ??
        snapshotShares ??
        null;
      const reportedMarketCap =
        toFiniteNumber(ltm.marketCap) ??
        toFiniteNumber(demoQuote?.marketCap) ??
        snapshotMarketCap ??
        null;
      
      // Resolve shares using hierarchy
      const sharesResolution = resolveSharesOutstanding(
        reportedShares,
        reportedMarketCap,
        price,
        null, // No user-provided shares in batch fetch
        ltm.lastUpdated
      );
      
      // Resolve market cap
      const resolvedMarketCap = resolveMarketCap(
        reportedMarketCap,
        price,
        sharesResolution
      );
      
      const totalDebt = toFiniteNumber(ltm.totalDebt);
      const cash = toFiniteNumber(ltm.cash);
      const netDebt = totalDebt !== null && cash !== null ? totalDebt - cash : null;
      const revenue = toFiniteNumber(ltm.revenue) ?? toFiniteNumber(demoSnapshot?.revenue_ltm) ?? null;
      const ebitda = toFiniteNumber(ltm.ebitda) ?? toFiniteNumber(demoSnapshot?.ebitda_ltm) ?? null;
      const netIncome = toFiniteNumber(ltm.netIncome) ?? toFiniteNumber(demoSnapshot?.net_income_ltm) ?? null;

      results.push({
        ticker: cleanTicker,
        name: ltm.companyName || `${cleanTicker} Inc.`,
        sector: ltm.sector ?? null,
        revenue,
        ebitda,
        ebit: typeof ltm.operatingIncome === 'number' ? ltm.operatingIncome : null,
        netIncome,
        shares: sharesResolution.sharesOutstanding ?? null,
        sharesSource: sharesResolution.source,
        netDebt,
        price,
        marketCap: resolvedMarketCap ?? null,
        cash,
        totalDebt,
      });
    } catch (error) {
      console.error(`[fetchAndEnrichBatch] Error fetching ${ticker}:`, error);
      // No fabricated data on error.
      results.push({
        ticker: ticker.toUpperCase(),
        name: `${ticker} Inc.`,
        revenue: null,
        ebitda: null,
        ebit: null,
        netIncome: null,
        shares: null,
        sharesSource: 'Unavailable',
        netDebt: null,
        price: null,
        marketCap: null,
        cash: null,
        totalDebt: null,
      });
    }
  }
  
  return results;
}
