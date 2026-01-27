/**
 * GET /api/r2/debug
 * 
 * Development-only debug endpoint to output R2 environment variables (masked).
 * Helps diagnose R2 configuration issues.
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertR2Env, getR2EnvDebug } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not available in production', { status: 404 });
  }

  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    );
  }

  // Check if running on localhost
  const hostname = request.headers.get('host') || '';
  if (!hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
    return NextResponse.json(
      { error: 'This endpoint is only available on localhost' },
      { status: 403 }
    );
  }

  const missing = assertR2Env();
  const debug = getR2EnvDebug();
  
  // Output actual endpoint (not masked) for debugging
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  
  return NextResponse.json({
    missing,
    debug: {
      ...debug,
      endpoint: endpoint || undefined, // Show actual endpoint
    },
    bucket,
    configured: missing.length === 0,
  });
}






