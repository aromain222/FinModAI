/**
 * Consensus Estimates
 * Fetch analyst consensus estimates from multiple sources
 */

import { rateLimitedFetch } from '../apiClient';
import { trackAPICall } from '../apiHealth';
import apiCache, { cacheKeys, TTL } from '../apiCache';

export interface ConsensusEstimate {
  ticker: string;
  // Revenue estimates
  revenueEstimateNTM: number | null;      // Next Twelve Months
  revenueEstimateFY1: number | null;     // Fiscal Year +1
  revenueEstimateFY2: number | null;     // Fiscal Year +2
  revenueEstimateFY3: number | null;     // Fiscal Year +3
  
  // EBITDA estimates
  ebitdaEstimateNTM: number | null;
  ebitdaEstimateFY1: number | null;
  ebitdaEstimateFY2: number | null;
  
  // EPS estimates
  epsEstimateNTM: number | null;
  epsEstimateFY1: number | null;
  epsEstimateFY2: number | null;
  
  // Price target
  targetPrice: number | null;
  targetPriceHigh: number | null;
  targetPriceLow: number | null;
  
  // Ratings
  analystCount: number;
  buyCount: number;
  holdCount: number;
  sellCount: number;
  rating: 'Buy' | 'Hold' | 'Sell' | 'Strong Buy' | 'Strong Sell';
  
  // Metadata
  dataSource: string;
  lastUpdated: string;
}

/**
 * Fetch consensus estimates
 */
