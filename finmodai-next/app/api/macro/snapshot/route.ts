/**
 * API Route: /api/macro/snapshot
 * 
 * Returns current macro snapshot with all indicators
 * Supports time range query parameter: ?range=1W|1M|3M|1Y|5Y|MAX
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMacroSnapshot } from '@/lib/macroData';
import type { TimeRange } from '@/types/macro';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // No caching - always fetch fresh data

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || '1M') as TimeRange;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[/api/macro/snapshot] Fetching macro snapshot (range: ${range})`);
    }
    
    const snapshot = await getMacroSnapshot(range);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[/api/macro/snapshot] ✅ Snapshot generated with ${Object.keys(snapshot.series).length} series`);
    }
    
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[/api/macro/snapshot] ❌ Error:', error);
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch macro snapshot' },
      { status: 500 }
    );
  }
}
