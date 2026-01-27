/**
 * GET /api/r2/test
 * 
 * Development-only test route to verify R2 configuration.
 * Uploads a small test file and returns a signed URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadXlsxToR2, getSignedDownloadUrl, isR2Configured, assertR2Env, getR2EnvDebug } from '@/lib/r2';
import { randomUUID } from 'node:crypto';

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

  try {
    // Check R2 configuration
    const missing = assertR2Env();
    const debug = getR2EnvDebug();
    
    if (missing.length > 0) {
      return NextResponse.json(
        { 
          error: 'R2 not configured',
          missing,
          debug,
          message: 'Missing required environment variables: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME'
        },
        { status: 500 }
      );
    }

    // Create a small test file
    const testContent = `R2 Test File\nGenerated at: ${new Date().toISOString()}\nTest ID: ${randomUUID()}`;
    const testBuffer = Buffer.from(testContent, 'utf-8');
    
    // Upload to R2
    const timestamp = Date.now();
    const testKey = `test/${timestamp}.txt`;
    
    const signedUrl = await uploadXlsxToR2({
      key: testKey,
      buffer: testBuffer,
      filename: `test-${timestamp}.txt`,
    });

    return NextResponse.json({
      success: true,
      message: 'R2 test successful',
      key: testKey,
      signedUrl,
      expiresIn: 3600,
      debug,
    });
  } catch (error) {
    console.error('[R2_TEST] Error:', error);
    return NextResponse.json(
      { 
        error: 'R2 test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        debug: getR2EnvDebug(),
      },
      { status: 500 }
    );
  }
}






