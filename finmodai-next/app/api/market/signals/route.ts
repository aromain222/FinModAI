import { NextRequest, NextResponse } from 'next/server';
import { assertEnv } from '@/lib/env';
import { handleEvents } from '@/lib/news/api/events';
import { getSupabaseClient, parseParams } from '@/lib/news/api/shared';
import { deriveMarketSignals } from '@/lib/news/marketSignals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const env = assertEnv('api/market/signals');

  // Build a synthetic request with type=events forced
  const syntheticUrl = new URL(
    `?type=events&${request.nextUrl.searchParams.toString()}`,
    request.nextUrl.origin
  );
  const parsed = parseParams(new NextRequest(new Request(syntheticUrl)));

  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: 'invalid_params', details: parsed.details }, { status: 400 });
  }

  const params = parsed.value;
  const supabase = getSupabaseClient();

  try {
    const payload = await handleEvents(params, supabase);
    const signals = deriveMarketSignals(payload.events);
    const elapsed = Date.now() - startMs;

    const usedDemo = payload.events.some((e) => (e.tags ?? []).includes('demo'));
    const source: 'live' | 'fallback' | 'demo' = usedDemo ? 'demo' : payload.provider === 'supabase' ? 'fallback' : 'live';

    return NextResponse.json(
      {
        success: true,
        signals,
        source,
        meta: {
          event_count: payload.events.length,
          signal_count: signals.length,
          range: params.range,
          tag: params.tag,
          elapsed_ms: elapsed,
          llm_available: env.llm.anyLlm,
        },
        debug: {
          perigon: env.news.perigon ? 'key_present' : 'missing_key',
          newsapi: env.news.newsapi ? 'key_present' : 'missing_key',
          supabase: env.supabase.serviceKey ? 'key_present' : 'missing_key',
          llm: env.llm.anyLlm ? 'key_present' : 'fallback:rule_based',
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'pipeline_failed';
    console.error('[api/market/signals] fatal', { message });
    return NextResponse.json(
      { success: false, signals: [], error: 'provider_failed', details: { message } },
      { status: 502 }
    );
  }
}
