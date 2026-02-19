// @ts-nocheck
/**
 * Finnhub API Diagnostics
 * 
 * GET /api/diagnostics/finnhub?ticker=AAPL
 * 
 * Tests Finnhub API directly and returns structured result
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
    const { fetchFromFinnhub } = await import('@/lib/data/providers');
    
    const startTime = Date.now();
    const result = await fetchFromFinnhub(ticker);
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      ticker,
      provider: 'finnhub',
      timestamp: new Date().toISOString(),
      durationMs: duration,
      ...result,
    }, { status: 200 });
    
  } catch (error) {
    return NextResponse.json({
      ticker,
      provider: 'finnhub',
      timestamp: new Date().toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

