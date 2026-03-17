/**
 * Sector Performance Analysis
 * Fetches sector ETF data and calculates returns for time periods
 */

import { rateLimitedFetch } from './apiClient';
import apiCache, { cacheKeys, TTL } from './apiCache';
import OpenAI from 'openai';

export type TimeRange = '1M' | '3M' | '6M' | '1Y';

export interface SectorMove {
  sector: string;
  ticker: string;
  returnPct: number;
  direction: 'rising' | 'falling';
  driverSummary: string; // AI-generated, 1 sentence
  currentPrice?: number;
  periodStartPrice?: number;
}

export interface SectorSummary {
  period: TimeRange;
  rising: SectorMove[];
  falling: SectorMove[];
  generatedAt: string;
}

// Sector ETF mapping
const SECTOR_ETFS: Record<string, { ticker: string; name: string }> = {
  technology: { ticker: 'XLK', name: 'Technology' },
  financials: { ticker: 'XLF', name: 'Financials' },
  energy: { ticker: 'XLE', name: 'Energy' },
  consumer_discretionary: { ticker: 'XLY', name: 'Consumer Discretionary' },
  industrials: { ticker: 'XLI', name: 'Industrials' },
  healthcare: { ticker: 'XLV', name: 'Healthcare' },
  consumer_staples: { ticker: 'XLP', name: 'Consumer Staples' },
  utilities: { ticker: 'XLU', name: 'Utilities' },
  materials: { ticker: 'XLB', name: 'Materials' },
  real_estate: { ticker: 'XLRE', name: 'Real Estate' },
};

/**
 * Calculate days for time range
 */
function getDaysForRange(range: TimeRange): number {
  switch (range) {
    case '1M':
      return 30;
    case '3M':
      return 90;
    case '6M':
      return 180;
    case '1Y':
      return 365;
    default:
      return 30;
  }
}

/**
 * Fetch historical price data for a ticker
 */
