/**
 * API Route: /api/macro/news
 * 
 * Returns recent macro news with AI summaries and insights
 * Supports time window query parameter: ?window=today|1W|1M
 */

import { NextRequest, NextResponse } from 'next/server';
import type { MacroNewsResponse, MacroNewsArticle, MacroArticleAnalysis } from '@/types/macro';
import { generateMacroArticleAnalysis, getAnalysisCacheKey } from '@/lib/macroArticleAnalysis';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const window = searchParams.get('window') || '1W';
    
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) console.log(`[/api/macro/news] Fetching macro news (window: ${window})`);

    const range = window === 'today' ? '1D' : window === '1M' ? '1M' : '1W';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const upstream = await fetch(`${req.nextUrl.origin}/api/news?type=headlines&range=${range}&tag=all&limit=30`, {
      cache: 'no-store',
      signal: controller.signal,
    }).catch((error) => {
      if (isDev) console.error('[/api/macro/news] upstream /api/news failed', error);
      return null;
    }).finally(() => {
      clearTimeout(timeout);
    });

    const upstreamJson: unknown = upstream ? await upstream.json().catch(() => null) : null;

    const upstreamItems = (upstreamJson && typeof upstreamJson === 'object' && Array.isArray((upstreamJson as any).items))
      ? ((upstreamJson as any).items as Array<Record<string, unknown>>)
      : [];

    const newsItems = upstreamItems
      .map((item) => {
        const title = typeof item.title === 'string' ? item.title : '';
        const source = typeof item.source === 'string' ? item.source : 'News';
        const url = typeof item.url === 'string' ? item.url : '';
        const publishedAtRaw = typeof item.publishedAt === 'string' ? item.publishedAt : (typeof item.published_at === 'string' ? item.published_at : '');
        const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : null;
        const publishedIso = publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : new Date().toISOString();
        const summary = typeof item.description === 'string' ? item.description : null;

        if (!title || !url) return null;
        return {
          title,
          source,
          url,
          publishedAt: publishedIso,
          summary: summary || '',
        };
      })
      .filter((item): item is { title: string; source: string; url: string; publishedAt: string; summary: string } => item !== null);

    if (isDev) {
      const provider = upstreamJson && typeof upstreamJson === 'object' ? (upstreamJson as any).provider : 'unknown';
      console.log(`[/api/macro/news] Upstream items=${newsItems.length} provider=${String(provider)}`);
    }

    // Enrich with OpenAI if available (service key for backend)
    const apiKey = getOpenAIKey('service');
    const openai = apiKey ? new OpenAI({ apiKey }) : null;
    
    const articles: MacroNewsArticle[] = [];
    
    // Simple in-memory cache for analysis (in production, use Redis or similar)
    const analysisCache = new Map<string, MacroArticleAnalysis>();
    
    for (const item of newsItems.slice(0, 10)) {
      try {
        // Generate article analysis (summary + market impact)
        let analysis: MacroArticleAnalysis;
        const cacheKey = getAnalysisCacheKey(item);
        
        if (analysisCache.has(cacheKey)) {
          analysis = analysisCache.get(cacheKey)!;
        } else {
          analysis = await generateMacroArticleAnalysis(
            {
              title: item.title,
              source: item.source,
              publishedAt: item.publishedAt,
              url: item.url,
              summary: item.summary,
              snippet: item.summary, // Use summary as snippet if content unavailable
            },
            openai
          );
          analysisCache.set(cacheKey, analysis);
        }
        
        // Legacy fields for backward compatibility
        const summary = analysis.what_happened_sentences.join(' ');
        const aiInsight = analysis.market_impact_sentences.join(' ');
        
        // Derive legacy sentiment from asset sentiments
        let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        const assetSentiments = Object.values(analysis.sentiment_by_asset);
        if (assetSentiments.length > 0) {
          const upCount = assetSentiments.filter(s => s === 'up').length;
          const downCount = assetSentiments.filter(s => s === 'down').length;
          if (upCount > downCount) sentiment = 'bullish';
          else if (downCount > upCount) sentiment = 'bearish';
        }
        
        // Legacy tags from affected_channels
        const tags = analysis.affected_channels.length > 0 
          ? analysis.affected_channels 
          : ['Macro'];
        
        articles.push({
          id: `news-${item.publishedAt}-${item.title.slice(0, 20).replace(/\s/g, '-')}`,
          title: item.title,
          source: item.source,
          publishedAt: item.publishedAt,
          url: item.url,
          summary, // Legacy
          aiInsight, // Legacy
          sentiment, // Legacy
          tags, // Legacy
          analysis, // New Macro IQ fields
        });
      } catch (error) {
        if (isDev) console.error('[/api/macro/news] Error processing article:', error);
        // Add article with minimal analysis
        articles.push({
          id: `news-${item.publishedAt}-${item.title.slice(0, 20).replace(/\s/g, '-')}`,
          title: item.title,
          source: item.source,
          publishedAt: item.publishedAt,
          url: item.url,
          summary: item.summary || item.title,
          aiInsight: 'Analysis unavailable',
          sentiment: 'neutral',
          tags: ['Macro'],
          analysis: {
            what_happened_sentences: [item.summary || item.title, 'Details are limited in the available text.'],
            market_impact_sentences: [
              'Market impact likely limited unless further escalation occurs.',
              'Equities and credit could stay range-bound as investors wait for clearer signals.',
              'Rates and FX may remain anchored to broader macro data rather than this headline.',
              'Commodities would likely react only if supply conditions are directly affected.',
              'Volatility could rise temporarily if uncertainty increases.',
            ],
            second_order_effects: [
              'Positioning may turn more defensive if additional headlines add policy risk.',
              'Policy responses could shift expectations if authorities provide new guidance.',
            ],
            affected_channels: ['equities', 'rates', 'fx'],
            sentiment_by_asset: {},
            confidence: 'low',
            reasoning_short: 'Analysis generation failed',
          },
        });
      }
    }
    
    const response: MacroNewsResponse = {
      articles,
      generatedAt: new Date().toISOString(),
    };
    
    if (isDev) console.log(`[/api/macro/news] ✅ Returned ${articles.length} articles`);
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('[/api/macro/news] ❌ Error:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch macro news', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
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
