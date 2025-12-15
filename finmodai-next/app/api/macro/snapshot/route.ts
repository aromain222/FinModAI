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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || '1M') as TimeRange;
    
    console.log(`[/api/macro/snapshot] Fetching macro snapshot (range: ${range})`);
    
    const snapshot = getMacroSnapshot(range);
    
    console.log(`[/api/macro/snapshot] ✅ Snapshot generated (risk: ${snapshot.riskScore}, regime: ${snapshot.riskRegime})`);
    
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    console.error('[/api/macro/snapshot] ❌ Error:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch macro snapshot' },
      { status: 500 }
    );
  }
}

