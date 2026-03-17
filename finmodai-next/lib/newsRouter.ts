/**
 * News Routing Classifier
 * 
 * Two-stage gate to route articles to Market Brief vs World Brief
 * Non-negotiable: Market Brief shows ONLY market-relevant stories
 */

import OpenAI from 'openai';
import type { MacroNewsItem } from './fetchMacroNews';
import { filterHeadlines, type CuratedHeadline } from './headlineFilter';

export type NewsLane = 'market' | 'world' | 'drop';

export type NewsTopic =
  | 'rates'
  | 'inflation'
  | 'equities'
  | 'credit'
  | 'fx'
  | 'commodities'
  | 'policy'
  | 'geopolitics'
  | 'trade'
  | 'energy'
  | 'cyber'
  | 'other';

export interface NewsRouting {
  lane: NewsLane;
  market_relevance_score: number; // 0-100
  world_relevance_score: number; // 0-100
  market_reason: string; // Short explanation
  world_reason: string; // Short explanation
  topics: NewsTopic[];
  confidence: 'low' | 'medium' | 'high';
  // Cached classification key
  classification_key: string;
}

/**
 * Stage 1: Quality Filter (fast, deterministic)
 * Drops low-quality sources and non-market patterns before AI classification
 */
export function stage1QualityFilter(article: MacroNewsItem): {
  passed: boolean;
  reason?: string;
} {
  const title = article.title.toLowerCase();
  const url = article.url.toLowerCase();
  const summary = (article.summary || '').toLowerCase();
  const combined = `${title} ${summary}`;

  // Domain blacklist (how-to sites, hobby blogs, content mills)
  const blacklistedDomains = [
    'howto',
    'guide',
    'tutorial',
    'tips',
    'review',
    'best',
    'top',
    'list',
    'wiki',
    'reddit.com/r/',
    'youtube.com/watch',
    'github.com/releases',
    'producthunt.com',
  ];

  for (const domain of blacklistedDomains) {
    if (url.includes(domain)) {
      return { passed: false, reason: `Blacklisted domain pattern: ${domain}` };
    }
  }

  // Non-market headline patterns
  const nonMarketPatterns = [
    /how long/i,
    /how big/i,
    /how much/i,
    /how to/i,
    /best way to/i,
    /best .* for/i,
    /released version/i,
    /version \d+\.\d+/i,
    /release notes/i,
    /changelog/i,
    /review:/i,
    /tips for/i,
    /guide to/i,
    /tutorial/i,
    /how does/i,
    /what is/i,
    /bird feeder/i,
    /pleco tank/i,
    /tank size/i,
    /shotcut/i,
    /portable released/i,
  ];

  for (const pattern of nonMarketPatterns) {
    if (pattern.test(title)) {
      return { passed: false, reason: `Non-market pattern: ${pattern}` };
    }
  }

  // Generic "how-to" or hobby content keywords
  const hobbyKeywords = [
    'bird feeder',
    'pleco',
    'aquarium',
    'tank size',
    'pet care',
    'home garden',
    'diy project',
    'craft',
    'recipe',
    'cooking tips',
    'fitness routine',
    'workout plan',
  ];

  for (const keyword of hobbyKeywords) {
    if (combined.includes(keyword)) {
      return { passed: false, reason: `Hobby/lifestyle keyword: ${keyword}` };
    }
  }

  // Software release patterns (unless it's a major platform/OS release)
  const softwareReleasePatterns = [
    /^.* released$/i,
    /version \d+\.\d+\.\d+ released/i,
    /new update for/i,
    /changelog/i,
  ];

  const isMajorPlatform = /(windows|ios|android|macos|linux|chrome|firefox|safari)/i.test(title);
  if (!isMajorPlatform) {
    for (const pattern of softwareReleasePatterns) {
      if (pattern.test(title)) {
        return { passed: false, reason: `Software release pattern: ${pattern}` };
      }
    }
  }

  return { passed: true };
}

