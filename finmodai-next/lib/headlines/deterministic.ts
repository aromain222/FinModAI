import { createHash } from 'crypto';

/**
 * Deterministic headline normalization layer
 * Used by Market Brief, Macro IQ, and future market surfaces
 * 
 * Strict, deterministic processing with no LLM calls or randomness
 */

export type HeadlineTopic = 'equities' | 'macro' | 'rates' | 'commodities' | 'crypto' | 'geopolitics';

export type HeadlineImpact = 'positive' | 'neutral' | 'negative';

export interface DeterministicHeadline {
  id: string; // Stable hash
  canonicalTitle: string; // Short, institution-style, no source tags
  topic: HeadlineTopic;
  impact: HeadlineImpact;
  confidence: number; // 0–1
  impactBullets: string[]; // 2–4 short bullets, deterministic
  publishedAt: string | null; // Best-effort
  source: string | null; // Best-effort
  url: string | null; // Best-effort
  // Legacy fields for backwards compatibility
  tickers?: string[]; // Extracted tickers
  labels?: string[]; // Semantic labels
}

// Source suffixes to remove from titles
const SOURCE_SUFFIXES = [
  / - Reuters$/i,
  /\| Reuters$/i,
  / - CNBC$/i,
  /\| CNBC$/i,
  / - Bloomberg$/i,
  /\| Bloomberg$/i,
  / - WSJ$/i,
  /\| WSJ$/i,
  / - Wall Street Journal$/i,
  /\| Wall Street Journal$/i,
  / - FT$/i,
  /\| FT$/i,
  / - Financial Times$/i,
  /\| Financial Times$/i,
  / - Yahoo Finance$/i,
  /\| Yahoo Finance$/i,
  / - MarketWatch$/i,
  /\| MarketWatch$/i,
  / - Business Insider$/i,
  /\| Business Insider$/i,
  / - Forbes$/i,
  /\| Forbes$/i,
  / - TheStreet$/i,
  /\| TheStreet$/i,
  / - Seeking Alpha$/i,
  /\| Seeking Alpha$/i,
  / - Benzinga$/i,
  /\| Benzinga$/i,
  / - Motley Fool$/i,
  /\| Motley Fool$/i,
  / - Barrons$/i,
  /\| Barrons$/i,
  / - MarketWatch$/i,
  /\| MarketWatch$/i,
  / \| .+$/i, // Generic pipe separator
];

// Keywords for topic classification (priority order matters)
const TOPIC_KEYWORDS: Record<HeadlineTopic, RegExp[]> = {
  equities: [
    /\b(earnings|eps|revenue|beat|miss|guidance|quarterly|q[1-4]|fy\d{4})\b/i,
    /\b(stock|equity|share|ticker|nasdaq|s&p|dow|djia)\b/i,
    /\b(profit|loss|net income|ebitda|operating income|margin)\b/i,
    /\b(ipo|spac|merger|acquisition|m&a|takeover|buyout)\b/i,
    /\b(upgrade|downgrade|analyst|price target|rating)\b/i,
  ],
  rates: [
    /\b(fed|federal reserve|fomc|interest rate|fed funds)\b/i,
    /\b(yield|treasury|10y|30y|bond|yields curve)\b/i,
    /\b(monetary policy|quantitative easing|qe|tightening)\b/i,
    /\b(ecb|boe|boj|central bank|rate cut|rate hike)\b/i,
  ],
  macro: [
    /\b(inflation|cpi|ppi|unemployment|jobs report|nfp)\b/i,
    /\b(gdp|economic growth|recession|recovery)\b/i,
    /\b(retail sales|manufacturing|ism|pmi|purchasing managers)\b/i,
    /\b(consumer confidence|spending|employment data)\b/i,
  ],
  commodities: [
    /\b(oil|crude|wti|brent|gasoline|natural gas)\b/i,
    /\b(gold|silver|copper|platinum|palladium|precious metal)\b/i,
    /\b(commodity|commodities|futures|wheat|corn|soybean)\b/i,
    /\b(energy|metals|agriculture|livestock)\b/i,
  ],
  crypto: [
    /\b(bitcoin|btc|ethereum|eth|cryptocurrency|crypto)\b/i,
    /\b(blockchain|defi|nft|web3|digital asset)\b/i,
    /\b(binance|coinbase|crypto exchange|stablecoin)\b/i,
    /\b(satoshi|altcoin|token|mining|hash rate)\b/i,
  ],
  geopolitics: [
    /\b(war|conflict|sanctions|tariff|trade war)\b/i,
    /\b(russia|ukraine|china|taiwan|iran|north korea)\b/i,
    /\b(geopolitical|geopolitics|election|political)\b/i,
    /\b(military|defense|security|summit|treaty|nato)\b/i,
    /\b(diplomacy|embassy|tension|escalation)\b/i,
  ],
};

