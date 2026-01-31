/**
 * Sector Mapping
 * Map companies to sectors and provide sector-specific defaults
 */

export type Sector = 
  | 'Technology'
  | 'Healthcare'
  | 'Financials'
  | 'Consumer'
  | 'Industrials'
  | 'Energy'
  | 'Utilities'
  | 'Real Estate'
  | 'Materials'
  | 'Communications';

export interface SectorDefaults {
  revenueGrowth: number;
  ebitdaMargin: number;
  wacc: number;
  capexPctRevenue: number;
}

const SECTOR_DEFAULTS: Record<Sector, SectorDefaults> = {
  Technology: { revenueGrowth: 0.15, ebitdaMargin: 0.30, wacc: 0.10, capexPctRevenue: 0.03 },
  Healthcare: { revenueGrowth: 0.10, ebitdaMargin: 0.25, wacc: 0.09, capexPctRevenue: 0.04 },
  Financials: { revenueGrowth: 0.08, ebitdaMargin: 0.35, wacc: 0.11, capexPctRevenue: 0.02 },
  Consumer: { revenueGrowth: 0.07, ebitdaMargin: 0.20, wacc: 0.09, capexPctRevenue: 0.04 },
  Industrials: { revenueGrowth: 0.06, ebitdaMargin: 0.18, wacc: 0.10, capexPctRevenue: 0.06 },
  Energy: { revenueGrowth: 0.05, ebitdaMargin: 0.22, wacc: 0.12, capexPctRevenue: 0.15 },
  Utilities: { revenueGrowth: 0.03, ebitdaMargin: 0.28, wacc: 0.08, capexPctRevenue: 0.10 },
  'Real Estate': { revenueGrowth: 0.04, ebitdaMargin: 0.40, wacc: 0.09, capexPctRevenue: 0.08 },
  Materials: { revenueGrowth: 0.05, ebitdaMargin: 0.16, wacc: 0.10, capexPctRevenue: 0.08 },
  Communications: { revenueGrowth: 0.06, ebitdaMargin: 0.25, wacc: 0.09, capexPctRevenue: 0.05 }
};

export function getSectorDefaults(sector: Sector | string): SectorDefaults {
  return SECTOR_DEFAULTS[sector as Sector] || SECTOR_DEFAULTS.Technology;
}

export function mapTickerToSector(ticker: string): Sector {
  // Stub implementation - would use real sector mapping
  const tech = ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NVDA'];
  const healthcare = ['JNJ', 'PFE', 'UNH', 'ABBV'];
  const financials = ['JPM', 'BAC', 'WFC', 'GS'];
  
  if (tech.includes(ticker.toUpperCase())) return 'Technology';
  if (healthcare.includes(ticker.toUpperCase())) return 'Healthcare';
  if (financials.includes(ticker.toUpperCase())) return 'Financials';
  
  return 'Technology'; // Default
}