/**
 * Stage 2: LLM Classification (strict schema)
 */
export async function stage2LLMClassification(
  article: MacroNewsItem,
  openai: OpenAI | null
): Promise<NewsRouting> {
  const classificationKey = `news-routing:${article.url}:${article.publishedAt}`;
  
  // Check cache first
  try {
    const { default: apiCache, TTL } = await import('./apiCache');
    const cached = apiCache.get<NewsRouting>(classificationKey);
    if (cached) {
      console.log(`[newsRouter] Using cached routing for: ${article.title}`);
      return cached;
    }
  } catch (error) {
    // Cache not available, continue
  }

  // If no OpenAI, default to conservative routing (world or drop)
  if (!openai) {
    return {
      lane: 'world',
      market_relevance_score: 0,
      world_relevance_score: 50,
      market_reason: 'AI unavailable - defaulting to world',
      world_reason: 'AI unavailable - defaulting to world',
      topics: ['other'],
      confidence: 'low',
      classification_key: classificationKey,
    };
  }

  try {
    const prompt = `You are a news routing classifier for CapitalBase, a financial platform.

Your task: Classify this article into one of three lanes: "market", "world", or "drop".

**Market Brief (finance-first)** - Include ONLY if directly market-relevant:
- Central banks / rates / inflation / CPI / jobs / GDP
- Equities / indices / market moves / earnings / guidance
- Credit spreads / bonds / yields / treasuries
- FX / commodities (oil/gas/metals) with economic relevance
- Systemic risk / banking / liquidity / financial regulation that impacts markets
- Corporate actions (M&A, IPOs, buybacks) and major sector news
- Major economic policy with measurable market implications

**World Brief (macro + geopolitics)** - Include if:
- Geopolitical conflict & diplomacy
- Sanctions / trade controls
- Elections & governance
- Energy security
- Climate disasters
- Cyber & security
- Policy/regulation (non-market specific)

**Drop** - Exclude if:
- Pets, home & garden, hobbies, health tips, consumer how-to
- Software/app release notes (unless major platform)
- Lifestyle content
- Generic "world stability" without clear market transmission
- Examples: "bird feeder", "pleco tank size", "Shotcut release"

Article:
Title: ${article.title}
Source: ${article.source}
${article.summary ? `Summary: ${article.summary}` : ''}
URL: ${article.url}

Return JSON:
{
  "lane": "market" | "world" | "drop",
  "market_relevance_score": 0-100,
  "world_relevance_score": 0-100,
  "market_reason": "short explanation (1 sentence)",
  "world_reason": "short explanation (1 sentence)",
  "topics": ["rates","inflation","equities","credit","fx","commodities","policy","geopolitics","trade","energy","cyber","other"],
  "confidence": "low"|"medium"|"high"
}

**Threshold Rules:**
- Market Brief requires: lane="market" AND market_relevance_score >= 70 AND confidence != "low"
- World Brief requires: world_relevance_score >= 60
- When in doubt: world > drop > market (never route uncertain items to Market Brief)

Be strict. Market Brief must contain ZERO hobby/how-to/software-release items.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      messages: [
        {
          role: 'system',
          content: 'You are a strict news routing classifier. Market Brief must only contain market-relevant stories. When uncertain, route to World Brief or drop, never to Market Brief.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2, // Lower temperature for more consistent classification
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    // Validate and normalize
    const lane = ['market', 'world', 'drop'].includes(parsed.lane)
      ? (parsed.lane as NewsLane)
      : 'drop';

    const marketScore = Math.max(0, Math.min(100, Number(parsed.market_relevance_score) || 0));
    const worldScore = Math.max(0, Math.min(100, Number(parsed.world_relevance_score) || 0));

    const confidence = ['low', 'medium', 'high'].includes(parsed.confidence)
      ? (parsed.confidence as 'low' | 'medium' | 'high')
      : 'low';

    const validTopics: NewsTopic[] = [
      'rates',
      'inflation',
      'equities',
      'credit',
      'fx',
      'commodities',
      'policy',
      'geopolitics',
      'trade',
      'energy',
      'cyber',
      'other',
    ];

    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter((t: string) => validTopics.includes(t as NewsTopic)).slice(0, 5)
      : ['other'];

    // Apply threshold rules
    let finalLane: NewsLane = lane;
    if (lane === 'market') {
      // Market Brief requires: score >= 70 AND confidence != "low"
      if (marketScore < 70 || confidence === 'low') {
        // Downgrade to world or drop
        finalLane = worldScore >= 60 ? 'world' : 'drop';
      }
    } else if (lane === 'world') {
      // World Brief requires: score >= 60
      if (worldScore < 60) {
        finalLane = 'drop';
      }
    }

    // When in doubt: world > drop > market
    if (confidence === 'low' && finalLane === 'market') {
      finalLane = worldScore >= 50 ? 'world' : 'drop';
    }

    const routing: NewsRouting = {
      lane: finalLane,
      market_relevance_score: marketScore,
      world_relevance_score: worldScore,
      market_reason: parsed.market_reason || 'No market relevance',
      world_reason: parsed.world_reason || 'No world relevance',
      topics: topics.length > 0 ? topics : ['other'],
      confidence,
      classification_key: classificationKey,
    };

    // Cache result
    try {
      const { default: apiCache, TTL } = await import('./apiCache');
      apiCache.set(classificationKey, routing, TTL.ONE_DAY);
    } catch (error) {
      // Cache not available, continue
    }

    return routing;
  } catch (error) {
    console.error('[newsRouter] LLM classification failed:', error);
    // Conservative fallback: route to world or drop, never market
    return {
      lane: 'world',
      market_relevance_score: 0,
      world_relevance_score: 50,
      market_reason: 'Classification failed - defaulting to world',
      world_reason: 'Classification failed - defaulting to world',
      topics: ['other'],
      confidence: 'low',
      classification_key: classificationKey,
    };
  }
}

/**
 * Route an article through the two-stage gate
 */
export async function routeArticle(
  article: MacroNewsItem,
  openai: OpenAI | null,
  manualOverride?: { lane?: NewsLane } // Dev-only override
): Promise<NewsRouting> {
  // Stage 1: Quality filter
  const stage1Result = stage1QualityFilter(article);
  if (!stage1Result.passed) {
    // Failed Stage 1 → NOT eligible for Market Brief
    // Could route to World Brief if geopolitical, but for now drop it
    const routing: NewsRouting = {
      lane: 'drop',
      market_relevance_score: 0,
      world_relevance_score: 0,
      market_reason: `Failed quality filter: ${stage1Result.reason}`,
      world_reason: `Failed quality filter: ${stage1Result.reason}`,
      topics: ['other'],
      confidence: 'high', // High confidence in rejection
      classification_key: `news-routing:${article.url}:${article.publishedAt}`,
    };

    // Manual override (dev only)
    if (manualOverride?.lane && process.env.NODE_ENV === 'development') {
      routing.lane = manualOverride.lane;
      console.log(`[newsRouter] Manual override: forcing lane to ${manualOverride.lane}`);
    }

    return routing;
  }

  // Stage 2: LLM classification
  const routing = await stage2LLMClassification(article, openai);

  // Manual override (dev only)
  if (manualOverride?.lane && process.env.NODE_ENV === 'development') {
    routing.lane = manualOverride.lane;
    console.log(`[newsRouter] Manual override: forcing lane to ${manualOverride.lane}`);
  }

  return routing;
}

/**
 * Deduplicate articles by URL canonicalization and title similarity
 */
export function deduplicateArticles<T extends { url: string; title: string; source: string }>(
  articles: T[]
): T[] {
  const seen = new Map<string, T>();
  const urlMap = new Map<string, T>();

  for (const article of articles) {
    // Canonicalize URL (remove query params, fragments, trailing slashes)
    const urlObj = new URL(article.url);
    const canonicalUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`.replace(
      /\/$/,
      ''
    );

    // Check for exact URL match
    if (urlMap.has(canonicalUrl)) {
      const existing = urlMap.get(canonicalUrl)!;
      // Keep the more reputable source (simplified: prefer certain domains)
      const reputableSources = ['reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'apnews.com'];
      const existingRep = reputableSources.some((s) => existing.source.toLowerCase().includes(s));
      const currentRep = reputableSources.some((s) => article.source.toLowerCase().includes(s));

      if (currentRep && !existingRep) {
        urlMap.set(canonicalUrl, article);
        seen.set(article.url, article);
      }
      continue;
    }

    // Check for title similarity (simple: normalized title match)
    const normalizedTitle = article.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let isDuplicate = false;
    for (const [existingUrl, existing] of seen.entries()) {
      const existingNormalized = existing.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // If titles are very similar (80%+ match), consider duplicate
      const similarity = calculateSimilarity(normalizedTitle, existingNormalized);
      if (similarity > 0.8) {
        // Keep more reputable source
        const reputableSources = ['reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'apnews.com'];
        const existingRep = reputableSources.some((s) => existing.source.toLowerCase().includes(s));
        const currentRep = reputableSources.some((s) => article.source.toLowerCase().includes(s));

        if (currentRep && !existingRep) {
          seen.delete(existingUrl);
          seen.set(article.url, article);
          urlMap.set(canonicalUrl, article);
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(article.url, article);
      urlMap.set(canonicalUrl, article);
    }
  }

  return Array.from(seen.values());
}

/**
 * Simple string similarity (Jaccard similarity on words)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Batch route articles with AI headline pre-curation.
 *
 * 1. Deduplicates input articles.
 * 2. Runs the headline filter to identify the top market-moving headlines.
 * 3. Fast-tracks curated headlines to `market` lane; remaining articles go
 *    through the standard two-stage (quality + LLM) routing.
 *
 * Returns a Map<url, NewsRouting> for every input article.
 */
export async function routeArticlesBatch(
  articles: MacroNewsItem[],
  openai: OpenAI | null
): Promise<{ routings: Map<string, NewsRouting>; curated: CuratedHeadline[] }> {
  const deduped = deduplicateArticles(articles);
  const routings = new Map<string, NewsRouting>();

  const curated = await filterHeadlines(
    deduped.map((a) => ({
      title: a.title,
      source: a.source,
      publishedAt: a.publishedAt,
      summary: a.summary,
    })),
    { openai: openai ?? undefined, maxResults: 10 }
  );

  const curatedTitles = new Set(
    curated.map((c) => c.headline.toLowerCase().replace(/\s+/g, ' ').trim())
  );

  const remaining: MacroNewsItem[] = [];

  for (const article of deduped) {
    const normalizedTitle = article.title.toLowerCase().replace(/\s+/g, ' ').trim();
    if (curatedTitles.has(normalizedTitle)) {
      routings.set(article.url, {
        lane: 'market',
        market_relevance_score: 85,
        world_relevance_score: 70,
        market_reason: 'Pre-curated by headline filter as market-moving',
        world_reason: 'Pre-curated by headline filter',
        topics: ['other'],
        confidence: 'high',
        classification_key: `news-routing:curated:${article.url}`,
      });
    } else {
      remaining.push(article);
    }
  }

  const BATCH_SIZE = 5;
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((article) => routeArticle(article, openai))
    );
    results.forEach((result, idx) => {
      const article = batch[idx];
      routings.set(
        article.url,
        result.status === 'fulfilled'
          ? result.value
          : {
              lane: 'drop',
              market_relevance_score: 0,
              world_relevance_score: 0,
              market_reason: 'Routing failed',
              world_reason: 'Routing failed',
              topics: ['other'],
              confidence: 'low',
              classification_key: `news-routing:${article.url}`,
            }
      );
    });
  }

  return { routings, curated };
}