// Impact detection keywords (scoring-based)
const POSITIVE_KEYWORDS: RegExp[] = [
  /\b(beat|surge|rally|jump|gain|rise|up|soar|climb|boost)\b/i,
  /\b(strong|growth|profit|positive|bullish|optimistic)\b/i,
  /\b(upgrade|buy|outperform|beat expectations)\b/i,
  /\b(expansion|improvement|record|high|peak)\b/i,
];

const NEGATIVE_KEYWORDS: RegExp[] = [
  /\b(miss|drop|fall|decline|plunge|crash|selloff)\b/i,
  /\b(weak|loss|negative|bearish|pessimistic|worry)\b/i,
  /\b(downgrade|sell|underperform|disappoint)\b/i,
  /\b(contraction|recession|concern|risk|threat)\b/i,
  /\b(cut|reduce|down|low|minimum|worst)\b/i,
];

// Impact bullet templates by topic
// Each template must return 2-4 bullets (deterministic, no LLM)
const IMPACT_TEMPLATES: Record<HeadlineTopic, (title: string, tickers: string[], impact: HeadlineImpact) => string[]> = {
  equities: (title, tickers, impact) => {
    const bullets: string[] = [];
    if (/\b(earnings|eps|revenue)\b/i.test(title)) {
      if (/\bbeat\b/i.test(title)) {
        bullets.push(`${tickers.length > 0 ? tickers.join(', ') + ' ' : ''}earnings exceeded expectations`);
      } else if (/\bmiss\b/i.test(title)) {
        bullets.push(`${tickers.length > 0 ? tickers.join(', ') + ' ' : ''}earnings fell short of expectations`);
      } else {
        bullets.push(`${tickers.length > 0 ? tickers.join(', ') + ' ' : ''}reported earnings`);
      }
      if (/\bguidance\b/i.test(title)) {
        bullets.push('Forward guidance updated');
      } else {
        bullets.push('Earnings call scheduled or completed');
      }
    } else if (/\b(upgrade|downgrade|analyst)\b/i.test(title)) {
      if (/\bupgrade\b/i.test(title)) {
        bullets.push(`Rating upgrade for ${tickers.length > 0 ? tickers.join(', ') : 'security'}`);
      } else if (/\bdowngrade\b/i.test(title)) {
        bullets.push(`Rating downgrade for ${tickers.length > 0 ? tickers.join(', ') : 'security'}`);
      } else {
        bullets.push(`Analyst coverage update for ${tickers.length > 0 ? tickers.join(', ') : 'security'}`);
      }
      const targetMatch = title.match(/price target.*?\$([\d.]+)/i);
      if (targetMatch) {
        bullets.push(`Price target: $${targetMatch[1]}`);
      } else {
        bullets.push('Investment bank research note published');
      }
    } else if (/\b(merger|acquisition|m&a|takeover)\b/i.test(title)) {
      const match = title.match(/\$([\d.]+)([bm])/i);
      if (match) {
        const value = match[1];
        const unit = match[2].toLowerCase() === 'b' ? 'billion' : 'million';
        bullets.push(`Deal valued at $${value}${unit}`);
      }
      if (tickers.length > 0) {
        bullets.push(`M&A activity involving ${tickers.join(', ')}`);
      } else {
        bullets.push('Merger or acquisition announced');
      }
    } else {
      // General equities activity
      if (tickers.length > 0) {
        bullets.push(`Market activity for ${tickers.join(', ')}`);
      } else {
        bullets.push('Equity market development');
      }
      bullets.push('Trading volume and price action monitored');
    }
    
    // Ensure 2-4 bullets
    while (bullets.length < 2) {
      bullets.push('Market reaction expected');
    }
    return bullets.slice(0, 4); // Cap at 4
  },
  
  rates: (title, tickers, impact) => {
    const bullets: string[] = [];
    if (/\b(fed|federal reserve|fomc)\b/i.test(title)) {
      bullets.push('Federal Reserve policy decision');
      if (/\b(cut|lower|reduce)\b/i.test(title)) {
        bullets.push('Interest rates lowered');
      } else if (/\b(hike|raise|increase)\b/i.test(title)) {
        bullets.push('Interest rates raised');
      } else {
        bullets.push('Monetary policy maintained');
      }
    } else if (/\b(yield|treasury|10y|30y|bond)\b/i.test(title)) {
      bullets.push('Treasury yield movement');
      bullets.push('Bond market repricing');
    } else {
      bullets.push('Interest rate environment update');
      bullets.push('Fixed income market implications');
    }
    
    // Ensure 2-4 bullets
    while (bullets.length < 2) {
      bullets.push('Rates impact on asset valuations');
    }
    return bullets.slice(0, 4); // Cap at 4
  },
  
  macro: (title, tickers, impact) => {
    const bullets: string[] = [];
    if (/\b(inflation|cpi|ppi)\b/i.test(title)) {
      bullets.push('Inflation data released');
      bullets.push('Price level implications');
    } else if (/\b(unemployment|jobs|nfp)\b/i.test(title)) {
      bullets.push('Employment data published');
      bullets.push('Labor market conditions');
    } else if (/\bgdp\b/i.test(title)) {
      bullets.push('GDP data released');
      bullets.push('Economic growth trajectory');
    } else {
      bullets.push('Macroeconomic indicator update');
      bullets.push('Economic data release');
    }
    
    // Ensure 2-4 bullets
    while (bullets.length < 2) {
      bullets.push('Market implications of macro data');
    }
    return bullets.slice(0, 4); // Cap at 4
  },
  
  commodities: (title, tickers, impact) => {
    const bullets: string[] = [];
    if (/\b(oil|crude|wti|brent)\b/i.test(title)) {
      bullets.push('Oil price movement');
      bullets.push('Energy market dynamics');
    } else if (/\b(gold|silver|precious metal)\b/i.test(title)) {
      bullets.push('Precious metals price update');
      bullets.push('Safe haven demand signal');
    } else if (/\b(agriculture|crop|grain)\b/i.test(title)) {
      bullets.push('Agricultural commodity pricing');
      bullets.push('Supply chain implications');
    } else {
      bullets.push('Commodity market development');
      bullets.push('Raw materials pricing');
    }
    
    // Ensure 2-4 bullets
    while (bullets.length < 2) {
      bullets.push('Commodity supply-demand balance');
    }
    return bullets.slice(0, 4); // Cap at 4
  },
  
  crypto: (title, tickers, impact) => {
    const bullets: string[] = [];
    if (/\b(bitcoin|btc)\b/i.test(title)) {
      bullets.push('Bitcoin price movement');
      bullets.push('Dominant cryptocurrency trend');
    } else if (/\b(ethereum|eth)\b/i.test(title)) {
      bullets.push('Ethereum price update');
      bullets.push('Smart contract platform activity');
    } else if (/\b(regulation|regulatory|sec|cfdc)\b/i.test(title)) {
      bullets.push('Cryptocurrency regulatory development');
      bullets.push('Policy impact on digital assets');
    } else {
      bullets.push('Cryptocurrency market activity');
      bullets.push('Digital asset price movement');
    }
    
    // Ensure 2-4 bullets
    while (bullets.length < 2) {
      bullets.push('Crypto market volatility');
    }
    return bullets.slice(0, 4); // Cap at 4
  },
  
  geopolitics: (title, tickers, impact) => {
    const bullets: string[] = [];
    if (/\b(sanctions|tariff|trade war)\b/i.test(title)) {
      bullets.push('Trade policy implications');
      bullets.push('International commerce impact');
    } else if (/\b(war|conflict|military)\b/i.test(title)) {
      bullets.push('Geopolitical tension update');
      bullets.push('Security risk assessment');
    } else if (/\b(election|political|president)\b/i.test(title)) {
      bullets.push('Political development');
      bullets.push('Policy uncertainty implications');
    } else {
      bullets.push('Geopolitical development');
      bullets.push('International relations update');
    }
    
    // Ensure 2-4 bullets
    while (bullets.length < 2) {
      bullets.push('Risk premium implications for markets');
    }
    return bullets.slice(0, 4); // Cap at 4
  },
};

