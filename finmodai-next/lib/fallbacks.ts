/**
 * Graceful Fallbacks
 * 
 * Handles missing inputs without crashing
 * Provides inference, sandboxing, and clear warnings
 */

import { type BaseAssumptions } from './frameEngine';
import { type TickerSnapshot } from './tickerDataService';
import { validateNumeric, flagMissingData, gracefulFallback } from './dataQuality';

export interface InferredAssumption {
  field: string;
  value: number;
  source: 'inferred' | 'proxy' | 'industry_avg' | 'default';
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AssumptionSandbox {
  assumptions: BaseAssumptions;
  inferred: InferredAssumption[];
  warnings: string[];
  dataQuality: 'high' | 'medium' | 'low';
}

/**
 * Infers missing assumptions from partial data
 */
export function inferMissingAssumptions(
  partialData: Partial<TickerSnapshot>
): InferredAssumption[] {
  const inferred: InferredAssumption[] = [];
  
  // Infer revenue growth from historical data
  if (partialData.revenueGrowthYoY && partialData.revenueGrowthYoY.length > 0) {
    const avgGrowth = partialData.revenueGrowthYoY.reduce((a, b) => a + b, 0) / partialData.revenueGrowthYoY.length;
    inferred.push({
      field: 'revenueGrowth',
      value: avgGrowth,
      source: 'inferred',
      explanation: `Average of ${partialData.revenueGrowthYoY.length}-year historical growth`,
      confidence: 'medium',
    });
  }
  
  // Infer EBITDA margin from historical data
  if (partialData.marginTrends?.operating && partialData.marginTrends.operating.length > 0) {
    const recentMargin = partialData.marginTrends.operating[partialData.marginTrends.operating.length - 1];
    inferred.push({
      field: 'ebitdaMargin',
      value: recentMargin,
      source: 'inferred',
      explanation: 'Most recent historical operating margin',
      confidence: 'medium',
    });
  }
  
  // Infer discount rate from beta
  if (partialData.beta) {
    const riskFreeRate = 0.04; // 4% assumption
    const marketRiskPremium = 0.07; // 7% assumption
    const discountRate = riskFreeRate + (partialData.beta * marketRiskPremium);
    
    inferred.push({
      field: 'discountRate',
      value: discountRate,
      source: 'inferred',
      explanation: `CAPM: ${(riskFreeRate * 100).toFixed(1)}% risk-free + ${partialData.beta.toFixed(2)} beta × ${(marketRiskPremium * 100).toFixed(0)}% market premium`,
      confidence: 'medium',
    });
  }
  
  // Infer exit multiple from current valuation
  if (partialData.evEbitda) {
    inferred.push({
      field: 'exitMultiple',
      value: partialData.evEbitda,
      source: 'proxy',
      explanation: 'Current EV/EBITDA multiple as exit proxy',
      confidence: 'low',
    });
  }
  
  return inferred;
}

/**
 * Builds a minimal viable assumption sandbox for scenario testing
 */
export function buildAssumptionSandbox(
  ticker: string,
  snapshot?: Partial<TickerSnapshot>
): AssumptionSandbox {
  const warnings: string[] = [];
  const inferred: InferredAssumption[] = [];
  
  // Start with defaults
  let assumptions: BaseAssumptions = {
    revenue: 1000000000, // $1B default
    revenueGrowth: 0.08, // 8% default
    ebitdaMargin: 0.20, // 20% default
    taxRate: 0.21, // 21% US corporate rate
    capexPct: 0.05, // 5% of revenue
    nwcPct: 0.10, // 10% of revenue
    discountRate: 0.10, // 10% WACC
    exitMultiple: 10.0, // 10x EBITDA
    projectionYears: 5,
  };
  
  let dataQuality: 'high' | 'medium' | 'low' = 'low';
  
  if (snapshot) {
    // Use actual data where available
    if (snapshot.history && snapshot.history.length > 0) {
      const latestYear = snapshot.history[snapshot.history.length - 1];
      assumptions.revenue = latestYear.revenue;
      assumptions.ebitdaMargin = latestYear.operatingMargin; // Proxy with operating margin
      dataQuality = 'medium';
    }
    
    // If price is missing but we have market cap and shares, derive price
    if (!snapshot.currentPrice && snapshot.marketCap && snapshot.sharesOutstanding) {
      const derivedPrice = snapshot.marketCap / snapshot.sharesOutstanding;
      if (derivedPrice > 0) {
        inferred.push({
          field: 'currentPrice',
          value: derivedPrice,
          source: 'inferred',
          explanation: `Derived from market cap (${snapshot.marketCap}) ÷ shares (${snapshot.sharesOutstanding})`,
          confidence: 'medium',
        });
      }
    }
    
    // If beta is missing, use sector median or default to 1.0
    if (!snapshot.beta || snapshot.beta === 0) {
      inferred.push({
        field: 'beta',
        value: 1.0,
        source: 'default',
        explanation: 'Beta defaulted to 1.0 (market beta) - no correlation data available',
        confidence: 'low',
      });
    }
    
    // If volatility is missing, use sector average or default to 27.5%
    if (!snapshot.volatility) {
      inferred.push({
        field: 'volatility',
        value: 0.275,
        source: 'industry_avg',
        explanation: 'Volatility estimated at 27.5% (sector average) - no historical data available',
        confidence: 'low',
      });
    }
    
    // Infer missing assumptions
    const inferredAssumptions = inferMissingAssumptions(snapshot);
    inferred.push(...inferredAssumptions);
    
    // Apply inferred values
    for (const inf of inferredAssumptions) {
      if (inf.field in assumptions) {
        (assumptions as any)[inf.field] = inf.value;
      }
    }
    
    // Assess data quality - improved to account for estimated values
    if (snapshot.dataQuality === 'high' && inferredAssumptions.length < 3) {
      dataQuality = 'high';
    } else if (snapshot.dataQuality === 'medium' || inferredAssumptions.length < 5) {
      dataQuality = 'medium';
    } else if (snapshot.dataQuality === 'low' && inferredAssumptions.length > 0) {
      // If we have some inferred data, upgrade from low to medium
      dataQuality = 'medium';
    }
    
    // Add warnings from snapshot, but filter out redundant ones if we've provided fallbacks
    if (snapshot.warnings) {
      // Only add warnings that aren't already addressed by our fallbacks
      const filteredWarnings = snapshot.warnings.filter(w => {
        // Don't add warning if we've provided a fallback
        if (w.includes('Beta') && snapshot.beta) return false;
        if (w.includes('Volatility') && snapshot.volatility) return false;
        if (w.includes('price') && snapshot.currentPrice) return false;
        return true;
      });
      warnings.push(...filteredWarnings);
    }
  } else {
    warnings.push(`No financial data available for ${ticker}. Using generic assumptions.`);
    inferred.push({
      field: 'all',
      value: 0,
      source: 'default',
      explanation: 'No ticker data available, using industry-neutral defaults',
      confidence: 'low',
    });
  }
  
  // Validate all assumptions
  const validation = validateNumeric(assumptions.revenue, 'revenue');
  if (!validation.valid) {
    warnings.push('Revenue assumption is invalid');
  }
  
  // Check completeness
  const completeness = flagMissingData(assumptions);
  if (completeness.completeness < 1.0) {
    warnings.push(`Some assumptions are missing: ${completeness.missing.join(', ')}`);
  }
  
  return {
    assumptions,
    inferred,
    warnings,
    dataQuality,
  };
}

/**
 * Warns about missing data with clear user-facing messages
 */
export function warnMissingData(missingFields: string[]): string[] {
  const warnings: string[] = [];
  
  const criticalFields = ['revenue', 'revenueGrowth', 'ebitdaMargin', 'discountRate'];
  const missingCritical = missingFields.filter(f => criticalFields.includes(f));
  
  if (missingCritical.length > 0) {
    warnings.push(
      `⚠️ Critical data missing: ${missingCritical.join(', ')}. Results may be unreliable.`
    );
  }
  
  if (missingFields.length > 5) {
    warnings.push(
      `⚠️ ${missingFields.length} assumptions are missing or inferred. Consider using a ticker with more complete data.`
    );
  }
  
  return warnings;
}

/**
 * Provides industry-average proxies when data is unavailable
 */
export function getIndustryProxies(industry?: string): Partial<BaseAssumptions> {
  // Generic defaults (can be expanded with industry-specific data)
  const genericProxies: BaseAssumptions = {
    revenue: 1000000000,
    revenueGrowth: 0.08,
    ebitdaMargin: 0.20,
    taxRate: 0.21,
    capexPct: 0.05,
    nwcPct: 0.10,
    discountRate: 0.10,
    exitMultiple: 10.0,
    projectionYears: 5,
  };
  
  // Industry-specific adjustments (simplified)
  const industryAdjustments: Record<string, Partial<BaseAssumptions>> = {
    tech: {
      revenueGrowth: 0.15,
      ebitdaMargin: 0.25,
      capexPct: 0.03,
      exitMultiple: 12.0,
    },
    retail: {
      revenueGrowth: 0.05,
      ebitdaMargin: 0.08,
      capexPct: 0.04,
      exitMultiple: 8.0,
    },
    manufacturing: {
      revenueGrowth: 0.06,
      ebitdaMargin: 0.15,
      capexPct: 0.08,
      exitMultiple: 9.0,
    },
    healthcare: {
      revenueGrowth: 0.10,
      ebitdaMargin: 0.18,
      capexPct: 0.06,
      exitMultiple: 11.0,
    },
  };
  
  if (industry && industry in industryAdjustments) {
    return { ...genericProxies, ...industryAdjustments[industry] };
  }
  
  return genericProxies;
}

/**
 * Validates that assumptions are within reasonable bounds
 */
export function validateAssumptionBounds(assumptions: BaseAssumptions): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Revenue growth bounds (-50% to +100%)
  if (assumptions.revenueGrowth < -0.5 || assumptions.revenueGrowth > 1.0) {
    warnings.push(`Revenue growth of ${(assumptions.revenueGrowth * 100).toFixed(1)}% is outside typical range (-50% to +100%)`);
  }
  
