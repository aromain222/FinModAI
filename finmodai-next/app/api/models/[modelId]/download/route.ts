/**
 * GET /api/models/[modelId]/download
 * 
 * Downloads a generated Excel model file
 */

import { NextRequest, NextResponse } from 'next/server';
import { readModelFile, modelFileExists, getDownloadFilename } from '@/lib/modelStorage';

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

    // Check if file exists
    if (!modelFileExists(modelId)) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    // Read file from disk
    const buffer = await readModelFile(modelId);

    // Get filename from query params or use default
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker') || 'model';
    const modelType = searchParams.get('type') || 'model';
    const filename = getDownloadFilename(ticker, modelType as any);

    // Return file as download
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
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

