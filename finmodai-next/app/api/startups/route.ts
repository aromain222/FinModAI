/**
 * API Route: /api/startups
 * 
 * Returns live startup data with GDELT signals and SEC EDGAR IPO candidates
 * 
 * Query params:
 * - window: 1d | 3d | 7d | 30d (default: 7d)
 * - sector: AI | Fintech | DevTools | Healthcare | Climate | Consumer | Enterprise | Crypto
 * - mode: live | demo (default: live)
 */

import { NextRequest, NextResponse } from 'next/server';
import type { StartupsApiResponse } from '@/lib/data/types';
import { fetchNormalizedStartups, calculateThemeSummaries, calculateSectorSummaries } from '@/lib/data/normalizeStartups';
import { fetchIpoCandidates, KNOWN_IPO_CANDIDATE_CIKS } from '@/lib/data/secEdgar';
import { batchFetchGdeltMomentum } from '@/lib/data/gdelt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60s for GDELT + SEC EDGAR fetches

// In-memory cache
interface CacheEntry {
  data: StartupsApiResponse;
  timestamp: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Generate demo startup data for fallback
 */
function getDemoStartups() {
  const demoData = [
    { name: 'Anthropic', sector: 'AI', description: 'Building safe, steerable AI systems with Claude', momentumScore: 67 },
    { name: 'Perplexity', sector: 'AI', description: 'AI-powered search engine challenging Google', momentumScore: 54 },
    { name: 'Mistral AI', sector: 'AI', description: 'European AI champion building open-source LLMs', momentumScore: 48 },
    { name: 'Stripe', sector: 'Fintech', description: 'Payment infrastructure for the internet', momentumScore: 42 },
    { name: 'Plaid', sector: 'Fintech', description: 'Financial data network connecting apps to banks', momentumScore: 38 },
    { name: 'Chime', sector: 'Fintech', description: 'Digital banking challenger with 15M+ users', momentumScore: 35 },
    { name: 'Vercel', sector: 'DevTools', description: 'Frontend cloud platform powering Next.js', momentumScore: 31 },
    { name: 'Supabase', sector: 'DevTools', description: 'Open-source Firebase alternative with PostgreSQL', momentumScore: 28 },
    { name: 'Linear', sector: 'DevTools', description: 'Issue tracking for high-performance teams', momentumScore: 25 },
    { name: 'Tempus', sector: 'Healthcare', description: 'AI-powered precision medicine platform', momentumScore: 22 },
    { name: 'Devoted Health', sector: 'Healthcare', description: 'Medicare Advantage insurer using tech', momentumScore: 18 },
    { name: 'Northvolt', sector: 'Climate', description: 'European battery manufacturer for EVs', momentumScore: 15 },
    { name: 'Rivian', sector: 'Climate', description: 'Electric vehicle manufacturer', momentumScore: -8 },
    { name: 'Discord', sector: 'Consumer', description: 'Communication platform for communities', momentumScore: -12 },
    { name: 'Databricks', sector: 'Enterprise', description: 'Unified analytics platform built on Spark', momentumScore: -15 },
    { name: 'Canva', sector: 'Enterprise', description: 'Design platform democratizing graphic design', momentumScore: -18 },
    { name: 'OpenSea', sector: 'Crypto', description: 'NFT marketplace', momentumScore: -25 },
  ];

  return demoData.map((startup, idx) => ({
    id: `demo-startup-${idx}`,
    name: startup.name,
    sector: startup.sector as any,
    themes: ['Growth', 'Innovation'],
    description: startup.description,
    momentumScore: startup.momentumScore,
    signalCountsByType: {
      'Funding': Math.floor(Math.random() * 3),
      'Hiring': Math.floor(Math.random() * 5),
      'Partnerships': Math.floor(Math.random() * 2),
      'Product': Math.floor(Math.random() * 3),
      'Press': Math.floor(Math.random() * 10) + 5,
      'Regulation': Math.floor(Math.random() * 2),
    },
    whyTrending: [
      `News mentions ${startup.momentumScore > 0 ? '+' : ''}${Math.abs(Math.floor(startup.momentumScore * 0.5))}% WoW`,
      `${Math.floor(Math.random() * 3) + 1} signals detected (demo data)`,
    ],
    sources: ['techcrunch.com', 'bloomberg.com', 'reuters.com'].slice(0, Math.floor(Math.random() * 2) + 1),
    lastUpdated: new Date().toISOString(),
  }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const window = searchParams.get('window') || '7d';
    const sector = searchParams.get('sector') as any || undefined;
    const mode = searchParams.get('mode');
    
    // Demo mode ONLY if explicitly requested OR env var is set
    const isDemoMode = mode === 'demo' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    
    console.log(`[/api/startups] Fetching startups (window: ${window}, sector: ${sector}, mode: ${isDemoMode ? 'demo' : 'live'})`);
    
    // Check cache (only for live mode)
    if (!isDemoMode && cache && Date.now() - cache.timestamp < CACHE_TTL) {
      console.log('[/api/startups] Returning cached data');
      return NextResponse.json(cache.data);
    }
    
    // Demo mode: return demo data with clear label
    if (isDemoMode) {
      console.log('[/api/startups] 🎭 DEMO MODE - Returning demo data');
      const demoStartups = getDemoStartups();
      const response: StartupsApiResponse = {
        dataMode: 'demo',
        updatedAt: new Date().toISOString(),
        startups: demoStartups,
        ipoWatch: [],
        themes: calculateThemeSummaries(demoStartups),
        activeSectors: calculateSectorSummaries(demoStartups),
      };
      return NextResponse.json(response);
    }
    
    // Live mode: fetch from APIs
    console.log('[/api/startups] Fetching live data...');
    
    // Fetch startups with GDELT signals
    const startups = await fetchNormalizedStartups(window, sector);
    
    // Fetch IPO candidates with SEC EDGAR
    // First, get GDELT momentum for known IPO candidates
    const ipoCompanyNames = [
      'Stripe',
      'Databricks',
      'Discord',
      'Chime',
      'Instacart',
      'Klarna',
      'Canva',
      'Revolut',
    ];
    
    console.log('[/api/startups] Fetching GDELT momentum for IPO candidates...');
    const gdeltMomentumMap = await batchFetchGdeltMomentum(ipoCompanyNames, window);
    
    console.log('[/api/startups] Fetching SEC EDGAR filings...');
    const ipoWatch = await fetchIpoCandidates(KNOWN_IPO_CANDIDATE_CIKS, gdeltMomentumMap);
    
    // Calculate summaries
    const themes = calculateThemeSummaries(startups);
    const activeSectors = calculateSectorSummaries(startups);
    
    const response: StartupsApiResponse = {
      dataMode: 'live',
      updatedAt: new Date().toISOString(),
      startups,
      ipoWatch,
      themes,
      activeSectors,
    };
    
    // Update cache
    cache = { data: response, timestamp: Date.now() };
    
    console.log(`[/api/startups] ✅ Returned ${startups.length} startups, ${ipoWatch.length} IPO candidates`);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/startups] ❌ Error:', error);
    
    // If demo mode is enabled, return demo data
    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
      console.log('[/api/startups] Error occurred but DEMO_MODE enabled, returning demo data');
      const demoStartups = getDemoStartups();
      return NextResponse.json({
        dataMode: 'demo',
        updatedAt: new Date().toISOString(),
        startups: demoStartups,
        ipoWatch: [],
        themes: calculateThemeSummaries(demoStartups),
        activeSectors: calculateSectorSummaries(demoStartups),
        error: 'Failed to fetch live data, showing demo data',
      }, { status: 200 });
    }
    
    // Otherwise, return error with empty data
    return NextResponse.json({
      dataMode: 'live',
      updatedAt: new Date().toISOString(),
      startups: [],
      ipoWatch: [],
      themes: [],
      activeSectors: [],
      error: error instanceof Error ? error.message : 'Failed to fetch startup data',
    }, { status: 500 });
  }
}


