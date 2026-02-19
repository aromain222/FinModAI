import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET(request: NextRequest) {
  const params = new URLSearchParams({
    type: 'events',
    range:
      request.nextUrl.searchParams.get('range') ||
      request.nextUrl.searchParams.get('timeframe') ||
      '3D',
    tag:
      request.nextUrl.searchParams.get('tag') ||
      request.nextUrl.searchParams.get('topic') ||
      'all',
    limit: request.nextUrl.searchParams.get('limit') || '20',
  });

  const lookback = request.nextUrl.searchParams.get('lookback_hours');
  if (lookback) params.set('lookback_hours', lookback);

  try {
    const response = await fetch(`${request.nextUrl.origin}/api/news?${params.toString()}`, {
      cache: 'no-store',
    });
    const payload = await response.json();
    return NextResponse.json(payload, {
      status: response.status,
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load events';
    return NextResponse.json(
      {
        ok: false,
        error: 'provider_failed',
        details: { message },
      },
      {
        status: 502,
        headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
      }
    );
  }
}
