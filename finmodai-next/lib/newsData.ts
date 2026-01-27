/**
 * News Data Fetcher with sentiment classification
 * 
 * Tier 1: Finnhub Market News API (if FINNHUB_API_KEY configured)
 * Tier 2: Last cached snapshot
 * Tier 3: Static fallback data
 */

import type { MacroNewsArticle } from '@/types/macro';
import { scoreMarketRelevance } from './marketRelevance';

// In-memory cache with TTL
interface CacheEntry {
  data: MacroNewsArticle[];
  timestamp: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Fallback static data
const FALLBACK_ARTICLES: MacroNewsArticle[] = [
  {
    id: 'fallback-1',
    title: 'Market Update: Indices Show Mixed Performance',
    source: 'Market Data',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    url: '#',
    summary: 'Major indices showing mixed performance as investors digest economic data and corporate earnings.',
    aiInsight: 'Mixed signals suggest market consolidation. Monitor sector rotation for directional clues.',
    sentiment: 'neutral',
    tags: ['Markets', 'Economy'],
    marketRelevance: {
      score: 65,
      reason: 'Direct market movement',
      signals: ['market', 'earnings', 'economic data'],
    },
  },
  {
    id: 'fallback-2',
    title: 'Economic Data Releases This Week',
    source: 'Economic Calendar',
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    url: '#',
    summary: 'Key economic indicators scheduled for release including employment data and inflation metrics.',
    aiInsight: 'Data releases could drive volatility. Position sizing and risk management recommended.',
    sentiment: 'neutral',
    tags: ['Economy', 'Data'],
    marketRelevance: {
      score: 70,
      reason: 'Key economic indicator',
      signals: ['unemployment', 'inflation', 'economic'],
    },
  },
];

/**
 * Fetch macro news with fallback strategy
 */
export async function fetchMacroNews(window: string = '1W'): Promise<MacroNewsArticle[]> {
  // Check cache first
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    console.log('[newsData] Returning cached news');
    return filterByWindow(cache.data, window);
  }

  // Try Finnhub API if configured
  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (finnhubKey) {
    try {
      const data = await fetchFromFinnhub(finnhubKey);
      if (data && data.length > 0) {
        cache = { data, timestamp: Date.now() };
        console.log(`[newsData] ✅ Fetched ${data.length} articles from Finnhub`);
        return filterByWindow(data, window);
      }
    } catch (err) {
      console.error('[newsData] Finnhub fetch failed:', err);
    }
  }

  // Return cached data if available (even if expired)
  if (cache) {
    console.log('[newsData] Returning expired cache (API unavailable)');
    return filterByWindow(cache.data, window);
  }

  // Final fallback: static data
  console.log('[newsData] Using fallback data (no API key or cache)');
  return FALLBACK_ARTICLES;
}

/**
 * Fetch from Finnhub Market News API
 * Docs: https://finnhub.io/docs/api/market-news
 */
