/**
 * Sector Mapping Helper
 * 
 * Maps tickers and company descriptions to sector categories
 * for use with the fallback engine.
 */

import type { Sector } from '@/lib/fallbackEngine';

const TICKER_SECTOR_MAP: Record<string, Sector> = {
  // Software
  MSFT: 'software',
  ORCL: 'software',
  SAP: 'software',
  ADBE: 'software',
  CRM: 'software',
  NOW: 'software',
  WDAY: 'software',
  TEAM: 'software',
  ZM: 'software',
  SNOW: 'software',
  
  // Internet
  GOOGL: 'internet',
  GOOG: 'internet',
  META: 'internet',
  FB: 'internet',
  AMZN: 'internet',
  NFLX: 'internet',
  UBER: 'internet',
  ABNB: 'internet',
  BKNG: 'internet',
  
  // Fintech
  SQ: 'fintech',
  PYPL: 'fintech',
  V: 'fintech',
  MA: 'fintech',
  AXP: 'fintech',
  COIN: 'fintech',
  SOFI: 'fintech',
  
  // Luxury
  LVMH: 'luxury',
  MC: 'luxury',
  RMS: 'luxury',
  
  // Consumer
  NKE: 'consumer',
  SBUX: 'consumer',
  MCD: 'consumer',
  YUM: 'consumer',
  LULU: 'consumer',
  HD: 'consumer',
  LOW: 'consumer',
  TGT: 'consumer',
  WMT: 'consumer',
  COST: 'consumer',
  
  // Staples
  PG: 'staples',
  KO: 'staples',
  PEP: 'staples',
  CL: 'staples',
  KMB: 'staples',
  GIS: 'staples',
  K: 'staples',
  
  // Industrial
  GE: 'industrial',
  HON: 'industrial',
  MMM: 'industrial',
  CAT: 'industrial',
  DE: 'industrial',
  BA: 'industrial',
  LMT: 'industrial',
  RTX: 'industrial',
  UPS: 'industrial',
  FDX: 'industrial',
  
  // Telecom
  T: 'telecom',
  VZ: 'telecom',
  TMUS: 'telecom',
  CMCSA: 'telecom',
  CHTR: 'telecom',
  DIS: 'telecom',
  
  // Energy
  XOM: 'energy',
  CVX: 'energy',
  COP: 'energy',
  SLB: 'energy',
  EOG: 'energy',
  MPC: 'energy',
  PSX: 'energy',
  VLO: 'energy',
  
  // Financials
  JPM: 'financials',
  BAC: 'financials',
  WFC: 'financials',
  C: 'financials',
  GS: 'financials',
  MS: 'financials',
  BLK: 'financials',
  SCHW: 'financials',
  AXP: 'financials',
};

/**
 * Map ticker to sector
 */
export function mapTickerToSector(ticker: string): Sector {
  return TICKER_SECTOR_MAP[ticker.toUpperCase()] || 'other';
}

/**
 * Infer sector from company description or business summary
 */
export function inferSectorFromDescription(description: string): Sector {
  if (!description) return 'other';
  
  const lower = description.toLowerCase();
  
  // Software (highest priority - most specific)
  if (
    lower.includes('software') ||
    lower.includes('saas') ||
    lower.includes('cloud computing') ||
    lower.includes('enterprise software')
  ) {
    return 'software';
  }
  
  // Internet
  if (
    lower.includes('e-commerce') ||
    lower.includes('online marketplace') ||
    lower.includes('social media') ||
    lower.includes('streaming') ||
    lower.includes('digital platform')
  ) {
    return 'internet';
  }
  
  // Fintech
  if (
    lower.includes('fintech') ||
    lower.includes('payment processing') ||
    lower.includes('digital payments') ||
    lower.includes('cryptocurrency') ||
    lower.includes('financial technology')
  ) {
    return 'fintech';
  }
  
  // Luxury
  if (
    lower.includes('luxury') ||
    lower.includes('high-end fashion') ||
    lower.includes('premium brand') ||
    lower.includes('haute couture')
  ) {
    return 'luxury';
  }
  
  // Consumer
  if (
    lower.includes('retail') ||
    lower.includes('consumer goods') ||
    lower.includes('restaurant') ||
    lower.includes('apparel') ||
    lower.includes('footwear') ||
    lower.includes('home improvement')
  ) {
    return 'consumer';
  }
  
  // Staples
  if (
    lower.includes('consumer staples') ||
    lower.includes('food and beverage') ||
    lower.includes('household products') ||
    lower.includes('packaged goods')
  ) {
    return 'staples';
  }
  
  // Industrial
  if (
    lower.includes('industrial') ||
    lower.includes('manufacturing') ||
    lower.includes('aerospace') ||
    lower.includes('defense') ||
    lower.includes('machinery') ||
    lower.includes('logistics')
  ) {
    return 'industrial';
  }
  
  // Telecom
  if (
    lower.includes('telecommunications') ||
    lower.includes('wireless') ||
    lower.includes('cable') ||
    lower.includes('broadband') ||
    lower.includes('media and entertainment')
  ) {
    return 'telecom';
  }
  
  // Energy
  if (
    lower.includes('energy') ||
    lower.includes('oil and gas') ||
    lower.includes('petroleum') ||
    lower.includes('refining')
  ) {
    return 'energy';
  }
  
  // Financials
  if (
    lower.includes('bank') ||
    lower.includes('financial services') ||
    lower.includes('investment') ||
    lower.includes('insurance') ||
    lower.includes('asset management')
  ) {
    return 'financials';
  }
  
  return 'other';
}

/**
 * Get sector with fallback logic
 */
export function getSector(ticker: string, description?: string): Sector {
  // Try ticker mapping first
  const sectorFromTicker = mapTickerToSector(ticker);
  if (sectorFromTicker !== 'other') {
    return sectorFromTicker;
  }
  
  // Try description inference
  if (description) {
    const sectorFromDesc = inferSectorFromDescription(description);
    if (sectorFromDesc !== 'other') {
      return sectorFromDesc;
    }
  }
  
  return 'other';
}

