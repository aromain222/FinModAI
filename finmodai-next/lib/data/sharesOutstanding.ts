/**
 * Multi-Source Shares Outstanding Resolver
 * 
 * Attempts to resolve shares outstanding from multiple sources:
 * 1. Finnhub fundamentals
 * 2. Polygon reference data
 * 3. SEC EDGAR (future)
 * 
 * Handles unit mismatches, ADRs, dual-class shares gracefully.
 */

export interface SharesResult {
  success: boolean;
  sharesOutstandingMm: number | null; // Always in millions
  source: string;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
}

/**
 * Resolve shares outstanding using multiple sources
 */
export async function resolveSharesOutstanding(ticker: string): Promise<SharesResult> {
  const warnings: string[] = [];
  
  // Try Finnhub first
  const finnhubResult = await tryFinnhub(ticker);
  if (finnhubResult.success && finnhubResult.sharesOutstandingMm && finnhubResult.sharesOutstandingMm > 0) {
    return finnhubResult;
  }
  warnings.push(...finnhubResult.warnings);
  
  // Try Polygon as fallback
  const polygonResult = await tryPolygon(ticker);
  if (polygonResult.success && polygonResult.sharesOutstandingMm && polygonResult.sharesOutstandingMm > 0) {
    return polygonResult;
  }
  warnings.push(...polygonResult.warnings);
  
  // All sources failed
  return {
    success: false,
    sharesOutstandingMm: null,
    source: 'none',
    confidence: 'low',
    warnings: [...warnings, 'Could not resolve shares outstanding from any source'],
  };
}

async function tryFinnhub(ticker: string): Promise<SharesResult> {
  const apiKey = process.env.FINNHUB_API_KEY;
  
  if (!apiKey) {
    return {
      success: false,
      sharesOutstandingMm: null,
      source: 'finnhub',
      confidence: 'low',
      warnings: ['Finnhub API key not configured'],
    };
  }
  
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );
    
    if (!response.ok) {
      return {
        success: false,
        sharesOutstandingMm: null,
        source: 'finnhub',
        confidence: 'low',
        warnings: [`Finnhub API error: ${response.status}`],
      };
    }
    
    const data = await response.json();
    const shares = data?.metric?.sharesOutstanding || data?.metric?.shareOutstanding || null;
    
    if (!shares || shares <= 0) {
      return {
        success: false,
        sharesOutstandingMm: null,
        source: 'finnhub',
        confidence: 'low',
        warnings: ['Finnhub returned no shares outstanding'],
      };
    }
    
    // Normalize to millions (Finnhub returns in millions)
    const sharesMm = shares;
    
    // Sanity check
    if (sharesMm < 0.1) {
      return {
        success: false,
        sharesOutstandingMm: null,
        source: 'finnhub',
        confidence: 'low',
        warnings: [`Finnhub shares suspiciously low: ${sharesMm}M - possible unit error`],
      };
    }
    
    if (sharesMm > 500000) {
      return {
        success: false,
        sharesOutstandingMm: null,
        source: 'finnhub',
        confidence: 'low',
        warnings: [`Finnhub shares suspiciously high: ${sharesMm}M - possible unit error`],
      };
    }
    
    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'high';
    const warnings: string[] = [];
    
    if (sharesMm < 10) {
      confidence = 'medium';
      warnings.push(`Low share count (${sharesMm.toFixed(2)}M) - may be high-price stock like BRK.A`);
    }
    
    if (sharesMm > 100000) {
      confidence = 'medium';
      warnings.push(`Very high share count (${sharesMm.toFixed(0)}M) - verify unit`);
    }
    
    return {
      success: true,
      sharesOutstandingMm: sharesMm,
      source: 'finnhub',
      confidence,
      warnings,
    };
    
  } catch (error) {
    return {
      success: false,
      sharesOutstandingMm: null,
      source: 'finnhub',
      confidence: 'low',
      warnings: [`Finnhub fetch error: ${error instanceof Error ? error.message : 'unknown'}`],
    };
  }
}

async function tryPolygon(ticker: string): Promise<SharesResult> {
  const apiKey = process.env.POLYGON_API_KEY;
  
  if (!apiKey) {
    return {
      success: false,
      sharesOutstandingMm: null,
      source: 'polygon',
      confidence: 'low',
      warnings: ['Polygon API key not configured'],
    };
  }
  
  try {
    const response = await fetch(
      `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`,
      { next: { revalidate: 3600 } }
    );
    
    if (!response.ok) {
      return {
        success: false,
        sharesOutstandingMm: null,
        source: 'polygon',
        confidence: 'low',
        warnings: [`Polygon API error: ${response.status}`],
      };
    }
    
    const data = await response.json();
    const shares = data?.results?.share_class_shares_outstanding || data?.results?.weighted_shares_outstanding || null;
    
    if (!shares || shares <= 0) {
      return {
        success: false,
        sharesOutstandingMm: null,
        source: 'polygon',
        confidence: 'low',
        warnings: ['Polygon returned no shares outstanding'],
      };
    }
    
    // Normalize to millions (Polygon returns absolute count)
    const sharesMm = shares / 1000000;
    
    // Sanity check
    if (sharesMm < 0.1) {
      return {
        success: false,
        sharesOutstandingMm: null,
        source: 'polygon',
        confidence: 'low',
        warnings: [`Polygon shares suspiciously low: ${sharesMm}M`],
      };
    }
    
    if (sharesMm > 500000) {
      return {
        success: false,
        sharesOutstandingMm: null,
        source: 'polygon',
        confidence: 'low',
        warnings: [`Polygon shares suspiciously high: ${sharesMm}M`],
      };
    }
    
    let confidence: 'high' | 'medium' | 'low' = 'high';
    const warnings: string[] = [];
    
    if (sharesMm < 10) {
      confidence = 'medium';
      warnings.push(`Low share count (${sharesMm.toFixed(2)}M)`);
    }
    
    if (sharesMm > 100000) {
      confidence = 'medium';
      warnings.push(`Very high share count (${sharesMm.toFixed(0)}M)`);
    }
    
    return {
      success: true,
      sharesOutstandingMm: sharesMm,
      source: 'polygon',
      confidence,
      warnings,
    };
    
  } catch (error) {
    return {
      success: false,
      sharesOutstandingMm: null,
      source: 'polygon',
      confidence: 'low',
      warnings: [`Polygon fetch error: ${error instanceof Error ? error.message : 'unknown'}`],
    };
  }
}
