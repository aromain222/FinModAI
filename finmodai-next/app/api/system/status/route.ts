/**
 * System Status API
 * 
 * Returns read-only diagnostics about API key configuration.
 */

import { NextResponse } from 'next/server';
import { hasAnyOpenAIKey } from '@/lib/openaiKey';

export const runtime = 'nodejs';

export async function GET() {
  const status = {
    openaiConfigured: hasAnyOpenAIKey(),
    polygonConfigured: !!process.env.POLYGON_API_KEY,
    fmpConfigured: !!process.env.FMP_API_KEY,
    alphavantageConfigured: !!process.env.ALPHA_VANTAGE_API_KEY,
    timestamp: new Date().toISOString(),
  };
  
  return NextResponse.json(status);
}
