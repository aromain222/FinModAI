import { NextResponse } from 'next/server';
import { fetchMacroSnapshot } from '@/lib/macroService';
import { fetchMacroNews } from '@/lib/fetchMacroNews';
import { generateMarketBrief } from '@/lib/marketBrief';

export const dynamic = 'force-dynamic'; // Ensure fresh data

export async function GET() {
  try {
    console.log('[api/macro/brief] Generating fresh market brief...');
    
    // Force fresh data - bypass cache
    const [snapshot, news] = await Promise.all([
      fetchMacroSnapshot('1M', true), // Force refresh - get 1 month of data
      fetchMacroNews(10) // Get 10 recent articles
    ]);
    
    console.log('[api/macro/brief] Snapshot asOf:', snapshot.asOf);
    console.log('[api/macro/brief] News articles:', news.length);
    
    // Verify snapshot is recent (within last 24 hours)
    const snapshotDate = new Date(snapshot.asOf);
    const now = new Date();
    const ageHours = (now.getTime() - snapshotDate.getTime()) / (1000 * 60 * 60);
    
    if (ageHours > 24) {
      console.warn(`[api/macro/brief] ⚠️  Snapshot is ${ageHours.toFixed(1)} hours old`);
    }
    
    // Verify news is recent (within last 7 days)
    const recentNews = news.filter(item => {
      const publishedDate = new Date(item.publishedAt);
      const newsAgeHours = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);
      return newsAgeHours <= 7 * 24; // 7 days
    });
    
    console.log(`[api/macro/brief] Recent news (last 7 days): ${recentNews.length} articles`);
    
    const brief = await generateMarketBrief(snapshot, recentNews.length > 0 ? recentNews : news);
    
    // Ensure timestamp is current
    brief.timestamp = new Date().toISOString();
    
    console.log('[api/macro/brief] ✅ Generated brief with timestamp:', brief.timestamp);
    
    return NextResponse.json(brief, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('[api/macro/brief] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate market brief', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
