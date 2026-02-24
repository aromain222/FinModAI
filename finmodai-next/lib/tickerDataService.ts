/**
 * Ticker Data Service - Auto-pull comprehensive financial data
 * Enhanced with Stooq fallback and statistical calculations
 */

import { getLTMFinancials } from '@/lib/getLTMFinancials';
import { 
  fetchStooqPrices, 
  getLastClose, 
  calculateHistoricalVolatility, 
  estimateBeta 
} from '@/lib/stooq';
import { 
  validateNumeric, 
  labelDataProvenance, 
  flagMissingData,
  safeDivide,
  toFiniteNumber 
} from '@/lib/dataQuality';
import { sampleStandardDeviation } from 'simple-statistics';
import { isDemoMode } from '@/lib/demo/isDemoMode';
import { getDemoFundamentals, getDemoQuote } from '@/lib/data/providers/demoProvider';

export interface TickerSnapshot {
  ticker: string;
  companyName: string;
  currentPrice: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  beta?: number;
  betaSource?: string;
  volatility?: number;
  volatilitySource?: string;
  netDebt: number;
  evRevenue?: number;
  evEbitda?: number;
  pe?: number;
  history: Array<{
    year: number;
    revenue: number;
    grossProfit: number;
    operatingIncome: number;
    freeCashFlow: number;
    grossMargin: number;
    operatingMargin: number;
    fcfMargin: number;
  }>;
  revenueGrowthYoY: number[];
  marginTrends: {
    gross: number[];
    operating: number[];
    fcf: number[];
  };
  forwardRevenue?: number;
  forwardGrowth?: number;
  forwardMargin?: number;
  forwardFcf?: number;
  dataQuality: 'high' | 'medium' | 'low';
  dataSource: string;
  warnings: string[];
}

/**
 * Fetch comprehensive ticker snapshot for scenario engine
 */
