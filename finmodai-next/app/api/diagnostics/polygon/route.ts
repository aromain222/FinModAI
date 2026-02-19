// @ts-nocheck
/**
 * Polygon API Diagnostics
 * 
 * GET /api/diagnostics/polygon?ticker=AAPL
 * 
 * Tests Polygon API directly and returns structured result
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const ticker = searchParams.get('ticker')?.trim().toUpperCase();
  
  if (!ticker) {
    return NextResponse.json(
      { error: 'Missing ticker parameter' },
      { status: 400 }
    );
  }
  
  try {
    const { fetchFromPolygon } = await import('@/lib/data/providers');
    
    const startTime = Date.now();
    const result = await fetchFromPolygon(ticker);
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      ticker,
      provider: 'polygon',
      timestamp: new Date().toISOString(),
      durationMs: duration,
      ...result,
    }, { status: 200 });
    
  } catch (error) {
    return NextResponse.json({
      ticker,
      provider: 'polygon',
      timestamp: new Date().toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

