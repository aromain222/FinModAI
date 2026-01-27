/**
 * Consensus Estimates Fetcher
 * 
 * Fetches forward revenue growth and margin targets from multiple sources
 * and selects the most recent or consensus figure.
 */

export interface ConsensusEstimate {
  revenueGrowthY1?: number;  // Year 1 revenue growth (decimal, e.g., 0.15 = 15%)
  revenueGrowthY2?: number;  // Year 2 revenue growth
  revenueGrowthY3?: number;  // Year 3 revenue growth
  ebitdaMarginTarget?: number; // Target EBITDA margin (decimal)
  operatingMarginTarget?: number; // Target operating margin (decimal)
  
  // Metadata
  source: 'fmp' | 'finnhub' | 'consensus';
  analystCount?: number;
  lastUpdated?: string;
}

export interface ConsensusEstimatesResult {
  ok: boolean;
  fmpEstimates?: ConsensusEstimate;
  finnhubEstimates?: ConsensusEstimate;
  consensus?: ConsensusEstimate;
  errors: string[];
}

/**
 * Fetch analyst estimates from FMP
 */
async function fetchFMPEstimates(ticker: string): Promise<ConsensusEstimate | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.warn('[FMP Estimates] Missing FMP_API_KEY – skipping');
    return null;
  }
  
  try {
    // Fetch analyst estimates
    const url = `https://financialmodelingprep.com/api/v3/analyst-estimates/${ticker}?limit=3&apiKey=${apiKey}`;
    console.log(`[FMP Estimates] Fetching: https://financialmodelingprep.com/api/v3/analyst-estimates/${ticker}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok || response.status === 401) {
      console.warn(`[FMP Estimates] HTTP error (${response.status})`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      console.warn('[FMP Estimates] Non-JSON response, likely HTML');
      return null;
    }
    const data = await response.json();
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('[FMP Estimates] No estimates data');
      return null;
    }
    
    // Sort by date (most recent first)
    const sorted = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Calculate revenue growth from estimates
    const estimates: ConsensusEstimate = {
      source: 'fmp',
      lastUpdated: sorted[0].date,
      analystCount: sorted[0].numberAnalystEstimatedRevenue || 0,
    };
    
    // Calculate growth rates from revenue estimates
    if (sorted.length >= 2 && sorted[0].estimatedRevenueAvg && sorted[1].estimatedRevenueAvg) {
      estimates.revenueGrowthY1 = (sorted[0].estimatedRevenueAvg / sorted[1].estimatedRevenueAvg) - 1;
    }
    
    if (sorted.length >= 3 && sorted[1].estimatedRevenueAvg && sorted[2].estimatedRevenueAvg) {
      estimates.revenueGrowthY2 = (sorted[1].estimatedRevenueAvg / sorted[2].estimatedRevenueAvg) - 1;
    }
    
    // Calculate margin from EBITDA estimates
    if (sorted[0].estimatedEbitdaAvg && sorted[0].estimatedRevenueAvg) {
      estimates.ebitdaMarginTarget = sorted[0].estimatedEbitdaAvg / sorted[0].estimatedRevenueAvg;
    }
    
    console.log(`[FMP Estimates] ✅ Fetched estimates for ${ticker}`);
    return estimates;
    
  } catch (error) {
    console.warn('[FMP Estimates] Error', error);
    return null;
  }
}

/**
 * Fetch analyst estimates from Finnhub
 */
async function fetchFinnhubEstimates(ticker: string): Promise<ConsensusEstimate | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('[Finnhub Estimates] Missing FINNHUB_API_KEY – skipping');
    return null;
  }
  
  try {
    // Fetch earnings estimates
    const url = `https://finnhub.io/api/v1/stock/earnings-estimate?symbol=${ticker}&token=${apiKey}`;
    console.log(`[Finnhub Estimates] Fetching: https://finnhub.io/api/v1/stock/earnings-estimate?symbol=${ticker}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok || response.status === 401) {
      console.warn(`[Finnhub Estimates] HTTP error (${response.status})`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      console.warn('[Finnhub Estimates] Non-JSON response, likely HTML');
      return null;
    }
    const data = await response.json();
    
    if (!data || !data.data || data.data.length === 0) {
      console.warn('[Finnhub Estimates] No estimates data');
      return null;
    }
    
    // Fetch revenue estimates
    const revenueUrl = `https://finnhub.io/api/v1/stock/revenue-estimate?symbol=${ticker}&token=${apiKey}`;
    console.log(`[Finnhub Estimates] Fetching revenue: https://finnhub.io/api/v1/stock/revenue-estimate?symbol=${ticker}`);
    
    const revenueResponse = await fetch(revenueUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    const estimates: ConsensusEstimate = {
      source: 'finnhub',
      analystCount: data.data[0]?.numberAnalysts || 0,
    };
    
    if (revenueResponse.ok && !(revenueResponse.status === 401)) {
      const revenueData = await revenueResponse.json();
      
      if (revenueData && revenueData.data && revenueData.data.length >= 2) {
        // Sort by period
        const sorted = revenueData.data.sort((a: any, b: any) => 
          new Date(a.period).getTime() - new Date(b.period).getTime()
        );
        
        // Calculate growth rates
        if (sorted.length >= 2 && sorted[1].revenueMean && sorted[0].revenueMean) {
          estimates.revenueGrowthY1 = (sorted[1].revenueMean / sorted[0].revenueMean) - 1;
        }
        
        if (sorted.length >= 3 && sorted[2].revenueMean && sorted[1].revenueMean) {
          estimates.revenueGrowthY2 = (sorted[2].revenueMean / sorted[1].revenueMean) - 1;
        }
      }
    }
    
    console.log(`[Finnhub Estimates] ✅ Fetched estimates for ${ticker}`);
    return estimates;
    
  } catch (error) {
    console.warn('[Finnhub Estimates] Error', error);
    return null;
  }
}

/**
 * Calculate consensus from multiple estimates
 */
function calculateConsensus(
  fmpEstimates: ConsensusEstimate | null,
  finnhubEstimates: ConsensusEstimate | null
): ConsensusEstimate | null {
  if (!fmpEstimates && !finnhubEstimates) {
    return null;
  }
  
  const consensus: ConsensusEstimate = {
    source: 'consensus',
  };
  
  // Average revenue growth Y1
  const growthY1Values = [
    fmpEstimates?.revenueGrowthY1,
    finnhubEstimates?.revenueGrowthY1,
  ].filter(v => v !== undefined && isFinite(v)) as number[];
  
  if (growthY1Values.length > 0) {
    consensus.revenueGrowthY1 = growthY1Values.reduce((sum, v) => sum + v, 0) / growthY1Values.length;
  }
  
  // Average revenue growth Y2
  const growthY2Values = [
    fmpEstimates?.revenueGrowthY2,
    finnhubEstimates?.revenueGrowthY2,
  ].filter(v => v !== undefined && isFinite(v)) as number[];
  
  if (growthY2Values.length > 0) {
    consensus.revenueGrowthY2 = growthY2Values.reduce((sum, v) => sum + v, 0) / growthY2Values.length;
  }
  
  // Average EBITDA margin
  const marginValues = [
    fmpEstimates?.ebitdaMarginTarget,
  ].filter(v => v !== undefined && isFinite(v)) as number[];
  
  if (marginValues.length > 0) {
    consensus.ebitdaMarginTarget = marginValues.reduce((sum, v) => sum + v, 0) / marginValues.length;
  }
  
  // Use most recent date
  if (fmpEstimates?.lastUpdated) {
    consensus.lastUpdated = fmpEstimates.lastUpdated;
  }
  
  // Sum analyst counts
  const analystCounts = [
    fmpEstimates?.analystCount || 0,
    finnhubEstimates?.analystCount || 0,
  ];
  consensus.analystCount = Math.max(...analystCounts);
  
  return consensus;
}

/**
 * Fetch consensus estimates from all sources
 */
export async function fetchConsensusEstimates(ticker: string): Promise<ConsensusEstimatesResult> {
  console.log(`[Consensus Estimates] Fetching for ${ticker}`);
  
  const errors: string[] = [];
  
  // Fetch from both sources in parallel
  const [fmpEstimates, finnhubEstimates] = await Promise.all([
    fetchFMPEstimates(ticker).catch(err => {
      errors.push(`FMP: ${err.message}`);
      return null;
    }),
    fetchFinnhubEstimates(ticker).catch(err => {
      errors.push(`Finnhub: ${err.message}`);
      return null;
    }),
  ]);
  
  // Calculate consensus
  const consensus = calculateConsensus(fmpEstimates, finnhubEstimates);
  
  const result: ConsensusEstimatesResult = {
    ok: !!(fmpEstimates || finnhubEstimates),
    fmpEstimates: fmpEstimates || undefined,
    finnhubEstimates: finnhubEstimates || undefined,
    consensus: consensus || undefined,
    errors,
  };
  
  if (result.ok) {
    console.log(`[Consensus Estimates] ✅ Success for ${ticker}`);
    if (consensus) {
      console.log(`[Consensus Estimates] Revenue Growth Y1: ${(consensus.revenueGrowthY1! * 100).toFixed(1)}%`);
      if (consensus.ebitdaMarginTarget) {
        console.log(`[Consensus Estimates] EBITDA Margin Target: ${(consensus.ebitdaMarginTarget * 100).toFixed(1)}%`);
      }
    }
  } else {
    console.log(`[Consensus Estimates] ❌ Failed for ${ticker}`);
  }
  
  return result;
}

/**
 * Select best estimate (prefer consensus, then most recent)
 */
export function selectBestEstimate(result: ConsensusEstimatesResult): ConsensusEstimate | null {
  if (!result.ok) {
    return null;
  }
  
  // Prefer consensus if available
  if (result.consensus) {
    return result.consensus;
  }
  
  // Otherwise, use FMP if available (typically more comprehensive)
  if (result.fmpEstimates) {
    return result.fmpEstimates;
  }
  
  // Fall back to Finnhub
  if (result.finnhubEstimates) {
    return result.finnhubEstimates;
  }
  
  return null;
}
