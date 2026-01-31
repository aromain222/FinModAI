/**
 * Unified Assumptions Builder
 * Builds unified assumption sets from various data sources
 */

export interface PolygonFinancials {
  ticker: string;
  name?: string;
  marketCap?: number;
  revenue?: number;
  netIncome?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  sharesOutstanding?: number;
  sector?: string;
  industry?: string;
}

export interface UnifiedAssumptions {
  ticker: string;
  companyName?: string;
  sector?: string;
  industry?: string;
  
  // Financials
  revenue?: number;
  netIncome?: number;
  marketCap?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  sharesOutstanding?: number;
  
  // Derived metrics
  revenueGrowth?: number;
  netMargin?: number;
  ebitdaMargin?: number;
  ebitMargin?: number;
  
  // Valuation inputs
  wacc?: number;
  terminalGrowth?: number;
  taxRate?: number;
  
  // Cash flow assumptions
  capexPctRevenue?: number;
  nwcPctRevenue?: number;
  depreciationPctRevenue?: number;
  
  // Balance sheet
  netDebt?: number;
  
  // Metadata
  dataSource?: string;
  lastUpdated?: string;
}

/**
 * Build unified assumptions from Polygon data
 */
export function buildUnifiedAssumptionsFromPolygon(
  data: PolygonFinancials
): UnifiedAssumptions {
  const netDebt = (data.totalLiabilities || 0) - (data.totalAssets || 0) * 0.1; // Rough estimate
  
  // Derive margins (with defaults if data missing)
  const netMargin = data.revenue && data.netIncome 
    ? data.netIncome / data.revenue 
    : 0.10;
  
  // Estimate EBITDA margin from net margin
  const ebitdaMargin = netMargin > 0 ? netMargin * 1.5 : 0.20;
  const ebitMargin = netMargin > 0 ? netMargin * 1.3 : 0.15;
  
  // Sector-based defaults
  const sectorDefaults = getSectorDefaults(data.sector);
  
  return {
    ticker: data.ticker,
    companyName: data.name,
    sector: data.sector,
    industry: data.industry,
    
    // Financials
    revenue: data.revenue,
    netIncome: data.netIncome,
    marketCap: data.marketCap,
    totalAssets: data.totalAssets,
    totalLiabilities: data.totalLiabilities,
    sharesOutstanding: data.sharesOutstanding,
    
    // Derived metrics
    netMargin,
    ebitdaMargin,
    ebitMargin,
    revenueGrowth: sectorDefaults.revenueGrowth,
    
    // Valuation inputs
    wacc: sectorDefaults.wacc,
    terminalGrowth: 0.025,
    taxRate: 0.25,
    
    // Cash flow assumptions
    capexPctRevenue: sectorDefaults.capexPctRevenue,
    nwcPctRevenue: 0.10,
    depreciationPctRevenue: 0.05,
    
    // Balance sheet
    netDebt,
    
    // Metadata
    dataSource: 'Polygon',
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Get sector-specific default assumptions
 */
function getSectorDefaults(sector?: string): {
  revenueGrowth: number;
  wacc: number;
  capexPctRevenue: number;
} {
  const defaults: Record<string, { revenueGrowth: number; wacc: number; capexPctRevenue: number }> = {
    'Technology': { revenueGrowth: 0.15, wacc: 0.10, capexPctRevenue: 0.03 },
    'Healthcare': { revenueGrowth: 0.10, wacc: 0.09, capexPctRevenue: 0.04 },
    'Financials': { revenueGrowth: 0.08, wacc: 0.11, capexPctRevenue: 0.02 },
    'Consumer': { revenueGrowth: 0.07, wacc: 0.09, capexPctRevenue: 0.04 },
    'Industrials': { revenueGrowth: 0.06, wacc: 0.10, capexPctRevenue: 0.06 },
    'Energy': { revenueGrowth: 0.05, wacc: 0.12, capexPctRevenue: 0.15 },
    'Utilities': { revenueGrowth: 0.03, wacc: 0.08, capexPctRevenue: 0.10 },
    'Real Estate': { revenueGrowth: 0.04, wacc: 0.09, capexPctRevenue: 0.08 }
  };
  
  return defaults[sector || ''] || { revenueGrowth: 0.08, wacc: 0.10, capexPctRevenue: 0.04 };
}

/**
 * Merge multiple assumption sources
 */
export function mergeAssumptions(
  ...sources: Partial<UnifiedAssumptions>[]
): UnifiedAssumptions {
  const merged: UnifiedAssumptions = {
    ticker: '',
    dataSource: 'Multiple sources'
  };
  
  // Merge in order, later sources override earlier ones
  for (const source of sources) {
    Object.assign(merged, source);
  }
  
  return merged;
}

/**
 * Validate unified assumptions completeness
 */
export function validateAssumptionsCompleteness(
  assumptions: UnifiedAssumptions
): { isComplete: boolean; missing: string[] } {
  const required = [
    'ticker',
    'revenue',
    'revenueGrowth',
    'ebitdaMargin',
    'wacc',
    'terminalGrowth'
  ];
  
  const missing: string[] = [];
  
  for (const field of required) {
    if (assumptions[field as keyof UnifiedAssumptions] === undefined) {
      missing.push(field);
    }
  }
  
  return {
    isComplete: missing.length === 0,
    missing
  };
}