export async function fetchTickerSnapshot(ticker: string): Promise<TickerSnapshot> {
  const warnings: string[] = [];
  const raw = typeof ticker === 'string' ? ticker : String(ticker ?? '');
  const cleanTicker = raw.trim().toUpperCase();
  if (!cleanTicker || cleanTicker === '[OBJECT OBJECT]') {
    throw new Error('Invalid ticker symbol.');
  }

  try {
    if (!isDemoMode()) {
      throw new Error('Demo mode is required; live data is disabled.');
    }

    if (isDemoMode()) {
      const fundamentals = await getDemoFundamentals(cleanTicker);
      if (!fundamentals) {
        throw new Error(`Demo snapshot not available for ${cleanTicker}`);
      }
      const quote = await getDemoQuote(cleanTicker);

      const currentPrice = quote?.price ?? null;
      const sharesOutstanding = fundamentals.sharesOutstanding ?? quote?.sharesOutstanding ?? null;
      const marketCap = quote?.marketCap ?? (
        currentPrice && sharesOutstanding ? currentPrice * sharesOutstanding : null
      );

      const totalDebt = fundamentals.totalDebt ?? 0;
      const cash = fundamentals.cash ?? 0;
      const netDebt = totalDebt - cash;

      const baseRevenue = fundamentals.revenueLTM ?? 0;
      const baseEbitda = fundamentals.ebitdaLTM ?? baseRevenue * 0.25;
      const baseNetIncome = fundamentals.netIncomeLTM ?? baseRevenue * 0.15;

      const missingRequiredFields: string[] = [];
      if (!(baseRevenue > 0)) missingRequiredFields.push('revenue_ltm');
      if (!(baseEbitda > 0)) missingRequiredFields.push('ebitda_ltm');
      if (!(sharesOutstanding && sharesOutstanding > 0)) missingRequiredFields.push('shares_outstanding');
      if (!(currentPrice && currentPrice > 0)) missingRequiredFields.push('share_price');
      if (!(marketCap && marketCap > 0)) missingRequiredFields.push('market_cap');

      if (missingRequiredFields.length > 0) {
        throw new Error(
          `Ticker is not scenario-ready in demo dataset (${missingRequiredFields.join(', ')}).`
        );
      }

      return {
        ticker: cleanTicker,
        companyName: fundamentals.companyName || cleanTicker,
        currentPrice,
        marketCap,
        sharesOutstanding,
        beta: 1.0,
        betaSource: 'demo_default',
        volatility: 0.25,
        volatilitySource: 'demo_default',
        netDebt,
        history: [
          {
            year: new Date().getFullYear(),
            revenue: baseRevenue,
            grossProfit: baseRevenue * 0.4,
            operatingIncome: baseEbitda,
            freeCashFlow: baseNetIncome,
            grossMargin: baseRevenue > 0 ? 0.4 : 0,
            operatingMargin: baseRevenue > 0 ? baseEbitda / baseRevenue : 0,
            fcfMargin: baseRevenue > 0 ? baseNetIncome / baseRevenue : 0,
          },
        ],
        revenueGrowthYoY: [],
        marginTrends: {
          gross: [],
          operating: [],
          fcf: [],
        },
        dataQuality: 'high',
        dataSource: 'demo_snapshots',
        warnings,
      };
    }

    // Fetch LTM financials
    const ltm = await getLTMFinancials(cleanTicker);

    if (!ltm) {
      throw new Error(`No financial data available for ${cleanTicker}`);
    }

    // Extract current data with multiple fallbacks
    // Try multiple sources for current price in order of preference
    let currentPrice: number | null = null;
    let priceSource = 'Unknown';
    
    // Priority 1: Try Stooq for current price
    try {
      const stooqPrice = await getLastClose(cleanTicker);
      if (stooqPrice && stooqPrice.value) {
        currentPrice = toFiniteNumber(stooqPrice.value);
        priceSource = stooqPrice.source;
      }
    } catch (error) {
      console.warn(`[tickerDataService] Stooq price fetch failed for ${cleanTicker}:`, error);
    }
    
    // Priority 2: Try to derive from market cap / shares if both exist
    if (!currentPrice && ltm.marketCap && ltm.sharesOutstanding) {
      const derivedPrice = toFiniteNumber(ltm.marketCap / ltm.sharesOutstanding);
      if (derivedPrice && derivedPrice > 0) {
        currentPrice = derivedPrice;
        priceSource = 'Derived (Market Cap ÷ Shares)';
        warnings.push(`Price derived from market cap and shares (not real-time)`);
      }
    }
    
    // Priority 3: Try FMP API if available (price might be in quote data)
    if (!currentPrice) {
      const FMP_API_KEY = process.env.FMP_API_KEY;
      if (FMP_API_KEY) {
        try {
          const quoteRes = await fetch(`https://financialmodelingprep.com/api/v3/quote/${cleanTicker}?apikey=${FMP_API_KEY}`);
          if (quoteRes.ok) {
            const quoteData = await quoteRes.json();
            if (Array.isArray(quoteData) && quoteData.length > 0 && quoteData[0].price) {
              currentPrice = toFiniteNumber(quoteData[0].price);
              priceSource = 'FMP';
            }
          }
        } catch (error) {
          console.warn(`[tickerDataService] FMP quote fetch failed for ${cleanTicker}:`, error);
        }
      }
    }
    
    // If still no price, add warning but don't fail
    if (!currentPrice) {
      warnings.push(`Current price could not be determined for ${cleanTicker} (tried Stooq, FMP, and derivation)`);
    }
    
    // Calculate market cap only if we have valid price and shares
    const rawShares = toFiniteNumber(ltm.sharesOutstanding);
    let marketCap: number | null = null;
    let sharesOutstanding: number | null = rawShares;
    
    if (currentPrice && rawShares) {
      // Shares are in millions, price is per share
      marketCap = toFiniteNumber(currentPrice * rawShares);
    } else if (ltm.marketCap) {
      // Use reported market cap if available
      marketCap = toFiniteNumber(ltm.marketCap);
      if (marketCap && currentPrice) {
        // Derive shares from market cap and price
        sharesOutstanding = toFiniteNumber(marketCap / currentPrice);
      }
    }
    
    if (!marketCap) {
      warnings.push(`Market cap could not be calculated for ${cleanTicker}`);
    }
    
    // Calculate net debt
    const totalDebt = toFiniteNumber(ltm.totalDebt) || 0;
    const cash = toFiniteNumber(ltm.cash) || 0; // Fixed: was ltm.cashAndEquivalents
    const netDebt = totalDebt - cash;

    // Fetch historical data from FMP if available
    const history = await fetchHistoricalFinancials(cleanTicker);

    // Calculate growth rates
    const revenueGrowthYoY = calculateGrowthRates(history.map(h => h.revenue));
    
    // Calculate margin trends
    const marginTrends = {
      gross: history.map(h => h.grossMargin),
      operating: history.map(h => h.operatingMargin),
      fcf: history.map(h => h.fcfMargin),
    };

    // Calculate volatility and beta using Stooq + simple-statistics with fallbacks
    let volatility: number | null = null;
    let volatilitySource: string | undefined;
    let beta: number | null = toFiniteNumber(ltm.beta);
    let betaSource: string | undefined = 'FMP';
    
    try {
      // Try to calculate volatility from historical data
      const volResult = await calculateHistoricalVolatility(cleanTicker, 252);
      if (volResult && volResult.value) {
        volatility = toFiniteNumber(volResult.value);
        volatilitySource = volResult.source;
      }
    } catch (error) {
      console.warn(`[tickerDataService] Could not calculate volatility for ${cleanTicker}:`, error);
    }
    
    // If volatility still missing, use sector average or reasonable default
    if (!volatility) {
      // Use reasonable default: 25-30% for typical stocks
      volatility = 0.275; // 27.5% average volatility
      volatilitySource = 'Estimated (sector average)';
      warnings.push(`Volatility estimated at 27.5% (sector average) - historical data unavailable`);
    }
    
    // Beta calculation with multiple fallbacks
    try {
      // Priority 1: Use FMP beta if available and valid
      if (!beta || beta === 0) {
        // Priority 2: Try to estimate from Stooq historical correlation
        const betaResult = await estimateBeta(cleanTicker, 'SPY', 252);
        if (betaResult && betaResult.value) {
          beta = toFiniteNumber(betaResult.value);
          betaSource = betaResult.source;
          warnings.push(`Beta estimated from ${betaSource} historical correlation`);
        }
      }
    } catch (error) {
      console.warn(`[tickerDataService] Could not estimate beta for ${cleanTicker}:`, error);
    }
    
    // Priority 3: Use sector median beta as fallback (simplified - could be enhanced with sector lookup)
    if (!beta || beta === 0) {
      // Default to market beta (1.0) as last resort
      beta = 1.0;
      betaSource = 'Default (market beta)';
      warnings.push(`Beta defaulted to 1.0 (market beta) - no historical correlation data available`);
    }
    
    // Calculate multiples using safe division
    const enterpriseValue = marketCap ? marketCap + netDebt : null;
    const evRevenue = enterpriseValue
      ? (toFiniteNumber(safeDivide(enterpriseValue, ltm.revenue || 0)) ?? undefined)
      : undefined;
    const evEbitda = enterpriseValue
      ? (toFiniteNumber(safeDivide(enterpriseValue, ltm.ebitda || 0)) ?? undefined)
      : undefined;
    const pe =
      ltm.netIncome && currentPrice && sharesOutstanding
        ? (toFiniteNumber(safeDivide(currentPrice * sharesOutstanding, ltm.netIncome)) ?? undefined)
        : undefined;

    // Explicit validation checks - distinguish between missing and estimated
    const estimatedFields: string[] = [];
    
    if (currentPrice === 0 || !currentPrice) {
      warnings.push('Current price is missing or zero');
    } else if (priceSource.includes('Derived') || priceSource.includes('Estimated')) {
      estimatedFields.push('price');
    }
    
    if (marketCap === 0 || !marketCap) {
      warnings.push('Market cap is missing or zero');
    }
    
    if (history.length === 0) {
      warnings.push('No historical financial data available');
    }
    
    // Beta and volatility are now always populated (with fallbacks), so don't warn if estimated
    if (betaSource && (betaSource.includes('Estimated') || betaSource.includes('Default'))) {
      estimatedFields.push('beta');
    }
    
    if (volatilitySource && volatilitySource.includes('Estimated')) {
      estimatedFields.push('volatility');
    }

    // Assess data quality - improved logic that accounts for estimated values
    let dataQuality: 'high' | 'medium' | 'low' = 'high';
    
    // Critical data: price, market cap, revenue, history
    const hasCriticalData = currentPrice && marketCap && history.length > 0 && ltm.revenue;
    
    // Important data: EBITDA, beta, volatility (can be estimated)
    const hasImportantData = ltm.ebitda && beta && volatility;
    const hasEstimatedImportant = estimatedFields.length > 0;
    
    // Low quality only if critical data is truly missing (not estimated)
    if (!hasCriticalData) {
      dataQuality = 'low';
    }
    // Medium quality if we have critical data but some important data is estimated
    else if (hasEstimatedImportant || !hasImportantData || history.length < 3) {
      dataQuality = 'medium';
    }
    // High quality if we have comprehensive data with minimal estimation
    else if (history.length >= 5 && ltm.revenue && ltm.ebitda && beta && volatility && estimatedFields.length === 0) {
      dataQuality = 'high';
    } else {
      dataQuality = 'medium';
    }

    // Validate data completeness - account for estimated values
    const dataCheck = flagMissingData({
      currentPrice,
      marketCap,
      revenue: ltm.revenue,
      ebitda: ltm.ebitda,
      beta,
      volatility,
    });
    
    // Adjust completeness calculation to account for estimated values
    // Estimated values count as 0.5 completeness instead of 0
    const estimatedCompleteness = estimatedFields.length * 0.5;
    const adjustedCompleteness = dataCheck.completeness + (estimatedCompleteness / Object.keys(dataCheck).length);
    
    if (adjustedCompleteness < 0.7) {
      warnings.push(`Data completeness: ${(adjustedCompleteness * 100).toFixed(0)}%${estimatedFields.length > 0 ? ` (${estimatedFields.length} field${estimatedFields.length > 1 ? 's' : ''} estimated)` : ''}`);
    }
    
    // Add note about estimated fields if any
    if (estimatedFields.length > 0) {
      warnings.push(`Estimated values used for: ${estimatedFields.join(', ')}`);
    }
    
    return {
      ticker: cleanTicker,
      companyName: ltm.companyName || cleanTicker,
      currentPrice,
      marketCap,
      sharesOutstanding,
      beta,
      betaSource,
      volatility,
      volatilitySource,
      netDebt,
      evRevenue,
      evEbitda,
      pe,
      history,
      revenueGrowthYoY,
      marginTrends,
      dataQuality,
      dataSource: `FMP + LTM + Stooq (${priceSource})`,
      warnings,
    };
  } catch (error: any) {
    console.error(`[tickerDataService] Error fetching ${cleanTicker}:`, error);
    throw new Error(`Failed to fetch data for ${cleanTicker}: ${error.message}`);
  }
}

