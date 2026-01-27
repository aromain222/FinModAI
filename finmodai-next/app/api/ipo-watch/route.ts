/**
 * API Route: /api/ipo-watch
 * 
 * Returns IPO candidates from SEC EDGAR filings
 * 
 * Query params:
 * - window: 90d | 180d | 365d (default: 90d)
 * - mode: live | demo (default: live)
 */

import { NextRequest, NextResponse } from 'next/server';
import type { IpoWatchApiResponse } from '@/lib/data/types';
import { fetchIpoCandidates, KNOWN_IPO_CANDIDATE_CIKS } from '@/lib/data/secEdgar';
import { batchFetchGdeltMomentum } from '@/lib/data/gdelt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// In-memory cache
interface CacheEntry {
  data: IpoWatchApiResponse;
  timestamp: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (SEC data changes slowly)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const window = searchParams.get('window') || '90d';
    const mode = searchParams.get('mode') || 'live';
    
    console.log(`[/api/ipo-watch] Fetching IPO candidates (window: ${window}, mode: ${mode})`);
    
    // Check cache
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      console.log('[/api/ipo-watch] Returning cached data');
      return NextResponse.json(cache.data);
    }
    
    // Demo mode
    if (mode === 'demo') {
      const response: IpoWatchApiResponse = {
        dataMode: 'demo',
        updatedAt: new Date().toISOString(),
        candidates: [],
      };
      return NextResponse.json(response);
    }
    
    // Live mode
    console.log('[/api/ipo-watch] Fetching live data...');
    
    // Get GDELT momentum for IPO candidates
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
    
    console.log('[/api/ipo-watch] Fetching GDELT momentum...');
    const gdeltMomentumMap = await batchFetchGdeltMomentum(ipoCompanyNames, '30d');
    
    console.log('[/api/ipo-watch] Fetching SEC EDGAR filings...');
    const candidates = await fetchIpoCandidates(KNOWN_IPO_CANDIDATE_CIKS, gdeltMomentumMap);
    
    const response: IpoWatchApiResponse = {
      dataMode: 'live',
      updatedAt: new Date().toISOString(),
      candidates,
    };
    
    // Update cache
    cache = { data: response, timestamp: Date.now() };
    
    console.log(`[/api/ipo-watch] ✅ Returned ${candidates.length} IPO candidates`);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/ipo-watch] ❌ Error:', error);
    
    return NextResponse.json({
      dataMode: 'demo',
      updatedAt: new Date().toISOString(),
      candidates: [],
      error: 'Failed to fetch IPO data',
    }, { status: 200 });
  }
}

