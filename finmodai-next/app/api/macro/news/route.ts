/**
 * API Route: /api/macro/news
 * 
 * Returns recent macro news with AI summaries and insights
 * Supports time window query parameter: ?window=today|1W|1M
 */

import { NextRequest, NextResponse } from 'next/server';
import type { MacroNewsResponse, MacroNewsArticle } from '@/types/macro';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const window = searchParams.get('window') || '1W';
    
    console.log(`[/api/macro/news] Fetching macro news (window: ${window})`);
    
    // TODO: Replace with real news API + OpenAI summarization
    // For now, return mock data
    const articles = getMockNewsArticles(window);
    
    const response: MacroNewsResponse = {
      articles,
      generatedAt: new Date().toISOString(),
    };
    
    console.log(`[/api/macro/news] ✅ Returned ${articles.length} articles`);
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[/api/macro/news] ❌ Error:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch macro news' },
      { status: 500 }
    );
  }
}

/**
 * Generate mock news articles
 * TODO: Replace with real news API integration
 */
function getMockNewsArticles(window: string): MacroNewsArticle[] {
  const now = new Date();
  
  const articles: MacroNewsArticle[] = [
    {
      id: '1',
      title: 'Fed Signals Potential Rate Cuts in 2025 as Inflation Cools',
      source: 'Bloomberg',
      publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
      url: 'https://bloomberg.com',
      summary: 'Federal Reserve officials indicated they may begin cutting interest rates in mid-2025 if inflation continues its downward trajectory. Recent CPI data showing a 3.2% year-over-year increase has given policymakers confidence that their restrictive stance is working.',
      aiInsight: 'Rate cut expectations could support equity valuations and reduce discount rates in DCF models. Monitor 10Y Treasury yields for early signals.',
      sentiment: 'bullish',
      tags: ['Fed', 'Rates', 'Inflation'],
    },
    {
      id: '2',
      title: 'Labor Market Shows Resilience Despite Higher Rates',
      source: 'WSJ',
      publishedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(), // 5h ago
      url: 'https://wsj.com',
      summary: 'November jobs report exceeded expectations with 220,000 new payrolls added. Unemployment remains at 3.9%, suggesting the economy is achieving a soft landing. Wage growth moderated to 4.1% year-over-year.',
      aiInsight: 'Strong labor market supports consumer spending but may delay Fed rate cuts. Neutral for equities in the near term.',
      sentiment: 'neutral',
      tags: ['Employment', 'Economy'],
    },
    {
      id: '3',
      title: 'Treasury Yields Fall as Investors Bet on Policy Pivot',
      source: 'Reuters',
      publishedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(), // 8h ago
      url: 'https://reuters.com',
      summary: 'The 10-year Treasury yield dropped to 4.45%, down from 4.70% last month. Bond markets are pricing in three rate cuts by end of 2025. Duration assets are seeing renewed interest from institutional investors.',
      aiInsight: 'Lower yields reduce cost of capital and support higher equity multiples. Favorable for growth stocks and long-duration assets.',
      sentiment: 'bullish',
      tags: ['Bonds', 'Yields', 'Fed'],
    },
    {
      id: '4',
      title: 'VIX Drops to 13 as Market Volatility Subsides',
      source: 'CNBC',
      publishedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(), // 12h ago
      url: 'https://cnbc.com',
      summary: 'The CBOE Volatility Index fell to 13.2, its lowest level in six months. Options traders are pricing in subdued near-term volatility as macro uncertainty fades. S&P 500 implied volatility for 30-day options is below historical averages.',
      aiInsight: 'Low volatility environment supports risk-on positioning. However, complacency can precede sharp reversals—monitor geopolitical risks.',
      sentiment: 'neutral',
      tags: ['VIX', 'Volatility', 'Risk'],
    },
    {
      id: '5',
      title: 'Oil Prices Surge on OPEC+ Production Cuts',
      source: 'FT',
      publishedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // 1d ago
      url: 'https://ft.com',
      summary: 'Brent crude jumped 4% to $85/barrel after OPEC+ announced extended production cuts through Q2 2025. Energy sector equities rallied on the news, while concerns about renewed inflation pressures emerged.',
      aiInsight: 'Rising oil prices could reignite inflation concerns and delay Fed easing. Bearish for rate-sensitive sectors, bullish for energy.',
      sentiment: 'bearish',
      tags: ['Oil', 'Energy', 'Inflation'],
    },
    {
      id: '6',
      title: 'China Economic Data Beats Expectations',
      source: 'Bloomberg',
      publishedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString(), // 1.5d ago
      url: 'https://bloomberg.com',
      summary: 'Chinese manufacturing PMI rose to 51.2, signaling expansion for the third consecutive month. Stimulus measures and property sector stabilization are supporting growth. Analysts are upgrading 2025 GDP forecasts.',
      aiInsight: 'China recovery supports global growth outlook and commodity demand. Positive for cyclical sectors and emerging markets.',
      sentiment: 'bullish',
      tags: ['China', 'Global', 'Growth'],
    },
  ];
  
  // Filter by window
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