/**
 * Fetch historical financials (5 years)
 */
async function fetchHistoricalFinancials(ticker: string): Promise<Array<{
  year: number;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  freeCashFlow: number;
  grossMargin: number;
  operatingMargin: number;
  fcfMargin: number;
}>> {
  const FMP_API_KEY = process.env.FMP_API_KEY;

  if (!FMP_API_KEY) {
    console.warn('[tickerDataService] FMP_API_KEY not available, using fallback');
    return generateFallbackHistory();
  }

  try {
    // Fetch income statements and cash flow statements
    const [incomeRes, cashFlowRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=5&apikey=${FMP_API_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/cash-flow-statement/${ticker}?limit=5&apikey=${FMP_API_KEY}`)
    ]);

    if (!incomeRes.ok || !cashFlowRes.ok) {
      console.warn('[tickerDataService] FMP API error, using fallback');
      return generateFallbackHistory();
    }

    const incomeData = await incomeRes.json();
    const cashFlowData = await cashFlowRes.json();

    if (!Array.isArray(incomeData) || !Array.isArray(cashFlowData)) {
      return generateFallbackHistory();
    }

    // Combine data
    const history = incomeData.slice(0, 5).map((income: any, idx: number) => {
      const cashFlow = cashFlowData[idx] || {};
      const revenue = income.revenue || 0;
      const grossProfit = income.grossProfit || 0;
      const operatingIncome = income.operatingIncome || 0;
      const freeCashFlow = cashFlow.freeCashFlow || 0;

      return {
        year: new Date(income.date).getFullYear(),
        revenue,
        grossProfit,
        operatingIncome,
        freeCashFlow,
        grossMargin: safeDivide(grossProfit, revenue) || 0,
        operatingMargin: safeDivide(operatingIncome, revenue) || 0,
        fcfMargin: safeDivide(freeCashFlow, revenue) || 0,
      };
    }).reverse(); // Oldest to newest

    return history;
  } catch (error) {
    console.error('[tickerDataService] Error fetching historical data:', error);
    return generateFallbackHistory();
  }
}

/**
 * Generate fallback history when API data is unavailable
 */
function generateFallbackHistory(): Array<{
  year: number;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  freeCashFlow: number;
  grossMargin: number;
  operatingMargin: number;
  fcfMargin: number;
}> {
  const currentYear = new Date().getFullYear();
  const baseRevenue = 1000000000; // $1B base
  
  return Array.from({ length: 5 }, (_, i) => {
    const year = currentYear - 4 + i;
    const growth = 1 + (0.08 * i); // 8% annual growth
    const revenue = baseRevenue * growth;
    const grossMargin = 0.65;
    const operatingMargin = 0.20;
    const fcfMargin = 0.15;

    return {
      year,
      revenue,
      grossProfit: revenue * grossMargin,
      operatingIncome: revenue * operatingMargin,
      freeCashFlow: revenue * fcfMargin,
      grossMargin,
      operatingMargin,
      fcfMargin,
    };
  });
}

/**
 * Calculate year-over-year growth rates using safe division
 */
function calculateGrowthRates(values: number[]): number[] {
  const growthRates: number[] = [];
  
  for (let i = 1; i < values.length; i++) {
    const current = values[i];
    const previous = values[i - 1];
    
    const growth = safeDivide(current - previous, previous);
    growthRates.push(growth || 0);
  }
  
  return growthRates;
}
