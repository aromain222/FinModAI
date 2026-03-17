/**
 * API Route: /api/world-brief/news
 * 
 * Returns world/macro/geopolitical news (NOT market-specific)
 * Uses the news router to filter out market-only stories
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { fetchMacroNews } from '@/lib/fetchMacroNews';
import { routeArticle, deduplicateArticles } from '@/lib/newsRouter';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';

interface WorldBriefNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  what_happened?: string;
  why_it_matters?: string;
  market_lens?: string | null; // Only if market lens toggle is ON
  topics: string[];
  region?: string;
  confidence: 'low' | 'medium' | 'high';
  routing: {
    lane: 'market' | 'world' | 'drop';
    market_relevance_score: number;
    world_relevance_score: number;
    market_reason: string;
    world_reason: string;
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const marketLens = searchParams.get('marketLens') === 'true';

    // Fetch news from News API
    const newsItems = await fetchMacroNews(30); // Fetch more to filter

    if (!newsItems || newsItems.length === 0) {
      return NextResponse.json([]);
    }

    const apiKey = getOpenAIKey('service');
    const openai = apiKey ? new OpenAI({ apiKey }) : null;

    // Step 1: Route articles (two-stage gate)
    const routedArticles: Array<{ item: typeof newsItems[0]; routing: any }> = [];

    for (const item of newsItems) {
      const routing = await routeArticle(item, openai);

      // Include articles routed to "world" lane (or "market" if market lens is on)
      if (routing.lane === 'world' || (marketLens && routing.lane === 'market')) {
        routedArticles.push({ item, routing });
      }
    }

    // Step 2: Deduplicate
    const deduplicated = deduplicateArticles(routedArticles.map((r) => r.item));

    // Step 3: Enrich with summaries (optional market lens)
    const enrichedNews: WorldBriefNewsItem[] = [];

    for (const routed of routedArticles.filter((r) => deduplicated.includes(r.item)).slice(0, 15)) {
      const { item, routing } = routed;

      // Generate summaries if OpenAI available
      let what_happened = item.summary || item.title;
      let why_it_matters = 'Geopolitical/macro significance analysis unavailable';
      let market_lens: string | null = null;

      if (openai) {
        try {
          const prompt = `Analyze this world/macro news article:

Title: ${item.title}
Source: ${item.source}
${item.summary ? `Summary: ${item.summary}` : ''}
Topics: ${routing.topics.join(', ')}

Provide JSON:
{
  "what_happened": "1 sentence factual summary",
  "why_it_matters": "1 sentence on geopolitical/macro significance",
  ${marketLens ? `"market_lens": "EXACTLY 2-3 sentences analyzing potential market impact. REQUIRED structure: (1) First sentence identifies which specific assets, sectors, or markets could be affected. (2) Second sentence describes the directional impact (up/down/volatile) and expected magnitude. (3) Optional third sentence provides timeframe or conditions for impact to materialize. Each sentence must be complete and substantive. Example format: 'This development could impact energy sector equities and oil futures. Prices may rise 5-10% if supply disruptions materialize. Impact likely to manifest within 2-4 weeks if tensions escalate.'"` : ''}
}

Focus on geopolitical/macro forces, not stock market commentary.`;

          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-5.4',
            messages: [
              {
                role: 'system',
                content: 'You are a geopolitical analyst with market expertise. Focus on macro/geopolitical significance first. When market_lens is requested, ALWAYS provide exactly 2-3 complete sentences following this structure: (1) Identify specific assets/sectors/markets affected, (2) Describe directional impact and magnitude, (3) Optional: timeframe or conditions. Be specific, quantitative when possible, and ensure each sentence is substantive and complete.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.6,
            max_tokens: 400, // Increased to allow for 2-3 sentence market lens
            response_format: { type: 'json_object' },
          });

          const content = completion.choices[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            what_happened = parsed.what_happened || what_happened;
            why_it_matters = parsed.why_it_matters || why_it_matters;
            market_lens = marketLens ? parsed.market_lens || null : null;
          }
        } catch (error) {
          console.error('[world-brief/news] AI enrichment error:', error);
        }
      }

      enrichedNews.push({
        title: item.title,
        source: item.source,
        url: item.url,
        publishedAt: item.publishedAt,
        summary: item.summary || item.title,
        what_happened,
        why_it_matters,
        market_lens: marketLens ? market_lens : null,
        topics: routing.topics,
        confidence: routing.confidence,
        routing: {
          lane: routing.lane,
          market_relevance_score: routing.market_relevance_score,
          world_relevance_score: routing.world_relevance_score,
          market_reason: routing.market_reason,
          world_reason: routing.world_reason,
        },
      });
    }

    return NextResponse.json(enrichedNews);
  } catch (error: any) {
    console.error('[world-brief/news] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch world brief news', details: error.message },
      { status: 500 }
    );
  }
}
