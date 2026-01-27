/**
 * Deterministic Event Impact Generator
 * Generates structured market impact with winners, losers, and tickers
 * NO LLM REQUIRED - pure rule-based logic
 */

import { tagHeadline, type ImpactTag } from './headlineTagger';

export type EventImpact = {
  baseCase: string; // One sentence
  winners: Array<{ category: string; tickers: string[]; direction: 'up' | 'down' }>;
  losers: Array<{ category: string; tickers: string[]; direction: 'up' | 'down' }>;
  keyTickers: string[]; // Max 8
};

/**
 * Extracts mentioned company tickers from headline
 * Returns array of tickers (2-5 uppercase letters, filtered for common words)
 */
export function extractMentionedTickers(headline: string): string[] {
  // Pattern: 2-5 uppercase letters (common ticker format)
  const tickerPattern = /\b([A-Z]{2,5})\b/g;
  const tickerMatches = headline.match(tickerPattern);
  
  if (!tickerMatches) return [];
  
  // Filter out common false positives
  const commonWords = new Set([
    'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 
    'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WHO', 
    'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'USA', 'US', 'UK', 'EU', 'CEO', 
    'CFO', 'IPO', 'SEC', 'FED', 'CPI', 'GDP', 'ETF', 'SPY', 'QQQ', 'DOW', 'NAS', 'NYSE'
  ]);
  
  const mentionedTickers = tickerMatches
    .filter(t => !commonWords.has(t) && t.length >= 2 && t.length <= 5)
    .map(t => t.toUpperCase());
  
  // Remove duplicates
  return Array.from(new Set(mentionedTickers));
}

/**
 * Cleans headline title: removes outlet fluff, keeps core subject/action
 */
export function cleanEventTitle(headline: string): string {
  let cleaned = headline.trim();
  
  // Remove common fluff prefixes
  const fluffPatterns = [
    /^why\s+/i,
    /^how\s+/i,
    /^what\s+you\s+need\s+to\s+know\s+about\s+/i,
    /^investors\s+should\s+/i,
    /^here's\s+why\s+/i,
    /^breaking:\s*/i,
    /^exclusive:\s*/i,
    /^analysis:\s*/i,
    /^opinion:\s*/i,
    /^editorial:\s*/i,
  ];
  
  for (const pattern of fluffPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove trailing fluff (but be careful not to remove important context)
  // Only remove if it's clearly explanatory fluff
  if (cleaned.includes('—')) {
    const parts = cleaned.split('—');
    if (parts.length > 1 && parts[1].length < 30) {
      // Short explanatory text after dash, likely fluff
      cleaned = parts[0].trim();
    }
  }
  
  // Remove trailing parentheses only if they contain explanatory text
  cleaned = cleaned.replace(/\s*\([^)]*explain[^)]*\)\s*$/i, '');
  cleaned = cleaned.replace(/\s*\([^)]*why[^)]*\)\s*$/i, '');
  
  // Sentence case
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  
  // Limit to 70 chars
  if (cleaned.length > 70) {
    cleaned = cleaned.substring(0, 67) + '...';
  }
  
  return cleaned.trim();
}

/**
 * Generates structured event impact with winners, losers, and tickers
 */
