/**
 * API Route: /api/market-brief/sectors
 * 
 * Returns rising and falling sectors for a selected time period
 * Uses ETF proxies with proper trading day alignment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSectorReturns, type SectorPeriod } from '@/lib/sectorReturns';

export const dynamic = 'force-dynamic';

// Simple in-memory cache (5-15 minutes TTL)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || searchParams.get('range') || '1M') as SectorPeriod;
    
    // Validate period
    const validPeriods: SectorPeriod[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'YTD', 'MAX'];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { error: `Invalid period. Must be one of: ${validPeriods.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Check cache
    const cacheKey = `sectors-${period}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[/api/market-brief/sectors] Using cached data for ${period}`);
      return NextResponse.json(cached.data, { status: 200 });
    }
    
    console.log(`[/api/market-brief/sectors] Fetching sector returns for ${period}`);
    
    const sectorReturns = await getSectorReturns(period);
    
    // Cache result
    cache.set(cacheKey, {
      data: sectorReturns,
      timestamp: Date.now(),
    });
    
    return NextResponse.json(sectorReturns, { status: 200 });
  } catch (error: any) {
    console.error('[/api/market-brief/sectors] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sector performance', details: error.message },
      { status: 500 }
    );
  }
}
