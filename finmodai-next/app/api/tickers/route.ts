/**
 * Ticker Search API
 * 
 * Returns ticker autocomplete results with company name, exchange, and country.
 * Currently uses mock data, but structured for easy replacement with real market API.
 * 
 * GET /api/tickers?q=goo
 * Returns: [{ symbol, name, exchange, country }]
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Ticker data structure
 */
export interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
  country?: string;
}

/**
 * Mock ticker database
 * TODO: Replace with real market data API (Polygon, Finnhub, Tiingo, etc.)
 */
const MOCK_TICKERS: TickerResult[] = [
  // Example tickers for testing
  { symbol: 'GOOS', name: 'Canada Goose Holdings Inc.', exchange: 'NYSE', country: 'Canada' },
  { symbol: 'GSHD', name: 'Goosehead Insurance Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'GOOG', name: 'Alphabet Inc. (Class C)', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)', exchange: 'NASDAQ', country: 'USA' },
  
  // Popular tickers
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', country: 'USA' },
  { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE', country: 'USA' },
  { symbol: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE', country: 'USA' },
  { symbol: 'DIS', name: 'The Walt Disney Company', exchange: 'NYSE', country: 'USA' },
  { symbol: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'BA', name: 'The Boeing Company', exchange: 'NYSE', country: 'USA' },
  { symbol: 'GS', name: 'The Goldman Sachs Group Inc.', exchange: 'NYSE', country: 'USA' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'NKE', name: 'NIKE Inc.', exchange: 'NYSE', country: 'USA' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'ADBE', name: 'Adobe Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'CRM', name: 'Salesforce Inc.', exchange: 'NYSE', country: 'USA' },
  { symbol: 'ORCL', name: 'Oracle Corporation', exchange: 'NYSE', country: 'USA' },
  { symbol: 'IBM', name: 'International Business Machines Corporation', exchange: 'NYSE', country: 'USA' },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated', exchange: 'NASDAQ', country: 'USA' },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated', exchange: 'NASDAQ', country: 'USA' },
];

/**
 * Search tickers by query
 * Matches against symbol and company name
 */
function searchTickers(query: string, limit: number = 10): TickerResult[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();

  // Filter tickers that match symbol or name
  const matches = MOCK_TICKERS.filter(ticker => {
    const symbolMatch = ticker.symbol.toLowerCase().includes(normalizedQuery);
    const nameMatch = ticker.name.toLowerCase().includes(normalizedQuery);
    return symbolMatch || nameMatch;
  });

  // Sort by relevance:
  // 1. Exact symbol match first
  // 2. Symbol starts with query
  // 3. Name starts with query
  // 4. Everything else
  matches.sort((a, b) => {
    const aSymbol = a.symbol.toLowerCase();
    const bSymbol = b.symbol.toLowerCase();
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    // Exact symbol match
    if (aSymbol === normalizedQuery) return -1;
    if (bSymbol === normalizedQuery) return 1;

    // Symbol starts with query
    const aSymbolStarts = aSymbol.startsWith(normalizedQuery);
    const bSymbolStarts = bSymbol.startsWith(normalizedQuery);
    if (aSymbolStarts && !bSymbolStarts) return -1;
    if (!aSymbolStarts && bSymbolStarts) return 1;

    // Name starts with query
    const aNameStarts = aName.startsWith(normalizedQuery);
    const bNameStarts = bName.startsWith(normalizedQuery);
    if (aNameStarts && !bNameStarts) return -1;
    if (!aNameStarts && bNameStarts) return 1;

    // Alphabetical by symbol
    return aSymbol.localeCompare(bSymbol);
  });

  return matches.slice(0, limit);
}

/**
 * GET /api/tickers?q=<query>
 * 
 * Returns ticker autocomplete results
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    console.log(`[/api/tickers] Searching for: "${query}"`);

    // Search tickers (currently mock data)
    const results = searchTickers(query);

    console.log(`[/api/tickers] Found ${results.length} results`);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('[/api/tickers] Error:', error);
    return NextResponse.json(
      { error: 'Failed to search tickers' },
      { status: 500 }
    );
  }
}

/**
 * TODO: Replace mock data with real market API
 * 
 * Example integration with Polygon.io:
 * 
 * async function searchTickersPolygon(query: string): Promise<TickerResult[]> {
 *   const apiKey = process.env.POLYGON_API_KEY;
 *   const url = `https://api.polygon.io/v3/reference/tickers?search=${query}&active=true&limit=10&apiKey=${apiKey}`;
 *   
 *   const response = await fetch(url);
 *   const data = await response.json();
 *   
 *   return data.results.map((ticker: any) => ({
 *     symbol: ticker.ticker,
 *     name: ticker.name,
 *     exchange: ticker.primary_exchange,
 *     country: ticker.locale === 'us' ? 'USA' : ticker.locale,
 *   }));
 * }
 * 
 * Example integration with Finnhub:
 * 
 * async function searchTickersFinnhub(query: string): Promise<TickerResult[]> {
 *   const apiKey = process.env.FINNHUB_API_KEY;
 *   const url = `https://finnhub.io/api/v1/search?q=${query}&token=${apiKey}`;
 *   
 *   const response = await fetch(url);
 *   const data = await response.json();
 *   
 *   return data.result.slice(0, 10).map((ticker: any) => ({
 *     symbol: ticker.symbol,
 *     name: ticker.description,
 *     exchange: ticker.displaySymbol.split(':')[0] || 'N/A',
 *     country: ticker.type === 'Common Stock' ? 'USA' : undefined,
 *   }));
 * }
 */