/**
 * Clean title by removing source suffixes and normalizing whitespace
 */
function cleanTitle(title: string): string {
  if (!title || typeof title !== 'string') return '';
  
  let cleaned = title.trim();
  
  // Remove source suffixes
  for (const suffix of SOURCE_SUFFIXES) {
    cleaned = cleaned.replace(suffix, '').trim();
  }
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Override registry for canonical title normalization
 * Applies neutral, non-hallucinatory canonical labels for known escalation patterns
 */
type CanonicalOverride = {
  primaryPattern: RegExp; // First required keyword pattern
  secondaryPattern: RegExp; // Second required keyword pattern (both must match)
  canonical: string;
  labels: string[];
};

const CANONICAL_OVERRIDES: CanonicalOverride[] = [
  // Venezuela escalation pattern
  {
    primaryPattern: /\b(venezuela|venezuelan)\b/i,
    secondaryPattern: /\b(invasion|troops|military|escalation|conflict|tension|deployment|movement)\b/i,
    canonical: 'US–Venezuela escalation raises risk premium',
    labels: ['geopolitics', 'risk-off'],
  },
  // Fed surprise pattern
  {
    primaryPattern: /\b(fed|federal reserve|fomc|federal\s+reserve)\b/i,
    secondaryPattern: /\b(surprise|unexpected|shock|hawkish|dovish|reprice|repricing|reaction|pivot|shift)\b/i,
    canonical: 'Fed repricing drives rates-first selloff',
    labels: ['macro', 'rates'],
  },
  // Oil shock pattern
  {
    primaryPattern: /\b(oil|crude|wti|brent|petroleum)\b/i,
    secondaryPattern: /\b(shock|spike|surge|jump|surprise|escalation|rally|plunge)\b/i,
    canonical: 'Oil shock raises inflation impulse',
    labels: ['commodities', 'inflation'],
  },
  // Mega-cap earnings pattern
  {
    primaryPattern: /\b(apple|aapl|microsoft|msft|amazon|amzn|google|googl|meta|fb|facebook|nvidia|nvda|tesla|tsla|mega[-\s]?cap|faang|magnificent[-\s]?7|big\s+tech)\b/i,
    secondaryPattern: /\b(earnings|results|beat|miss|guidance|outlook|quarterly|revenue|profit)\b/i,
    canonical: 'Mega-cap earnings reset growth expectations',
    labels: ['earnings', 'tech'],
  },
];

/**
 * Normalize canonical title with override registry
 * Returns { canonicalTitle, labels } based on pattern matching
 * Rules only trigger when both primary and secondary patterns match (strong keywords present)
 * Ensures canonical title is short and institution-style (max 120 chars)
 */
function normalizeCanonicalTitle(title: string): { canonicalTitle: string; labels: string[] } {
  if (!title || typeof title !== 'string') {
    return { canonicalTitle: title || '', labels: [] };
  }
  
  // Check each override pattern - both primary and secondary must match
  for (const override of CANONICAL_OVERRIDES) {
    const primaryMatch = override.primaryPattern.test(title);
    const secondaryMatch = override.secondaryPattern.test(title);
    
    // Both patterns must match for override to trigger
    if (primaryMatch && secondaryMatch) {
      return {
        canonicalTitle: override.canonical,
        labels: override.labels,
      };
    }
  }
  
  // No override matched, return cleaned title (shortened if too long)
  // Ensure institution-style length (max 120 chars, truncate at word boundary)
  let canonical = title;
  if (canonical.length > 120) {
    canonical = canonical.substring(0, 120);
    const lastSpace = canonical.lastIndexOf(' ');
    if (lastSpace > 80) {
      canonical = canonical.substring(0, lastSpace) + '...';
    } else {
      canonical = canonical + '...';
    }
  }
  
  return {
    canonicalTitle: canonical,
    labels: [],
  };
}

/**
 * Extract tickers from title text
 * Handles formats like: $TSLA, (TSLA), TSLA, and bare tickers
 */
function extractTickers(title: string): string[] {
  if (!title || typeof title !== 'string') return [];
  
  const tickers = new Set<string>();
  
  // Pattern 1: $TICKER format
  const dollarMatches = title.match(/\$([A-Z]{1,5})\b/g);
  if (dollarMatches) {
    dollarMatches.forEach(match => {
      const ticker = match.slice(1).toUpperCase();
      if (ticker.length >= 1 && ticker.length <= 5) {
        tickers.add(ticker);
      }
    });
  }
  
  // Pattern 2: (TICKER) format
  const parenMatches = title.match(/\(([A-Z]{1,5})\)/g);
  if (parenMatches) {
    parenMatches.forEach(match => {
      const ticker = match.slice(1, -1).toUpperCase();
      if (ticker.length >= 1 && ticker.length <= 5) {
        tickers.add(ticker);
      }
    });
  }
  
  // Pattern 3: Standalone tickers (3-5 uppercase letters, basic heuristic)
  // This is a conservative heuristic - only match obvious ticker-like patterns
  // Skip common words and short abbreviations
  const commonWords = new Set([
    'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT',
    'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'MAN', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO',
    'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'CEO', 'CFO', 'SEC', 'FDA',
    'IRS', 'UK', 'US', 'EU', 'AI', 'IT', 'TV', 'PC', 'FY'
  ]);
  
  // Match uppercase sequences (3-5 chars, all uppercase, no numbers)
  // Only match if they look like stock tickers and aren't common words
  const standalonePattern = /\b([A-Z]{3,5})\b/g;
  let match;
  while ((match = standalonePattern.exec(title)) !== null) {
    const potentialTicker = match[1];
    // Only add if it looks like a ticker (3-5 chars, all uppercase, not a common word)
    if (
      potentialTicker.length >= 3 &&
      potentialTicker.length <= 5 &&
      !commonWords.has(potentialTicker) &&
      /^[A-Z]+$/.test(potentialTicker) // All uppercase letters only, no numbers
    ) {
      tickers.add(potentialTicker);
    }
  }
  
  return Array.from(tickers).sort();
}

/**
 * Classify headline topic based on keywords (priority order matters)
 */
function classifyTopic(title: string): HeadlineTopic {
  if (!title || typeof title !== 'string') return 'equities'; // Default fallback
  
  const titleLower = title.toLowerCase();
  
  // Check each topic in priority order
  // Rates checked before macro (more specific)
  // Crypto checked before commodities (more specific)
  const topics: HeadlineTopic[] = ['rates', 'crypto', 'equities', 'macro', 'commodities', 'geopolitics'];
  
  for (const topic of topics) {
    const keywords = TOPIC_KEYWORDS[topic];
    for (const pattern of keywords) {
      if (pattern.test(title)) {
        return topic;
      }
    }
  }
  
  // Default to equities if no match (most common market surface)
  return 'equities';
}

/**
 * Detect impact sentiment using keyword scoring
 */
function detectImpact(title: string): HeadlineImpact {
  if (!title || typeof title !== 'string') return 'neutral';
  
  const titleLower = title.toLowerCase();
  let positiveScore = 0;
  let negativeScore = 0;
  
  // Score positive keywords
  for (const pattern of POSITIVE_KEYWORDS) {
    if (pattern.test(title)) {
      positiveScore++;
    }
  }
  
  // Score negative keywords
  for (const pattern of NEGATIVE_KEYWORDS) {
    if (pattern.test(title)) {
      negativeScore++;
    }
  }
  
  // Classify based on score difference (threshold = 1)
  if (positiveScore > negativeScore && positiveScore > 0) {
    return 'positive';
  } else if (negativeScore > positiveScore && negativeScore > 0) {
    return 'negative';
  }
  
  return 'neutral';
}

/**
 * Calculate confidence score (0..1) based on heuristics
 */
function calculateConfidence(
  title: string,
  topic: HeadlineTopic,
  tickers: string[],
  publishedAt: string | null,
  source: string | null
): number {
  let score = 0.5; // Base confidence
  
  // Title quality
  if (title && title.length >= 20 && title.length <= 200) {
    score += 0.1;
  }
  
  // Topic specificity (specific topics get higher confidence)
  if (topic !== 'equities') { // Non-default topic is more specific
    score += 0.1;
  }
  
  // Ticker presence
  if (tickers.length > 0) {
    score += 0.1;
  }
  
  // Published date presence
  if (publishedAt) {
    score += 0.1;
  }
  
  // Source presence
  if (source) {
    score += 0.1;
  }
  
  // Cap at 1.0
  return Math.min(score, 1.0);
}

/**
 * Generate stable hash ID from title and publishedAt
 */
function generateStableId(title: string, publishedAt: string | null, url: string | null): string {
  const content = [title, publishedAt || '', url || ''].filter(Boolean).join('|');
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Generate impact bullets based on topic, title, and impact (2-4 bullets)
 */
function generateImpactBullets(topic: HeadlineTopic, title: string, tickers: string[], impact: HeadlineImpact): string[] {
  const template = IMPACT_TEMPLATES[topic];
  return template(title, tickers, impact);
}

/**
 * Main function: Convert raw headline items to deterministic schema
 */
export function deterministicHeadlines(rawItems: any[]): DeterministicHeadline[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }
  
  return rawItems
    .filter(item => item != null) // Remove null/undefined
    .map(item => {
      try {
        // Extract raw fields with best-effort parsing
        const rawTitle = item.title || item.headline || item.name || '';
        const rawPublishedAt = item.publishedAt || item.published_at || item.date || item.pubDate || null;
        const rawSource = item.source || item.provider || item.site || null;
        const rawUrl = item.url || item.link || item.href || null;
        
        // Clean title (remove source suffixes, normalize whitespace)
        const cleanedTitle = cleanTitle(rawTitle);
        
        // Skip if no title after cleaning
        if (!cleanedTitle) {
          return null;
        }
        
        // Apply canonical override rules (normalize with override registry)
        const { canonicalTitle, labels } = normalizeCanonicalTitle(cleanedTitle);
        
        // Extract tickers from original cleaned title (before override)
        const tickers = extractTickers(cleanedTitle);
        
        // Classify topic from original cleaned title (before override)
        const topic = classifyTopic(cleanedTitle);
        
        // Detect impact sentiment from cleaned title
        const impact = detectImpact(cleanedTitle);
        
        // Generate impact bullets (2-4 bullets, deterministic)
        const impactBullets = generateImpactBullets(topic, canonicalTitle, tickers, impact);
        
        // Calculate confidence (0-1)
        const confidence = calculateConfidence(canonicalTitle, topic, tickers, rawPublishedAt, rawSource);
        
        // Generate stable ID from canonical title (includes override if applied)
        const id = generateStableId(canonicalTitle, rawPublishedAt, rawUrl);
        
        // Normalize publishedAt to string or null
        const publishedAt = rawPublishedAt ? String(rawPublishedAt) : null;
        
        // Normalize source to string or null
        const source = rawSource ? String(rawSource) : null;
        
        // Normalize url to string or null
        const url = rawUrl ? String(rawUrl) : null;
        
        // Build result object (strict schema)
        const result: DeterministicHeadline = {
          id,
          canonicalTitle,
          topic,
          impact,
          confidence,
          impactBullets,
          publishedAt,
          source,
          url,
        };
        
        // Add optional fields for backwards compatibility
        if (tickers.length > 0) {
          result.tickers = tickers;
        }
        if (labels.length > 0) {
          result.labels = labels;
        }
        
        return result;
      } catch (error) {
        // Gracefully handle errors for malformed items
        console.warn('[deterministicHeadlines] Error processing item:', error);
        return null;
      }
    })
    .filter((item): item is DeterministicHeadline => item !== null);
}

