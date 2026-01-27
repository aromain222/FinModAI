/**
 * Market Data Fetcher with 3-tier fallback
 * 
 * Tier 1: Finnhub API (if FINNHUB_API_KEY configured)
 * Tier 2: Last cached snapshot
 * Tier 3: Placeholder values with status indicator
 */

export interface MarketIndex {
  symbol: string;
  name: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  lastUpdated: string | null;
  status?: 'live' | 'cached' | 'placeholder';
}

// In-memory cache with TTL
interface CacheEntry {
  data: MarketIndex[];
  timestamp: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Fallback data (last known good values)
const FALLBACK_DATA: MarketIndex[] = [
  { symbol: 'SPX', name: 'S&P 500', value: 4783.45, change: 23.15, changePercent: 0.49, lastUpdated: '2024-12-24T12:00:00Z', status: 'placeholder' },
  { symbol: 'DJI', name: 'Dow Jones', value: 37545.33, change: 156.78, changePercent: 0.42, lastUpdated: '2024-12-24T12:00:00Z', status: 'placeholder' },
  { symbol: 'IXIC', name: 'Nasdaq', value: 15055.65, change: 85.34, changePercent: 0.57, lastUpdated: '2024-12-24T12:00:00Z', status: 'placeholder' },
  { symbol: 'TNX', name: '10Y Treasury', value: 4.45, change: -0.05, changePercent: -1.11, lastUpdated: '2024-12-24T12:00:00Z', status: 'placeholder' },
  { symbol: 'VIX', name: 'VIX', value: 13.24, change: -0.42, changePercent: -3.08, lastUpdated: '2024-12-24T12:00:00Z', status: 'placeholder' },
];

/**
 * Fetch market indices with fallback strategy
 */
export async function fetchMarketIndices(): Promise<MarketIndex[]> {
  // Check cache first
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    console.log('[marketData] Returning cached data');
    return cache.data.map(d => ({ ...d, status: 'cached' as const }));
  }

  // Try Finnhub API if configured
  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (finnhubKey) {
    try {
      const data = await fetchFromFinnhub(finnhubKey);
      if (data && data.length > 0) {
        cache = { data, timestamp: Date.now() };
        console.log('[marketData] ✅ Fetched from Finnhub');
        return data.map(d => ({ ...d, status: 'live' as const }));
      }
    } catch (err) {
      console.error('[marketData] Finnhub fetch failed:', err);
    }
  }

  // Return cached data if available (even if expired)
  if (cache) {
    console.log('[marketData] Returning expired cache (API unavailable)');
    return cache.data.map(d => ({ ...d, status: 'cached' as const }));
  }

  // Final fallback: placeholder data
  console.log('[marketData] Using placeholder data (no API key or cache)');
  return FALLBACK_DATA;
}

/**
 * Fetch from Finnhub API
 * Docs: https://finnhub.io/docs/api/quote
 */
async function fetchFromFinnhub(apiKey: string): Promise<MarketIndex[]> {
  const symbols = [
    { symbol: '^GSPC', name: 'S&P 500', key: 'SPX' },
    { symbol: '^DJI', name: 'Dow Jones', key: 'DJI' },
    { symbol: '^IXIC', name: 'Nasdaq', key: 'IXIC' },
  ];

  const results: MarketIndex[] = [];
  const now = new Date().toISOString();

  // Fetch each index (Finnhub doesn't support batch quotes for indices)
  for (const { symbol, name, key } of symbols) {
    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
        { next: { revalidate: 600 } } // Cache for 10 minutes
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Finnhub quote response: { c: current, d: change, dp: changePercent, h: high, l: low, o: open, pc: previousClose }
      if (data.c && typeof data.c === 'number') {
        results.push({
          symbol: key,
          name,
          value: data.c,
          change: data.d || 0,
          changePercent: data.dp || 0,
          lastUpdated: now,
        });
      }
    } catch (err) {
      console.error(`[marketData] Failed to fetch ${symbol}:`, err);
    }
  }

  // Add VIX and 10Y Treasury (if available)
  // Note: Finnhub may not have ^TNX or ^VIX, so we use fallback
  try {
    const vixResponse = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=^VIX&token=${apiKey}`,
      { next: { revalidate: 600 } }
    );
    if (vixResponse.ok) {
      const vixData = await vixResponse.json();
      if (vixData.c) {
        results.push({
          symbol: 'VIX',
          name: 'VIX',
          value: vixData.c,
          change: vixData.d || 0,
          changePercent: vixData.dp || 0,
          lastUpdated: now,
        });
      }
    }
  } catch (err) {
    // VIX not available, use fallback
    results.push(FALLBACK_DATA.find(d => d.symbol === 'VIX')!);
  }

  // 10Y Treasury - use fallback (Finnhub doesn't have this)
  results.push(FALLBACK_DATA.find(d => d.symbol === 'TNX')!);

  return results.length > 0 ? results : [];
}

