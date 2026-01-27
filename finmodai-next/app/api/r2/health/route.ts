/**
 * GET /api/r2/health
 * 
 * Development-only health check for R2 configuration.
 * Tests connection with HeadBucketCommand.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkR2Health, getR2EnvDebug } from '@/lib/r2';

export async function GET(request: NextRequest) {
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

  try {
    const health = await checkR2Health();
    
    return NextResponse.json({
      ok: health.ok,
      bucket: health.bucket,
      ...(health.error ? { error: health.error, name: health.name } : {}),
    });
  } catch (error) {
    console.error('[R2_HEALTH] Error:', error);
    return NextResponse.json(
      { 
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : undefined,
        bucket: process.env.R2_BUCKET_NAME,
      },
      { status: 500 }
    );
  }
}