  // EBITDA margin bounds (0% to 60%)
  if (assumptions.ebitdaMargin < 0 || assumptions.ebitdaMargin > 0.6) {
    warnings.push(`EBITDA margin of ${(assumptions.ebitdaMargin * 100).toFixed(1)}% is outside typical range (0% to 60%)`);
  }
  
  // Discount rate bounds (5% to 25%)
  if (assumptions.discountRate < 0.05 || assumptions.discountRate > 0.25) {
    warnings.push(`Discount rate of ${(assumptions.discountRate * 100).toFixed(1)}% is outside typical range (5% to 25%)`);
  }
  
  // Exit multiple bounds (3x to 30x)
  if (assumptions.exitMultiple < 3 || assumptions.exitMultiple > 30) {
    warnings.push(`Exit multiple of ${assumptions.exitMultiple.toFixed(1)}x is outside typical range (3x to 30x)`);
  }
  
  // CapEx should be positive and reasonable
  if (assumptions.capexPct < 0 || assumptions.capexPct > 0.3) {
    warnings.push(`CapEx of ${(assumptions.capexPct * 100).toFixed(1)}% of revenue is outside typical range (0% to 30%)`);
  }
  
  // Tax rate bounds (0% to 50%)
  if (assumptions.taxRate < 0 || assumptions.taxRate > 0.5) {
    warnings.push(`Tax rate of ${(assumptions.taxRate * 100).toFixed(1)}% is outside typical range (0% to 50%)`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