export async function fetchConsensusEstimates(ticker: string): Promise<ConsensusEstimate | null> {
  const cleanTicker = ticker.toUpperCase().trim();
  const cacheKey = cacheKeys.consensusEstimates(cleanTicker);
  
  // Check cache
  const cached = apiCache.get<ConsensusEstimate>(cacheKey);
  if (cached) {
    console.log(`[fetchConsensusEstimates] Using cached data for ${cleanTicker}`);
    return cached;
  }
  
  // Try providers in order: IEX Cloud → FMP → Polygon → Finnhub
  let result: ConsensusEstimate | null = null;
  
  // 1. Try IEX Cloud (best for estimates)
  if (process.env.IEX_CLOUD_API_KEY) {
    result = await fetchFromIEXCloud(cleanTicker);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  // 2. Try FMP
  if (process.env.FMP_API_KEY) {
    result = await fetchFromFMP(cleanTicker);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  // 3. Try Polygon
  if (process.env.POLYGON_API_KEY) {
    result = await fetchFromPolygon(cleanTicker);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  // 4. Try Finnhub
  if (process.env.FINNHUB_API_KEY) {
    result = await fetchFromFinnhub(cleanTicker);
    if (result) {
      apiCache.set(cacheKey, result, TTL.ONE_DAY);
      return result;
    }
  }
  
  console.warn(`[fetchConsensusEstimates] No estimates available for ${cleanTicker}`);
  return null;
}

/**
 * Fetch from IEX Cloud
 */
async function fetchFromIEXCloud(ticker: string): Promise<ConsensusEstimate | null> {
  try {
    const apiKey = process.env.IEX_CLOUD_API_KEY;
    
    // Get estimates
    const estimatesUrl = `https://cloud.iexapis.com/stable/stock/${ticker}/estimates?token=${apiKey}`;
    const estimatesResponse = await trackAPICall('IEX_CLOUD', async () => {
      return await rateLimitedFetch('IEX_CLOUD', estimatesUrl);
    });
    
    // Get price target
    const priceTargetUrl = `https://cloud.iexapis.com/stable/stock/${ticker}/price-target?token=${apiKey}`;
    const priceTargetResponse = await trackAPICall('IEX_CLOUD', async () => {
      return await rateLimitedFetch('IEX_CLOUD', priceTargetUrl);
    });
    
    // Get recommendations
    const recommendationsUrl = `https://cloud.iexapis.com/stable/stock/${ticker}/recommendation-trends?token=${apiKey}`;
    const recommendationsResponse = await trackAPICall('IEX_CLOUD', async () => {
      return await rateLimitedFetch('IEX_CLOUD', recommendationsUrl);
    });
    
    if (!estimatesResponse.ok) return null;
    
    const estimates = await estimatesResponse.json();
    const priceTarget = priceTargetResponse.ok ? await priceTargetResponse.json() : null;
    const recommendations = recommendationsResponse.ok ? await recommendationsResponse.json() : null;
    
    // Parse estimates (IEX structure)
    const consensus = estimates.consensus || estimates;
    
    // Calculate rating from recommendations
    let buyCount = 0;
    let holdCount = 0;
    let sellCount = 0;
    let rating: 'Buy' | 'Hold' | 'Sell' | 'Strong Buy' | 'Strong Sell' = 'Hold';
    
    if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
      const latest = recommendations[0];
      buyCount = latest.strongBuy + latest.buy || 0;
      holdCount = latest.hold || 0;
      sellCount = latest.sell + latest.strongSell || 0;
      
      const total = buyCount + holdCount + sellCount;
      if (total > 0) {
        const buyPct = buyCount / total;
        const sellPct = sellCount / total;
        
        if (buyPct > 0.6) rating = 'Strong Buy';
        else if (buyPct > 0.4) rating = 'Buy';
        else if (sellPct > 0.4) rating = 'Sell';
        else if (sellPct > 0.6) rating = 'Strong Sell';
        else rating = 'Hold';
      }
    }
    
    return {
      ticker: ticker.toUpperCase(),
      revenueEstimateNTM: consensus.revenueEstimate || null,
      revenueEstimateFY1: consensus.revenueEstimateNextYear || null,
      revenueEstimateFY2: consensus.revenueEstimateNextYear2 || null,
      revenueEstimateFY3: null,
      ebitdaEstimateNTM: null,
      ebitdaEstimateFY1: null,
      ebitdaEstimateFY2: null,
      epsEstimateNTM: consensus.consensusEPS || null,
      epsEstimateFY1: consensus.consensusEPSNextYear || null,
      epsEstimateFY2: null,
      targetPrice: priceTarget?.priceTargetAverage || null,
      targetPriceHigh: priceTarget?.priceTargetHigh || null,
      targetPriceLow: priceTarget?.priceTargetLow || null,
      analystCount: buyCount + holdCount + sellCount || 0,
      buyCount,
      holdCount,
      sellCount,
      rating,
      dataSource: 'IEX Cloud',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[fetchFromIEXCloud] Error:', error);
    return null;
  }
}

/**
 * Fetch from FMP
 */
async function fetchFromFMP(ticker: string): Promise<ConsensusEstimate | null> {
  try {
    const apiKey = process.env.FMP_API_KEY;
    // FMP estimates endpoint (may require premium)
    const url = `https://financialmodelingprep.com/api/v3/analyst-estimates/${ticker}?limit=4&apikey=${apiKey}`;
    
    const response = await trackAPICall('FMP', async () => {
      return await rateLimitedFetch('FMP', url);
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) return null;
    
    // FMP structure
    const latest = data[0];
    const nextYear = data[1] || null;
    
    return {
      ticker: ticker.toUpperCase(),
      revenueEstimateNTM: latest.revenue || null,
      revenueEstimateFY1: nextYear?.revenue || null,
      revenueEstimateFY2: null,
      revenueEstimateFY3: null,
      ebitdaEstimateNTM: null,
      ebitdaEstimateFY1: null,
      ebitdaEstimateFY2: null,
      epsEstimateNTM: latest.estimatedEps || null,
      epsEstimateFY1: nextYear?.estimatedEps || null,
      epsEstimateFY2: null,
      targetPrice: null,
      targetPriceHigh: null,
      targetPriceLow: null,
      analystCount: 0,
      buyCount: 0,
      holdCount: 0,
      sellCount: 0,
      rating: 'Hold',
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
async function fetchFromPolygon(ticker: string): Promise<ConsensusEstimate | null> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    // Polygon estimates endpoint
    return null; // Implementation needed
  } catch (error) {
    console.error('[fetchFromPolygon] Error:', error);
    return null;
  }
}

/**
 * Fetch from Finnhub
 */
async function fetchFromFinnhub(ticker: string): Promise<ConsensusEstimate | null> {
  try {
    const apiKey = process.env.FINNHUB_API_KEY;
    const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${apiKey}`;
    
    const response = await trackAPICall('FINNHUB', async () => {
      return await rateLimitedFetch('FINNHUB', url);
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) return null;
    
    const latest = data[0];
    
    return {
      ticker: ticker.toUpperCase(),
      revenueEstimateNTM: null,
      revenueEstimateFY1: null,
      revenueEstimateFY2: null,
      revenueEstimateFY3: null,
      ebitdaEstimateNTM: null,
      ebitdaEstimateFY1: null,
      ebitdaEstimateFY2: null,
      epsEstimateNTM: null,
      epsEstimateFY1: null,
      epsEstimateFY2: null,
      targetPrice: null,
      targetPriceHigh: null,
      targetPriceLow: null,
      analystCount: (latest.strongBuy || 0) + (latest.buy || 0) + (latest.hold || 0) + (latest.sell || 0) + (latest.strongSell || 0),
      buyCount: (latest.strongBuy || 0) + (latest.buy || 0),
      holdCount: latest.hold || 0,
      sellCount: (latest.sell || 0) + (latest.strongSell || 0),
      rating: 'Hold', // Would calculate from counts
      dataSource: 'Finnhub',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[fetchFromFinnhub] Error:', error);
    return null;
  }
}
