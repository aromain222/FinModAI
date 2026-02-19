/**
 * Peer Comps Data
 * Fetches peer company financials for benchmarking
 */

import apiCache, { cacheKeys, TTL } from '../apiCache';
import { getLTMFinancials } from '../getLTMFinancials';
import { isDemoMode } from '@/lib/demo/isDemoMode';
import { identifyPeers } from '@/lib/identifyPeers';

export interface PeerCompany {
  ticker: string;
  companyName: string;
  revenue: number;
  ebitda: number;
  ebit: number;
  netIncome: number;
  marketCap: number;
  enterpriseValue: number;
  evRevenue: number;
  evEbitda: number;
  peRatio: number;
  revenueGrowth: number;
  ebitdaMargin: number;
  netMargin: number;
}

export interface PeerCompsData {
  targetTicker: string;
  sector: string;
  peers: PeerCompany[];
  medians: {
    revenueGrowth: number;
    ebitdaMargin: number;
    ebitMargin: number;
    netMargin: number;
    evRevenue: number;
    evEbitda: number;
    peRatio: number;
    capexPctRevenue: number;
    nwcPctRevenue: number;
  };
  dataSource: string;
  lastUpdated: string;
}

/**
 * Fetch peer companies for a ticker
 */
export async function fetchPeerComps(
  ticker: string,
  sector?: string
): Promise<PeerCompsData | null> {
  const cleanTicker = ticker.toUpperCase().trim();
  if (!isDemoMode()) {
    throw new Error('Demo mode is required; live peer comps are disabled.');
  }
  const cacheKey = cacheKeys.peerComps(cleanTicker, sector || 'unknown');
  
  // Check cache
  const cached = apiCache.get<PeerCompsData>(cacheKey);
  if (cached) {
    console.log(`[fetchPeerComps] Using cached data for ${cleanTicker}`);
    return cached;
  }
  
  // Get sector if not provided
  let targetSector = sector;
  if (!targetSector) {
    const ltm = await getLTMFinancials(cleanTicker);
    targetSector = ltm?.sector || 'technology';
  }
  
  // Get peer tickers
  const peerTickers = await getPeerTickers(cleanTicker);
  if (!peerTickers || peerTickers.length === 0) {
    console.warn(`[fetchPeerComps] No peers found for ${cleanTicker}`);
    return null;
  }
  
  // Fetch financials for each peer (8-15 sector / up to 25 full universe)
  const peers: PeerCompany[] = [];
  const maxPeers = peerTickers.length <= 15 ? peerTickers.length : 15;
  for (const peerTicker of peerTickers.slice(0, maxPeers)) {
    try {
      const peerFinancials = await getLTMFinancials(peerTicker);
      if (peerFinancials && peerFinancials.revenue > 0) {
        const marketCap = peerFinancials.marketCap || 0;
        const netDebt = (peerFinancials.totalDebt || 0) - (peerFinancials.cash || 0);
        const enterpriseValue = marketCap + netDebt;
        
        peers.push({
          ticker: peerTicker,
          companyName: peerFinancials.companyName || peerTicker,
          revenue: peerFinancials.revenue,
          ebitda: peerFinancials.ebitda || 0,
          ebit: peerFinancials.operatingIncome || 0,
          netIncome: peerFinancials.netIncome || 0,
          marketCap,
          enterpriseValue,
          evRevenue: enterpriseValue > 0 && peerFinancials.revenue > 0 ? enterpriseValue / peerFinancials.revenue : 0,
          evEbitda: enterpriseValue > 0 && peerFinancials.ebitda ? enterpriseValue / peerFinancials.ebitda : 0,
          peRatio: marketCap > 0 && peerFinancials.netIncome ? marketCap / peerFinancials.netIncome : 0,
          revenueGrowth: 0, // Would need historical data
          ebitdaMargin: peerFinancials.ebitdaMargin || 0,
          netMargin: peerFinancials.netMargin || 0,
        });
      }
    } catch (error) {
      console.warn(`[fetchPeerComps] Failed to fetch ${peerTicker}:`, error);
      continue;
    }
  }
  
  if (peers.length === 0) {
    return null;
  }
  
  // Calculate medians
  const medians = calculateMedians(peers);
  
  const result: PeerCompsData = {
    targetTicker: cleanTicker,
    sector: targetSector,
    peers,
    medians,
    dataSource: 'demo_snapshots',
    lastUpdated: new Date().toISOString()
  };
  
  apiCache.set(cacheKey, result, TTL.ONE_DAY);
  return result;
}

/**
 * Get peer tickers for a company
 */
async function getPeerTickers(ticker: string): Promise<string[] | null> {
  if (!isDemoMode()) {
    return null;
  }
  try {
    const peerSelection = await identifyPeers(ticker, 15);
    return peerSelection.peers || [];
  } catch (error) {
    console.error('[getPeerTickers] Error:', error);
    return null;
  }
}

/**
 * Calculate medians from peer companies
 */
function calculateMedians(peers: PeerCompany[]): PeerCompsData['medians'] {
  const validPeers = peers.filter(p => p.revenue > 0);
  if (validPeers.length === 0) {
    return {
      revenueGrowth: 0.08,
      ebitdaMargin: 0.25,
      ebitMargin: 0.20,
      netMargin: 0.12,
      evRevenue: 3.0,
      evEbitda: 12.0,
      peRatio: 20.0,
      capexPctRevenue: 0.04,
      nwcPctRevenue: 0.10,
    };
  }
  
  const sorted = (arr: number[]) => arr.filter(v => v > 0 && isFinite(v)).sort((a, b) => a - b);
  const median = (arr: number[]) => {
    const s = sorted(arr);
    if (s.length === 0) return 0;
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  };
  
  return {
    revenueGrowth: median(validPeers.map(p => p.revenueGrowth)) || 0.08,
    ebitdaMargin: median(validPeers.map(p => p.ebitdaMargin)) || 0.25,
    ebitMargin: median(validPeers.map(p => p.ebit / p.revenue)) || 0.20,
    netMargin: median(validPeers.map(p => p.netMargin)) || 0.12,
    evRevenue: median(validPeers.map(p => p.evRevenue)) || 3.0,
    evEbitda: median(validPeers.map(p => p.evEbitda)) || 12.0,
    peRatio: median(validPeers.map(p => p.peRatio)) || 20.0,
    capexPctRevenue: 0.04, // Would need historical data
    nwcPctRevenue: 0.10, // Would need balance sheet data
  };
}
