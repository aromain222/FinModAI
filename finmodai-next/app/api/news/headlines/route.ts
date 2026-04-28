import { type NextRequest, NextResponse } from 'next/server';
import { buildDemoHeadlines, handleHeadlines } from '@/lib/news/api/headlines';
import { getSupabaseClient, isDev } from '@/lib/news/api/shared';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

const RANGE_TO_HOURS: Record<string, number> = {
  '1D': 24,
  '3D': 72,
  '1W': 168,
  '1M': 720,
};

export async function GET(request: NextRequest) {
  const rangeRaw = (request.nextUrl.searchParams.get('range') || '3D').toUpperCase();
  const tag = (request.nextUrl.searchParams.get('topic') || request.nextUrl.searchParams.get('tag') || 'all').toLowerCase();
  const limitRaw = request.nextUrl.searchParams.get('limit') || '20';
  const limit = Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 20));
  const lookbackHours = RANGE_TO_HOURS[rangeRaw] ?? 72;
  const fromIso = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();

  const params = {
    type: 'headlines' as const,
    range: (RANGE_TO_HOURS[rangeRaw] ? rangeRaw : '3D') as '1D' | '3D' | '1W' | '1M' | '3M',
    tag,
    limit,
    lookbackHours,
    fromIso,
  };

  const supabase = getSupabaseClient();

  try {
    const payload = await handleHeadlines(params, supabase);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'headlines_failed';
    if (isDev()) console.error('[api/news/headlines] fatal', message);
    const fallback = buildDemoHeadlines(params, params.limit);
    return NextResponse.json(
      { ok: true, provider: 'demo', items: fallback, meta: { ingested: 0, fromSupabase: 0, errors: [message] } },
      { status: 200 }
    );
  }
}
