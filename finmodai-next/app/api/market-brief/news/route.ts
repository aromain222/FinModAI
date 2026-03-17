import { NextResponse } from 'next/server';
import { fetchMacroNews } from '@/lib/fetchMacroNews';
import { generateArticleIntelligence, type ArticleIntelligence } from '@/lib/articleIntelligence';
import { routeArticle, deduplicateArticles } from '@/lib/newsRouter';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

interface EnrichedNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  marketImpact: string;
  whatHappened?: string;
  whyItMatters?: string;
  whyIncluded?: string[];
  // New intelligence fields
  category?: string;
  intelligence?: ArticleIntelligence;
  secondOrderImpacts?: string[];
  affectedChannels?: string[];
  // Routing metadata
  routing?: {
    lane: 'market' | 'world' | 'drop';
    market_relevance_score: number;
    world_relevance_score: number;
    topics: string[];
    confidence: 'low' | 'medium' | 'high';
  };
}

export async function GET() {
  try {
    // Fetch news from News API (US-centric: major US business/finance outlets)
    const newsItems = await fetchMacroNews(30, { preferUsDomains: true });

    if (!newsItems || newsItems.length === 0) {
      return NextResponse.json([]);
    }

    const apiKey = getOpenAIKey('service');
    const model = process.env.OPENAI_MODEL || 'gpt-5.4';
    const canUseAI = Boolean(apiKey);

    if (!canUseAI) {
      console.warn('[market-brief/news] OpenAI key missing (OPENAI_SERVICE_API_KEY or OPENAI_API_KEY) – returning raw headlines only');
    }

    const openai = canUseAI && apiKey ? new OpenAI({ apiKey }) : null;

    // Step 1: Route articles (two-stage gate)
    const routedArticles: Array<{ item: typeof newsItems[0]; routing: any }> = [];
    
    for (const item of newsItems) {
      const routing = await routeArticle(item, openai);
      
      // Only include articles routed to "market" lane
      if (routing.lane === 'market') {
        routedArticles.push({ item, routing });
      } else {
        // Log dropped/redirected articles for admin review
        console.log(`[market-brief/news] Article routed to ${routing.lane}: "${item.title}"`);
        console.log(`  Market score: ${routing.market_relevance_score}, World score: ${routing.world_relevance_score}`);
        console.log(`  Reason: ${routing.market_reason}`);
      }
    }

    // Step 2: Deduplicate
    const deduplicated = deduplicateArticles(routedArticles.map(r => r.item));

    // Step 3: Enrich with AI intelligence (only for market-routed articles)
    const enrichedNews: EnrichedNewsItem[] = [];

    for (const item of deduplicated.slice(0, 20)) {
      try {
        // Generate article intelligence (classification + macro analysis)
        const intelligence = await generateArticleIntelligence(item);

        // Find routing for this item
        const routing = routedArticles.find(r => r.item.url === item.url)?.routing;

        // Build enriched item with intelligence
        enrichedNews.push({
          title: item.title,
          source: item.source,
          url: item.url,
          publishedAt: item.publishedAt,
          summary: item.summary || item.title,
          marketImpact: intelligence.whyItMatters, // Use whyItMatters as market impact
          whatHappened: intelligence.whatHappened,
          whyItMatters: intelligence.whyItMatters,
          whyIncluded: intelligence.affectedChannels,
          // New intelligence fields
          category: intelligence.category,
          intelligence,
          secondOrderImpacts: intelligence.secondOrderImpacts,
          affectedChannels: intelligence.affectedChannels,
          // Routing metadata
          routing: routing ? {
            lane: routing.lane,
            market_relevance_score: routing.market_relevance_score,
            world_relevance_score: routing.world_relevance_score,
            topics: routing.topics,
            confidence: routing.confidence,
          } : undefined,
        });
      } catch (error) {
        console.error('[market-brief/news] Intelligence generation error:', error);
        // Add news item without intelligence
        enrichedNews.push({
          title: item.title,
          source: item.source,
          url: item.url,
          publishedAt: item.publishedAt,
          summary: item.summary || item.title,
          marketImpact: 'Intelligence analysis unavailable',
          whatHappened: item.summary || item.title,
          whyItMatters: 'Analysis unavailable',
          whyIncluded: [],
          category: 'other',
        });
      }
    }

    return NextResponse.json(enrichedNews);
  } catch (error: any) {
    console.error('[market-brief/news] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news', details: error.message },
      { status: 500 }
    );
  }
}
