/**
 * Market Relevance Scoring System
 * 
 * Filters out lifestyle content, advice columns, and non-market news.
 * Only surfaces content that matters to markets.
 */

export interface RelevanceScore {
  score: number; // 0-100
  reason: string; // Why this matters to markets
  signals: string[]; // What made it relevant
}

// Market-relevant keywords and their weights
const MARKET_SIGNALS = {
  // High relevance (20 points each)
  high: [
    'earnings', 'ipo', 'merger', 'acquisition', 'm&a',
    'fed', 'federal reserve', 'interest rate', 'rate cut', 'rate hike',
    'inflation', 'cpi', 'pce', 'unemployment', 'jobs report',
    'gdp', 'recession', 'economic growth',
    'stock', 'shares', 'market', 'trading', 'investor',
    'sec', 'regulation', 'antitrust',
    'oil price', 'commodity', 'treasury', 'bond yield',
    'dollar', 'currency', 'forex',
    'bankruptcy', 'default', 'debt',
    'guidance', 'forecast', 'outlook',
    'valuation', 'multiple', 'pe ratio',
  ],
  
  // Medium relevance (10 points each)
  medium: [
    'company', 'ceo', 'executive', 'board',
    'revenue', 'profit', 'sales', 'growth',
    'sector', 'industry', 'market share',
    'technology', 'ai', 'artificial intelligence',
    'energy', 'healthcare', 'financial', 'tech',
    'startup', 'venture capital', 'funding',
    'policy', 'legislation', 'government',
    'china', 'europe', 'global',
    'supply chain', 'manufacturing',
  ],
  
  // Low relevance (5 points each)
  low: [
    'business', 'economy', 'economic',
    'consumer', 'spending', 'retail',
    'employment', 'hiring', 'layoff',
  ],
};

// Anti-signals: content that is NOT market-relevant
const LIFESTYLE_SIGNALS = [
  'holiday', 'christmas', 'thanksgiving', 'vacation',
  'gift', 'shopping tips', 'how to save',
  'personal finance', 'budget', 'savings account',
  'credit card', 'debt payoff', 'student loan',
  'retirement planning', '401k', 'ira',
  'real estate', 'home buying', 'mortgage',
  'career advice', 'job search', 'resume',
  'wellness', 'health tips', 'lifestyle',
  'etiquette', 'manners', 'social',
  'celebrity', 'entertainment',
];

// Company/ticker mentions boost relevance
const TICKER_PATTERN = /\b[A-Z]{1,5}\b/g; // Simple ticker detection
const COMPANY_INDICATORS = ['inc.', 'corp.', 'ltd.', 'llc', 'co.'];

/**
 * Score article for market relevance
 */
export function scoreMarketRelevance(
  title: string,
  summary: string,
  tags?: string[]
): RelevanceScore {
  const text = `${title} ${summary} ${tags?.join(' ') || ''}`.toLowerCase();
  
  let score = 0;
  const signals: string[] = [];
  
  // Check for lifestyle/non-market content (PENALTY)
  const lifestyleMatches = LIFESTYLE_SIGNALS.filter(signal => 
    text.includes(signal.toLowerCase())
  );
  
  if (lifestyleMatches.length > 0) {
    score -= lifestyleMatches.length * 15; // Heavy penalty
    signals.push(`Lifestyle content: ${lifestyleMatches.slice(0, 2).join(', ')}`);
  }
  
  // Check for high-relevance signals
  const highMatches = MARKET_SIGNALS.high.filter(signal => 
    text.includes(signal.toLowerCase())
  );
  score += highMatches.length * 20;
  if (highMatches.length > 0) {
    signals.push(...highMatches.slice(0, 3));
  }
  
  // Check for medium-relevance signals
  const mediumMatches = MARKET_SIGNALS.medium.filter(signal => 
    text.includes(signal.toLowerCase())
  );
  score += mediumMatches.length * 10;
  if (mediumMatches.length > 0 && highMatches.length === 0) {
    signals.push(...mediumMatches.slice(0, 2));
  }
  
  // Check for low-relevance signals
  const lowMatches = MARKET_SIGNALS.low.filter(signal => 
    text.includes(signal.toLowerCase())
  );
  score += lowMatches.length * 5;
  
  // Check for company/ticker mentions
  const tickers = (title + ' ' + summary).match(TICKER_PATTERN) || [];
  const companyMentions = COMPANY_INDICATORS.filter(indicator => 
    text.includes(indicator)
  );
  
  if (tickers.length > 0 || companyMentions.length > 0) {
    score += 15;
    signals.push('Company mention');
  }
  
  // Cap score at 100
  score = Math.min(Math.max(score, 0), 100);
  
  // Generate reason
  let reason = '';
  if (score >= 60) {
    reason = generateReason(highMatches, mediumMatches, tickers.length > 0);
  } else if (score >= 30) {
    reason = 'Indirect market impact';
  } else {
    reason = 'Limited market relevance';
  }
  
  return { score, reason, signals };
}

function generateReason(
  highMatches: string[],
  mediumMatches: string[],
  hasTickers: boolean
): string {
  if (highMatches.includes('earnings') || highMatches.includes('ipo')) {
    return 'Direct corporate action';
  }
  if (highMatches.includes('fed') || highMatches.includes('federal reserve') || 
      highMatches.includes('interest rate')) {
    return 'Monetary policy impact';
  }
  if (highMatches.includes('inflation') || highMatches.includes('cpi') || 
      highMatches.includes('unemployment')) {
    return 'Key economic indicator';
  }
  if (highMatches.includes('merger') || highMatches.includes('acquisition')) {
    return 'M&A activity';
  }
  if (highMatches.includes('sec') || highMatches.includes('regulation')) {
    return 'Regulatory development';
  }
  if (hasTickers) {
    return 'Company-specific news';
  }
  if (mediumMatches.includes('sector') || mediumMatches.includes('industry')) {
    return 'Sector trend';
  }
  if (mediumMatches.includes('startup') || mediumMatches.includes('venture capital')) {
    return 'Private market signal';
  }
  
  return 'Market-relevant development';
}

/**
 * Filter articles by minimum relevance threshold
 */
export function filterByRelevance(
  articles: Array<{ title: string; summary: string; tags?: string[] }>,
  minScore: number = 30
): Array<{ relevance: RelevanceScore }> {
  return articles
    .map(article => ({
      ...article,
      relevance: scoreMarketRelevance(article.title, article.summary, article.tags),
    }))
    .filter(article => article.relevance.score >= minScore);
}

/**
 * Get relevance indicator for UI
 */
export function getRelevanceIndicator(score: number): {
  label: string;
  color: string;
  show: boolean;
} {
  if (score >= 70) {
    return { label: 'High Signal', color: 'emerald', show: true };
  }
  if (score >= 50) {
    return { label: 'Market Relevant', color: 'blue', show: true };
  }
  if (score >= 30) {
    return { label: 'Indirect', color: 'slate', show: false };
  }
  return { label: 'Low Signal', color: 'slate', show: false };
}

