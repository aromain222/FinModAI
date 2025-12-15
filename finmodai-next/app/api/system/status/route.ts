/**
 * System Status API
 * 
 * Returns read-only diagnostics about API key configuration.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const status = {
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    polygonConfigured: !!process.env.POLYGON_API_KEY,
    fmpConfigured: !!process.env.FMP_API_KEY,
    alphavantageConfigured: !!process.env.ALPHA_VANTAGE_API_KEY,
    timestamp: new Date().toISOString(),
  };
  
  return NextResponse.json(status);
}