export function generateEventImpact(
  headline: string,
  impact: ImpactTag
): EventImpact {
  try {
    const lower = headline.toLowerCase();
    const mentionedTickers = extractMentionedTickers(headline);
  
  // Geopolitics impact - FIXED MAP
  if (impact === 'Geopolitics') {
    const baseTickers = ['LMT', 'RTX', 'NOC', 'XLE', 'XOM', 'GLD', 'DAL', 'UAL'];
    // Prioritize mentioned tickers, then add base tickers
    const allTickers = Array.from(new Set([...mentionedTickers, ...baseTickers])).slice(0, 6);
    
    return {
      baseCase: 'Geopolitical escalation raises risk premium, driving safe-haven flows and sector rotation.',
      winners: [
        { category: 'Defense', tickers: ['LMT', 'RTX', 'NOC'], direction: 'up' },
        { category: 'Oil', tickers: ['XLE', 'XOM'], direction: 'up' },
        { category: 'Gold', tickers: ['GLD'], direction: 'up' },
      ],
      losers: [
        { category: 'Airlines', tickers: ['DAL', 'UAL'], direction: 'down' },
        { category: 'Travel', tickers: ['CCL', 'BKNG'], direction: 'down' },
      ],
      keyTickers: allTickers,
    };
  }
  
  // Energy impact - FIXED MAP (direction determined by headline)
  if (impact === 'Energy') {
    const isUp = /oil.*up|crude.*rise|energy.*surge|opec.*cut|supply.*shock|price.*up/i.test(headline);
    const isDown = /oil.*down|crude.*fall|energy.*drop|opec.*increase|price.*down/i.test(headline);
    
    if (isUp) {
      const baseTickers = ['XLE', 'XOM', 'CVX', 'DAL', 'UAL'];
      const allTickers = Array.from(new Set([...mentionedTickers, ...baseTickers])).slice(0, 6);
      
      return {
        baseCase: 'Rising oil prices increase energy sector margins while raising input costs for energy-intensive sectors.',
        winners: [
          { category: 'Energy', tickers: ['XLE', 'XOM', 'CVX'], direction: 'up' },
        ],
        losers: [
          { category: 'Airlines', tickers: ['DAL', 'UAL'], direction: 'down' },
        ],
        keyTickers: allTickers,
      };
    } else if (isDown) {
      const baseTickers = ['XLE', 'XOM', 'CVX', 'DAL', 'UAL'];
      const allTickers = Array.from(new Set([...mentionedTickers, ...baseTickers])).slice(0, 6);
      
      return {
        baseCase: 'Falling oil prices reduce energy sector margins while lowering input costs for consumers and energy-intensive sectors.',
        winners: [
          { category: 'Airlines', tickers: ['DAL', 'UAL'], direction: 'up' },
        ],
        losers: [
          { category: 'Energy', tickers: ['XLE', 'XOM', 'CVX'], direction: 'down' },
        ],
        keyTickers: allTickers,
      };
    } else {
      // Neutral energy news
      const baseTickers = ['XLE', 'DAL'];
      const allTickers = Array.from(new Set([...mentionedTickers, ...baseTickers])).slice(0, 6);
      
      return {
        baseCase: 'Energy price movements drive sector rotation through input cost and margin changes.',
        winners: [
          { category: 'Energy', tickers: ['XLE'], direction: 'up' },
        ],
        losers: [
          { category: 'Airlines', tickers: ['DAL'], direction: 'down' },
        ],
        keyTickers: allTickers,
      };
    }
  }
  
  // Rates impact - FIXED MAP (direction determined by headline)
  if (impact === 'Rates') {
    const isHawkish = /fed.*hawk|rate.*hike|tighten|yield.*up|inflation.*hot|cpi.*high/i.test(headline);
    const isDovish = /fed.*dove|rate.*cut|ease|yield.*down|inflation.*cool|cpi.*low/i.test(headline);
    
    if (isHawkish) {
      const baseTickers = ['QQQ', 'XLK', 'XLRE', 'XLU', 'JPM', 'BAC'];
      const allTickers = Array.from(new Set([...mentionedTickers, ...baseTickers])).slice(0, 6);
      
      return {
        baseCase: 'Higher yields increase discount rates, pressuring duration-sensitive assets.',
        winners: [
          { category: 'Banks', tickers: ['JPM', 'BAC'], direction: 'up' },
        ],
        losers: [
          { category: 'Growth/Duration', tickers: ['QQQ', 'XLK'], direction: 'down' },
          { category: 'REITs', tickers: ['XLRE'], direction: 'down' },
          { category: 'Utilities', tickers: ['XLU'], direction: 'down' },
        ],
        keyTickers: allTickers,
      };
    } else if (isDovish) {
      const baseTickers = ['QQQ', 'XLK', 'XLRE', 'XLU', 'JPM'];
      const allTickers = Array.from(new Set([...mentionedTickers, ...baseTickers])).slice(0, 6);
      
      return {
        baseCase: 'Lower yields reduce discount rates, supporting duration-sensitive assets.',
        winners: [
          { category: 'Growth/Duration', tickers: ['QQQ', 'XLK'], direction: 'up' },
          { category: 'REITs', tickers: ['XLRE'], direction: 'up' },
          { category: 'Utilities', tickers: ['XLU'], direction: 'up' },
        ],
        losers: [
          { category: 'Banks', tickers: ['JPM'], direction: 'down' },
        ],
        keyTickers: allTickers,
      };
    } else {
      // Neutral/uncertain rates news
      const baseTickers = ['QQQ', 'XLRE', 'XLU', 'JPM'];
      const allTickers = Array.from(new Set([...mentionedTickers, ...baseTickers])).slice(0, 6);
      
      return {
        baseCase: 'Rate policy shifts impact duration-sensitive assets through discount rate changes.',
        winners: [
          { category: 'Banks', tickers: ['JPM'], direction: 'up' },
        ],
        losers: [
          { category: 'Growth/Duration', tickers: ['QQQ'], direction: 'down' },
          { category: 'REITs', tickers: ['XLRE'], direction: 'down' },
          { category: 'Utilities', tickers: ['XLU'], direction: 'down' },
        ],
        keyTickers: allTickers,
      };
    }
  }
  
  // Earnings impact - FIXED MAP (stock-specific + peers + sector ETF)
  if (impact === 'Earnings') {
    const primaryTicker = mentionedTickers.length > 0 ? mentionedTickers[0] : null;
    
    const isPositive = /beat|surprise|strong|guidance.*up|exceed/i.test(headline);
    const isNegative = /miss|weak|guidance.*down|cut|disappoint/i.test(headline);
    
    // For earnings, always prioritize mentioned tickers
    // If no ticker mentioned, use empty array (will be handled by impact map)
    let keyTickersList: string[] = [];
    
    if (primaryTicker) {
      // Include the primary ticker + up to 2 more mentioned tickers + sector ETF if applicable
      keyTickersList = mentionedTickers.slice(0, 3);
    }
    
    if (isPositive && primaryTicker) {
      return {
        baseCase: `${primaryTicker} earnings beat drives stock and sector outperformance.`,
        winners: [
          { category: 'Stock', tickers: [primaryTicker], direction: 'up' },
        ],
        losers: [],
        keyTickers: keyTickersList.length > 0 ? keyTickersList : [primaryTicker],
      };
    } else if (isNegative && primaryTicker) {
      return {
        baseCase: `${primaryTicker} earnings miss pressures stock and sector performance.`,
        winners: [],
        losers: [
          { category: 'Stock', tickers: [primaryTicker], direction: 'down' },
        ],
        keyTickers: keyTickersList.length > 0 ? keyTickersList : [primaryTicker],
      };
    } else if (primaryTicker) {
      return {
        baseCase: 'Earnings results drive stock-specific and sector rotation.',
        winners: [
          { category: 'Stock', tickers: [primaryTicker], direction: 'up' },
        ],
        losers: [],
        keyTickers: keyTickersList.length > 0 ? keyTickersList : [primaryTicker],
      };
    } else {
      return {
        baseCase: 'Earnings results drive stock-specific and sector rotation.',
        winners: [],
        losers: [],
        keyTickers: [],
      };
    }
  }
  
  // Financial Stress impact - FIXED MAP
  if (impact === 'Financial Stress') {
    const baseTickers = ['JPM', 'BAC', 'IWM', 'XLP', 'XLV'];
    const allTickers = Array.from(new Set([...mentionedTickers, ...baseTickers])).slice(0, 6);
    
    return {
      baseCase: 'Financial stress widens credit spreads and reduces risk appetite.',
      winners: [
        { category: 'Defensives', tickers: ['XLP', 'XLV'], direction: 'up' },
      ],
      losers: [
        { category: 'Banks', tickers: ['JPM', 'BAC'], direction: 'down' },
        { category: 'High Beta', tickers: ['IWM'], direction: 'down' },
      ],
      keyTickers: allTickers,
    };
  }
  
    // Macro/default impact
    return {
      baseCase: 'Macro developments drive market dynamics through sector rotation.',
      winners: [],
      losers: [],
      keyTickers: ['SPY', 'QQQ', 'XLE', 'GLD'], // Default fallback
    };
  } catch (error) {
    console.warn('Error generating event impact, using fallback:', error);
    // Return safe fallback if generation fails
    return {
      baseCase: 'Impact unavailable',
      winners: [],
      losers: [],
      keyTickers: ['SPY', 'QQQ', 'XLE', 'GLD'], // Default fallback
    };
  }
}