async function fetchFromFinnhub(apiKey: string): Promise<MacroNewsArticle[]> {
  try {
    // Fetch general market news
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`,
      { next: { revalidate: 600 } } // Cache for 10 minutes
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid response format');
    }

    // Transform Finnhub articles to our format
    const articles: MacroNewsArticle[] = data.slice(0, 20).map((item: any, index: number) => {
      const sentiment = classifySentiment(item.headline, item.summary);
      const tags = extractTags(item.headline, item.summary);
      const marketRelevance = scoreMarketRelevance(
        item.headline || '',
        item.summary || '',
        tags
      );
      
      return {
        id: `finnhub-${item.id || index}`,
        title: item.headline || 'Untitled',
        source: item.source || 'Market News',
        publishedAt: new Date(item.datetime * 1000).toISOString(),
        url: item.url || '#',
        summary: item.summary || item.headline || '',
        aiInsight: generateInsight(item.headline, item.summary, sentiment),
        sentiment,
        tags,
        marketRelevance,
      };
    });

    // Filter by market relevance (minimum score: 30)
    const relevantArticles = articles.filter(article => 
      (article.marketRelevance?.score || 0) >= 30
    );

    console.log(`[newsData] Filtered ${articles.length} → ${relevantArticles.length} market-relevant articles`);
    return relevantArticles;
  } catch (err) {
    console.error('[newsData] Finnhub fetch error:', err);
    return [];
  }
}

/**
 * Classify sentiment based on headline and summary
 * Simple keyword-based classification (can be enhanced with OpenAI)
 */
function classifySentiment(headline: string, summary: string): 'bullish' | 'bearish' | 'neutral' {
  const text = `${headline} ${summary}`.toLowerCase();
  
  const bullishKeywords = [
    'surge', 'rally', 'gain', 'rise', 'jump', 'soar', 'climb', 'advance',
    'beat', 'exceed', 'outperform', 'strong', 'robust', 'growth', 'positive',
    'optimis', 'bullish', 'upgrade', 'buy', 'recovery', 'rebound'
  ];
  
  const bearishKeywords = [
    'fall', 'drop', 'plunge', 'decline', 'tumble', 'crash', 'sink', 'slide',
    'miss', 'disappoint', 'weak', 'concern', 'worry', 'risk', 'negative',
    'pessimis', 'bearish', 'downgrade', 'sell', 'recession', 'crisis'
  ];
  
  let bullishScore = 0;
  let bearishScore = 0;
  
  bullishKeywords.forEach(keyword => {
    if (text.includes(keyword)) bullishScore++;
  });
  
  bearishKeywords.forEach(keyword => {
    if (text.includes(keyword)) bearishScore++;
  });
  
  if (bullishScore > bearishScore && bullishScore >= 2) return 'bullish';
  if (bearishScore > bullishScore && bearishScore >= 2) return 'bearish';
  return 'neutral';
}

/**
 * Extract relevant tags from headline and summary
 */
function extractTags(headline: string, summary: string): string[] {
  const text = `${headline} ${summary}`.toLowerCase();
  const tags: string[] = [];
  
  const tagKeywords: Record<string, string[]> = {
    'Fed': ['fed', 'federal reserve', 'powell', 'fomc'],
    'Rates': ['interest rate', 'rate cut', 'rate hike', 'yield'],
    'Inflation': ['inflation', 'cpi', 'pce', 'price'],
    'Employment': ['job', 'employment', 'unemployment', 'payroll', 'labor'],
    'Economy': ['gdp', 'economic', 'economy', 'growth'],
    'Earnings': ['earnings', 'profit', 'revenue', 'eps'],
    'Tech': ['tech', 'technology', 'ai', 'software'],
    'Energy': ['oil', 'energy', 'crude', 'opec'],
    'China': ['china', 'chinese', 'beijing'],
    'Europe': ['europe', 'eu', 'ecb', 'euro'],
  };
  
  Object.entries(tagKeywords).forEach(([tag, keywords]) => {
    if (keywords.some(keyword => text.includes(keyword))) {
      tags.push(tag);
    }
  });
  
  return tags.slice(0, 3); // Limit to 3 tags
}

/**
 * Generate AI insight based on headline, summary, and sentiment
 */
function generateInsight(headline: string, summary: string, sentiment: 'bullish' | 'bearish' | 'neutral'): string {
  const text = `${headline} ${summary}`.toLowerCase();
  
  // Pattern matching for common scenarios
  if (text.includes('fed') || text.includes('interest rate')) {
    if (sentiment === 'bullish') {
      return 'Rate cut expectations could support equity valuations and reduce discount rates in DCF models.';
    } else if (sentiment === 'bearish') {
      return 'Higher rates increase cost of capital and pressure valuations, especially for growth stocks.';
    }
    return 'Monitor Fed policy signals for directional impact on equity valuations.';
  }
  
  if (text.includes('earnings') || text.includes('profit')) {
    if (sentiment === 'bullish') {
      return 'Strong earnings support higher valuations and could drive multiple expansion.';
    } else if (sentiment === 'bearish') {
      return 'Earnings misses suggest margin pressure and could trigger multiple compression.';
    }
    return 'Earnings trends provide insight into operating leverage and margin trajectory.';
  }
  
  if (text.includes('inflation') || text.includes('cpi')) {
    if (sentiment === 'bullish') {
      return 'Cooling inflation supports Fed easing and reduces discount rates for long-duration assets.';
    } else if (sentiment === 'bearish') {
      return 'Rising inflation pressures Fed to maintain restrictive policy, headwind for equities.';
    }
    return 'Inflation trajectory drives Fed policy and impacts real returns across asset classes.';
  }
  
  // Default insights by sentiment
  if (sentiment === 'bullish') {
    return 'Positive developments support risk-on positioning and could drive equity multiple expansion.';
  } else if (sentiment === 'bearish') {
    return 'Headwinds suggest caution and potential for multiple compression or volatility.';
  }
  
  return 'Monitor for follow-through and confirmation from other market indicators.';
}

/**
 * Filter articles by time window
 */
function filterByWindow(articles: MacroNewsArticle[], window: string): MacroNewsArticle[] {
  const cutoffTime = getCutoffTime(window);
  return articles.filter(article => {
    const publishedTime = new Date(article.publishedAt).getTime();
    return publishedTime >= cutoffTime;
  });
}

/**
 * Get cutoff time for news window
 */
function getCutoffTime(window: string): number {
  const now = Date.now();
  switch (window) {
    case 'today':
      return now - 24 * 60 * 60 * 1000; // 24 hours
    case '1W':
      return now - 7 * 24 * 60 * 60 * 1000; // 7 days
    case '1M':
      return now - 30 * 24 * 60 * 60 * 1000; // 30 days
    default:
      return now - 7 * 24 * 60 * 60 * 1000; // Default 7 days
  }
}

