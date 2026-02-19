/**
 * GET /api/models/[modelId]/download
 * 
 * Downloads a generated Excel model file
 * Uses R2 signed URLs if configured, otherwise falls back to local file storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { readModelFile, modelFileExists, getDownloadFilename } from '@/lib/modelStorage';
import { isObjectStoreConfigured, getSignedUrlForKey, objectExists } from '@/lib/storage/objectStore';

export async function GET(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  try {
    const { modelId } = params;

    // Validate modelId
    if (!modelId || typeof modelId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid model ID' },
        { status: 400 }
      );
    }

    // Get filename from query params or use default
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker') || 'model';
    const modelType = searchParams.get('type') || 'model';
    const filename = getDownloadFilename(ticker, modelType as any);

    // Try R2 first if configured
    if (isObjectStoreConfigured()) {
      try {
        // R2 key format: models/{modelId}.xlsx
        const r2Key = `models/${modelId}.xlsx`;
        
        // Check if object exists in R2
        const exists = await objectExists(r2Key);
        
        if (exists) {
          // Generate signed URL (15 minutes expiry)
          const signedUrl = await getSignedUrlForKey(r2Key, 900);
          console.log(`[download] ✅ Using R2 signed URL for ${modelId}`);
          
          // Redirect to signed URL
          return NextResponse.redirect(signedUrl, { status: 302 });
        } else {
          console.log(`[download] ⚠️  Model ${modelId} not found in R2, falling back to local storage`);
        }
      } catch (r2Error) {
        console.warn(`[download] ⚠️  R2 lookup failed for ${modelId}, falling back to local storage:`, r2Error);
      }
    }

    // Fallback to local file storage
    const exists = await modelFileExists(modelId);
    if (!exists) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    // Read file from disk
    const buffer = await readModelFile(modelId);
    
    if (!buffer) {
      return NextResponse.json(
        { error: 'Failed to read model file' },
        { status: 500 }
      );
    }

    // Return file as download
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-store',
      }
    });
  } catch (error) {
    console.error('Failed to download model:', error);
    return NextResponse.json(
      { error: 'Failed to download model', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
