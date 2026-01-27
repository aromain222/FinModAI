/**
 * GDELT Integration for Startup Signals and Macro Sentiment
 * 
 * GDELT (Global Database of Events, Language, and Tone) provides:
 * - News mentions and sentiment
 * - Theme extraction
 * - Geographic and temporal analysis
 * 
 * NOTE: GDELT is free but has rate limits. We use headline-level data only.
 */

import type { StartupSignal, MacroSentiment } from './types';

// GDELT API endpoints
const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_GEO_API = 'https://api.gdeltproject.org/api/v2/geo/geo';

interface GdeltArticle {
  url: string;
  urlmobile: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

interface GdeltResponse {
  articles: GdeltArticle[];
}

/**
 * Classify signal type from headline
 */
function classifySignal(headline: string): StartupSignal | null {
  const lower = headline.toLowerCase();
  
  if (lower.includes('funding') || lower.includes('raised') || lower.includes('investment') || lower.includes('series')) {
    return 'Funding';
  }
  if (lower.includes('hiring') || lower.includes('jobs') || lower.includes('employees') || lower.includes('workforce')) {
    return 'Hiring';
  }
  if (lower.includes('partner') || lower.includes('collaboration') || lower.includes('deal') || lower.includes('agreement')) {
    return 'Partnerships';
  }
  if (lower.includes('launch') || lower.includes('release') || lower.includes('product') || lower.includes('feature')) {
    return 'Product';
  }
  if (lower.includes('regulation') || lower.includes('compliance') || lower.includes('legal') || lower.includes('lawsuit')) {
    return 'Regulation';
  }
  if (lower.includes('press') || lower.includes('announce') || lower.includes('statement')) {
    return 'Press';
  }
  
  return null;
}

/**
 * Classify sentiment from headline
 */
function classifySentiment(headline: string): MacroSentiment {
  const lower = headline.toLowerCase();
  
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
    if (lower.includes(keyword)) bullishScore++;
  });
  
  bearishKeywords.forEach(keyword => {
    if (lower.includes(keyword)) bearishScore++;
  });
  
  if (bullishScore > bearishScore && bullishScore >= 2) return 'bullish';
  if (bearishScore > bullishScore && bearishScore >= 2) return 'bearish';
  return 'neutral';
}

/**
 * Extract themes from headline
 */
function extractThemes(headline: string): string[] {
  const lower = headline.toLowerCase();
  const themes: string[] = [];
  
  const themeKeywords: Record<string, string[]> = {
    'AI': ['ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt', 'claude'],
    'Fintech': ['fintech', 'payment', 'banking', 'crypto', 'blockchain', 'defi'],
    'DevTools': ['developer', 'devtools', 'api', 'cloud', 'infrastructure', 'saas'],
    'Healthcare': ['health', 'medical', 'biotech', 'pharma', 'hospital', 'patient'],
    'Climate': ['climate', 'carbon', 'renewable', 'energy', 'sustainability', 'green'],
    'Consumer': ['consumer', 'retail', 'ecommerce', 'shopping', 'marketplace'],
    'Enterprise': ['enterprise', 'b2b', 'business', 'corporate', 'saas'],
    'Crypto': ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'web3', 'nft'],
  };
  
  Object.entries(themeKeywords).forEach(([theme, keywords]) => {
    if (keywords.some(keyword => lower.includes(keyword))) {
      themes.push(theme);
    }
  });
  
  return themes;
}

/**
 * Fetch GDELT mentions for a company/topic
 * 
 * NOTE: GDELT API is free but has rate limits. Use sparingly.
 */
export async function fetchGdeltMentions(
  query: string,
  timespan: string = '7d'
): Promise<{
  articles: GdeltArticle[];
  mentionCount: number;
  signals: Record<StartupSignal, number>;
  themes: string[];
  sentiment: MacroSentiment;
}> {
  try {
    // Build GDELT query
    // Format: query=<term>&mode=artlist&maxrecords=250&timespan=7d&format=json
    const params = new URLSearchParams({
      query,
      mode: 'artlist',
      maxrecords: '50', // Limit to avoid rate limits
      timespan,
      format: 'json',
    });
    
    const url = `${GDELT_DOC_API}?${params.toString()}`;
    
    const response = await fetch(url, {
      next: { revalidate: 600 }, // Cache for 10 minutes
    });
    
    if (!response.ok) {
      console.error(`[GDELT] API error: ${response.status}`);
      return {
        articles: [],
        mentionCount: 0,
        signals: {} as Record<StartupSignal, number>,
        themes: [],
        sentiment: 'neutral',
      };
    }
    
    const data: GdeltResponse = await response.json();
    const articles = data.articles || [];
    
    // Analyze articles
    const signals: Record<StartupSignal, number> = {
      'Funding': 0,
      'Hiring': 0,
      'Partnerships': 0,
      'Product': 0,
      'Press': 0,
      'Regulation': 0,
    };
    
    const themeSet = new Set<string>();
    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;
    
    articles.forEach(article => {
      // Classify signal
      const signal = classifySignal(article.title);
      if (signal) {
        signals[signal]++;
      }
      
      // Extract themes
      const themes = extractThemes(article.title);
      themes.forEach(theme => themeSet.add(theme));
      
      // Classify sentiment
      const sentiment = classifySentiment(article.title);
      if (sentiment === 'bullish') bullishCount++;
      else if (sentiment === 'bearish') bearishCount++;
      else neutralCount++;
    });
    
    // Determine overall sentiment
    let overallSentiment: MacroSentiment = 'neutral';
    if (bullishCount > bearishCount && bullishCount > neutralCount) {
      overallSentiment = 'bullish';
    } else if (bearishCount > bullishCount && bearishCount > neutralCount) {
      overallSentiment = 'bearish';
    }
    
    return {
      articles,
      mentionCount: articles.length,
      signals,
      themes: Array.from(themeSet),
      sentiment: overallSentiment,
    };
  } catch (err) {
    console.error('[GDELT] Fetch error:', err);
    return {
      articles: [],
      mentionCount: 0,
      signals: {} as Record<StartupSignal, number>,
      themes: [],
      sentiment: 'neutral',
    };
  }
}

/**
 * Calculate momentum score from GDELT data
 * Returns 0-100 score based on mention count and recency
 */
export function calculateMomentumScore(mentionCount: number, timespan: string = '7d'): number {
  // Base score from mention count
  let score = Math.min(100, mentionCount * 2);
  
  // Adjust for timespan (shorter timespan = higher momentum)
  if (timespan === '1d') {
    score = Math.min(100, score * 1.5);
  } else if (timespan === '3d') {
    score = Math.min(100, score * 1.2);
  }
  
  return Math.floor(score);
}

/**
 * Batch fetch GDELT data for multiple companies
 * Returns a map of company name to momentum score
 */
export async function batchFetchGdeltMomentum(
  companies: string[],
  timespan: string = '7d'
): Promise<Record<string, number>> {
  const momentumMap: Record<string, number> = {};
  
  // Fetch in sequence to avoid rate limits (GDELT has strict rate limits)
  for (const company of companies) {
    try {
      const data = await fetchGdeltMentions(company, timespan);
      momentumMap[company] = calculateMomentumScore(data.mentionCount, timespan);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`[GDELT] Error fetching ${company}:`, err);
      momentumMap[company] = 0;
    }
  }
  
  return momentumMap;
}