async function fetchHistoricalPrices(ticker: string, days: number): Promise<{ current: number; periodStart: number } | null> {
  const cacheKey = `sector-prices-${ticker}-${days}`;
  const cached = apiCache.get<{ current: number; periodStart: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  // Try multiple data sources
  let currentPrice: number | null = null;
  let periodStartPrice: number | null = null;

  // 1. Try FMP API
  if (process.env.FMP_API_KEY) {
    try {
      const today = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const fromDate = startDate.toISOString().split('T')[0];
      const toDate = today.toISOString().split('T')[0];
      
      const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}?from=${fromDate}&to=${toDate}&apikey=${process.env.FMP_API_KEY}`;
      const response = await rateLimitedFetch('FMP', url);
      const data = await response.json();
      
      if (data.historical && Array.isArray(data.historical) && data.historical.length > 0) {
        // Most recent price
        currentPrice = data.historical[0].close;
        // Price at period start
        periodStartPrice = data.historical[data.historical.length - 1].close;
      }
    } catch (error) {
      console.warn(`[sectorPerformance] FMP fetch failed for ${ticker}:`, error);
    }
  }

  // 2. Try Alpha Vantage
  if ((!currentPrice || !periodStartPrice) && process.env.ALPHA_VANTAGE_API_KEY) {
    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}&outputsize=compact`;
      const response = await rateLimitedFetch('ALPHA_VANTAGE', url);
      const data = await response.json();
      
      if (data['Time Series (Daily)']) {
        const timeSeries = data['Time Series (Daily)'];
        const dates = Object.keys(timeSeries).sort().reverse();
        
        if (dates.length > 0) {
          currentPrice = parseFloat(timeSeries[dates[0]]['4. close']);
          
          // Find price closest to period start
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() - days);
          
          for (const date of dates.reverse()) {
            const dateObj = new Date(date);
            if (dateObj <= targetDate) {
              periodStartPrice = parseFloat(timeSeries[date]['4. close']);
              break;
            }
          }
          
          // Fallback to oldest available
          if (!periodStartPrice && dates.length > 0) {
            periodStartPrice = parseFloat(timeSeries[dates[dates.length - 1]]['4. close']);
          }
        }
      }
    } catch (error) {
      console.warn(`[sectorPerformance] Alpha Vantage fetch failed for ${ticker}:`, error);
    }
  }

  // 3. Try Polygon.io
  if ((!currentPrice || !periodStartPrice) && process.env.POLYGON_API_KEY) {
    try {
      const today = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const fromDate = startDate.toISOString().split('T')[0];
      const toDate = today.toISOString().split('T')[0];
      
      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=5000&apiKey=${process.env.POLYGON_API_KEY}`;
      const response = await rateLimitedFetch('POLYGON', url);
      const data = await response.json();
      
      if (data.results && Array.isArray(data.results) && data.results.length > 0) {
        currentPrice = data.results[data.results.length - 1].c; // Close price
        periodStartPrice = data.results[0].c; // First close price
      }
    } catch (error) {
      console.warn(`[sectorPerformance] Polygon fetch failed for ${ticker}:`, error);
    }
  }

  if (currentPrice && periodStartPrice && currentPrice > 0 && periodStartPrice > 0) {
    const result = { current: currentPrice, periodStart: periodStartPrice };
    apiCache.set(cacheKey, result, TTL.ONE_HOUR);
    return result;
  }

  return null;
}

/**
 * Generate AI driver summary for sector move
 */
async function generateDriverSummary(
  sector: string,
  ticker: string,
  returnPct: number,
  period: TimeRange
): Promise<string> {
  const { getOpenAIKey } = await import('@/lib/openaiKey');
  const apiKey = getOpenAIKey('service');
  const openai = apiKey ? new OpenAI({ apiKey }) : null;
  
  if (!openai) {
    // Fallback without AI
    const direction = returnPct > 0 ? 'outperformed' : 'underperformed';
    return `${sector} ${direction} with a ${Math.abs(returnPct).toFixed(1)}% return over the ${period} period.`;
  }

  try {
    const prompt = `Explain why the ${sector} sector (ETF: ${ticker}) moved ${returnPct > 0 ? 'up' : 'down'} ${Math.abs(returnPct).toFixed(1)}% over the past ${period}.

Focus on MACRO forces only:
- Interest rates and Fed policy
- Inflation trends
- Geopolitical events
- Commodity prices (if relevant)
- Trade policy
- Growth expectations
- Regulatory changes

Do NOT mention individual companies or stock-specific news.

Return a single, concise sentence (max 20 words) explaining the macro driver.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      messages: [
        {
          role: 'system',
          content: 'You are a macro strategist. Explain sector moves using macro forces only, not company-specific news. Be concise and data-driven.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    return summary || `${sector} moved ${returnPct > 0 ? 'higher' : 'lower'} over the ${period} period.`;
  } catch (error) {
    console.error(`[sectorPerformance] AI driver summary failed for ${sector}:`, error);
    const direction = returnPct > 0 ? 'outperformed' : 'underperformed';
    return `${sector} ${direction} with a ${Math.abs(returnPct).toFixed(1)}% return over the ${period} period.`;
  }
}

/**
 * Fetch sector performance for a time range
 */
export async function fetchSectorPerformance(period: TimeRange = '1M'): Promise<SectorSummary> {
  const cacheKey = `sector-performance-${period}`;
  const cached = apiCache.get<SectorSummary>(cacheKey);
  if (cached) {
    console.log(`[sectorPerformance] Using cached data for ${period}`);
    return cached;
  }

  console.log(`[sectorPerformance] Fetching sector performance for ${period}`);
  const days = getDaysForRange(period);
  
  const sectorMoves: SectorMove[] = [];

  // Fetch data for all sectors in parallel
  const sectorPromises = Object.entries(SECTOR_ETFS).map(async ([key, { ticker, name }]) => {
    try {
      const prices = await fetchHistoricalPrices(ticker, days);
      
      if (prices && prices.current > 0 && prices.periodStart > 0) {
        const returnPct = ((prices.current - prices.periodStart) / prices.periodStart) * 100;
        
        // Generate AI driver summary
        const driverSummary = await generateDriverSummary(name, ticker, returnPct, period);
        
        sectorMoves.push({
          sector: name,
          ticker,
          returnPct,
          direction: returnPct >= 0 ? 'rising' : 'falling',
          driverSummary,
          currentPrice: prices.current,
          periodStartPrice: prices.periodStart,
        });
      }
    } catch (error) {
      console.warn(`[sectorPerformance] Failed to fetch ${ticker}:`, error);
    }
  });

  await Promise.allSettled(sectorPromises);

  // Sort by return percentage
  sectorMoves.sort((a, b) => b.returnPct - a.returnPct);

  // Get top 3 rising and top 3 falling
  const rising = sectorMoves.filter(m => m.direction === 'rising').slice(0, 3);
  const falling = sectorMoves.filter(m => m.direction === 'falling').reverse().slice(0, 3);

  const summary: SectorSummary = {
    period,
    rising,
    falling,
    generatedAt: new Date().toISOString(),
  };

  apiCache.set(cacheKey, summary, TTL.ONE_HOUR);
  return summary;
}
