/**
 * Article Intelligence & Classification
 * AI-powered classification and enrichment for macro/geopolitical articles
 */

import OpenAI from 'openai';
import apiCache, { cacheKeys, TTL } from './apiCache';
import { getOpenAIKey } from './openaiKey';

export type ArticleCategory =
  | 'geopolitics'
  | 'policy'
  | 'defense'
  | 'elections'
  | 'sanctions'
  | 'trade'
  | 'energy'
  | 'china'
  | 'middle_east'
  | 'russia_ukraine'
  | 'other';

export type AffectedChannel =
  | 'risk'
  | 'rates'
  | 'energy'
  | 'trade'
  | 'defense'
  | 'capital_flows'
  | 'global_stability';

export interface ArticleIntelligence {
  category: ArticleCategory;
  whatHappened: string; // factual, 1 sentence
  whyItMatters: string; // macro / geopolitical relevance
  secondOrderImpacts: string[]; // optional, max 2 bullets
  affectedChannels: AffectedChannel[];
  confidence: 'low' | 'medium' | 'high';
}

export interface MacroNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = getOpenAIKey('service');
  return apiKey ? new OpenAI({ apiKey }) : null;
}

/**
 * Classify article category
 */
async function classifyArticle(title: string, summary?: string): Promise<ArticleCategory> {
  const openai = getOpenAIClient();
  if (!openai) return 'other';

  try {
    const prompt = `Classify this news article into ONE category:

Title: ${title}
${summary ? `Summary: ${summary}` : ''}

Categories:
- geopolitics: International relations, diplomatic events, regional tensions
- policy: Government policy, legislation, regulatory changes
- defense: Military operations, defense spending, security
- elections: Electoral processes, voting, political transitions
- sanctions: Economic sanctions, trade restrictions
- trade: Trade agreements, tariffs, commerce
- energy: Oil, gas, energy policy, OPEC
- china: China-specific events, US-China relations
- middle_east: Middle East regional events
- russia_ukraine: Russia-Ukraine conflict, related events
- other: Everything else

Return ONLY the category name, nothing else.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      messages: [
        {
          role: 'system',
          content: 'You are a news classification expert. Return only the category name.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 20,
    });

    const category = completion.choices[0]?.message?.content?.trim().toLowerCase();
    
    // Validate category
    const validCategories: ArticleCategory[] = [
      'geopolitics', 'policy', 'defense', 'elections', 'sanctions',
      'trade', 'energy', 'china', 'middle_east', 'russia_ukraine', 'other'
    ];
    
    if (category && validCategories.includes(category as ArticleCategory)) {
      return category as ArticleCategory;
    }
    
    return 'other';
  } catch (error) {
    console.error('[articleIntelligence] Classification failed:', error);
    return 'other';
  }
}

/**
 * Generate AI intelligence for an article
 */
export async function generateArticleIntelligence(
  article: MacroNewsItem
): Promise<ArticleIntelligence> {
  const cacheKey = `article-intel-${article.url}`;
  const cached = apiCache.get<ArticleIntelligence>(cacheKey);
  if (cached) {
    return cached;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    // Fallback without AI
    return {
      category: 'other',
      whatHappened: article.summary || article.title,
      whyItMatters: 'Macro relevance analysis unavailable',
      secondOrderImpacts: [],
      affectedChannels: [],
      confidence: 'low',
    };
  }

  try {
    // Step 1: Classify
    const category = await classifyArticle(article.title, article.summary);

    // Step 2: Generate intelligence
    const prompt = `Analyze this news article for macro and geopolitical intelligence:

Title: ${article.title}
Source: ${article.source}
${article.summary ? `Summary: ${article.summary}` : ''}
Category: ${category}

Generate intelligence focusing on:
- Risk perception
- Regional instability
- Trade corridors
- Energy supply
- Capital flow implications
- Global stability

DO NOT force stock or index commentary. If market impact is indirect, say so explicitly.

Return JSON:
{
  "whatHappened": "Factual 1-sentence description of the event",
  "whyItMatters": "1-2 sentences on macro/geopolitical relevance (not stock market)",
  "secondOrderImpacts": ["impact 1", "impact 2"] (max 2, optional),
  "affectedChannels": ["risk", "rates", "energy", "trade", "defense", "capital_flows", "global_stability"] (select relevant),
  "confidence": "low|medium|high"
}

Rules:
- Focus on macro forces, not equities
- If indirect market impact, state it explicitly
- Be specific about geopolitical implications
- Avoid generic statements`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      messages: [
        {
          role: 'system',
          content: 'You are a macro strategist and geopolitical analyst. Provide intelligence on macro/geopolitical relevance, not stock market commentary. Be specific and data-driven.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.6,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    const intelligence: ArticleIntelligence = {
      category,
      whatHappened: parsed.whatHappened || article.summary || article.title,
      whyItMatters: parsed.whyItMatters || 'Macro relevance analysis pending',
      secondOrderImpacts: Array.isArray(parsed.secondOrderImpacts) 
        ? parsed.secondOrderImpacts.slice(0, 2)
        : [],
      affectedChannels: Array.isArray(parsed.affectedChannels)
        ? parsed.affectedChannels.filter((ch: string) => 
            ['risk', 'rates', 'energy', 'trade', 'defense', 'capital_flows', 'global_stability'].includes(ch)
          )
        : [],
      confidence: parsed.confidence || 'medium',
    };

    apiCache.set(cacheKey, intelligence, TTL.ONE_DAY);
    return intelligence;
  } catch (error) {
    console.error('[articleIntelligence] Failed to generate intelligence:', error);
    return {
      category: 'other',
      whatHappened: article.summary || article.title,
      whyItMatters: 'Intelligence analysis unavailable',
      secondOrderImpacts: [],
      affectedChannels: [],
      confidence: 'low',
    };
  }
}

/**
 * Batch generate intelligence for multiple articles
 */
export async function generateBatchIntelligence(
  articles: MacroNewsItem[]
): Promise<Map<string, ArticleIntelligence>> {
  const results = new Map<string, ArticleIntelligence>();
  
  // Process in parallel (but limit concurrency to avoid rate limits)
  const batchSize = 5;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(article => generateArticleIntelligence(article))
    );
    
    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.set(articles[i + idx].url, result.value);
      }
    });
  }
  
  return results;
}
