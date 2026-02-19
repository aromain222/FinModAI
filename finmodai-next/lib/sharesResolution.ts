/**
 * Shares Outstanding Resolution
 * Resolves shares outstanding with clear source tracking
 * Hierarchy: Reported → Derived → User Provided → Unavailable
 */

export type SharesSource = 
  | 'Reported'
  | 'Derived (Mkt Cap ÷ Price)'
  | 'User Provided'
  | 'Unavailable';

export interface SharesResolution {
  sharesOutstanding: number | null;
  source: SharesSource;
  confidence: 'high' | 'medium' | 'low' | 'none';
  asOfDate?: string;
  note?: string;
}

/**
 * Resolve shares outstanding following the hierarchy
 */
export function resolveSharesOutstanding(
  reportedShares: number | null | undefined,
  marketCap: number | null | undefined,
  price: number | null | undefined,
  userProvidedShares: number | null | undefined = null,
  asOfDate?: string
): SharesResolution {
  // Step 1: Reported Shares (Highest Confidence)
  if (reportedShares !== null && reportedShares !== undefined && reportedShares > 0) {
    return {
      sharesOutstanding: reportedShares,
      source: 'Reported',
      confidence: 'high',
      asOfDate,
      note: undefined,
    };
  }

  // Step 2: Derived Shares (Market Cap ÷ Price)
  // Only derive if both inputs are non-null and positive
  if (
    marketCap !== null && 
    marketCap !== undefined && 
    marketCap > 0 &&
    price !== null && 
    price !== undefined && 
    price > 0
  ) {
    const derivedShares = marketCap / price;
    
    // Validate derived shares are reasonable (not negative, not zero, not infinite)
    if (derivedShares > 0 && isFinite(derivedShares)) {
      return {
        sharesOutstanding: derivedShares,
        source: 'Derived (Mkt Cap ÷ Price)',
        confidence: 'medium',
        asOfDate,
        note: 'Shares derived from market cap and price.',
      };
    }
  }

  // Step 3: User-Provided Shares
  if (userProvidedShares !== null && userProvidedShares !== undefined && userProvidedShares > 0) {
    return {
      sharesOutstanding: userProvidedShares,
      source: 'User Provided',
      confidence: 'medium',
      asOfDate,
      note: 'Shares provided by user.',
    };
  }

  // Step 4: Unavailable
  return {
    sharesOutstanding: null,
    source: 'Unavailable',
    confidence: 'none',
    asOfDate,
    note: 'Shares outstanding unavailable.',
  };
}

/**
 * Resolve market cap following hierarchy
 * 1. Reported market cap
 * 2. Price × Resolved shares
 * 3. Unavailable
 */
export function resolveMarketCap(
  reportedMarketCap: number | null | undefined,
  price: number | null | undefined,
  resolvedShares: SharesResolution
): number | null {
  // If reported market cap exists, use it
  if (reportedMarketCap !== null && reportedMarketCap !== undefined && reportedMarketCap > 0) {
    return reportedMarketCap;
  }

  // Else if price × resolved shares exists, compute market cap
  if (
    price !== null && 
    price !== undefined && 
    price > 0 &&
    resolvedShares.sharesOutstanding !== null &&
    resolvedShares.sharesOutstanding > 0
  ) {
    return price * resolvedShares.sharesOutstanding;
  }

  // Else leave blank
  return null;
}

/**
 * Check if a multiple can be computed
 */
export function canComputeMultiple(
  numerator: number | null | undefined,
  denominator: number | null | undefined
): boolean {
  return (
    numerator !== null &&
    numerator !== undefined &&
    numerator > 0 &&
    denominator !== null &&
    denominator !== undefined &&
    denominator > 0
  );
}
