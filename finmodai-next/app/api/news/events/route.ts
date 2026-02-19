import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET(request: NextRequest) {
  const params = new URLSearchParams({
    type: 'events',
    range: request.nextUrl.searchParams.get('range') || '3D',
    tag: request.nextUrl.searchParams.get('topic') || request.nextUrl.searchParams.get('tag') || 'all',
    limit: request.nextUrl.searchParams.get('limit') || '20',
  });

  try {
    const response = await fetch(`${request.nextUrl.origin}/api/news?${params.toString()}`, {
      cache: 'no-store',
    });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'provider_failed',
        message: error instanceof Error ? error.message : 'Failed to proxy events',
      },
      { status: 502 }
    );
  }
}
