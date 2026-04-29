import { NextRequest, NextResponse } from 'next/server';
import { assertEnv } from '@/lib/env';
import { handleEvents } from '@/lib/news/api/events';
import { getSupabaseClient, parseParams, RANGE_VALUES, TYPE_VALUES } from '@/lib/news/api/shared';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TIMEOUT_MS = 15_000;

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const env = assertEnv('api/events');

  // Coerce params — type is always 'events' for this route
  const syntheticRequest = new Request(
    new URL(
      `?type=events&${request.nextUrl.searchParams.toString()}`,
      request.nextUrl.origin
    )
  );
  const parsed = parseParams(new NextRequest(syntheticRequest));

  if (!parsed.ok) {
    return NextResponse.json(
      {
        success: false,
        error: 'invalid_params',
        details: parsed.details,
        allowed: { type: TYPE_VALUES, range: RANGE_VALUES, limit: '1..100' },
      },
      { status: 400 }
    );
  }

  const params = parsed.value;
  const supabase = getSupabaseClient();

  // Per-provider debug accumulator — filled as news pipeline runs
  const debug: Record<string, string> = {
    perigon: env.news.perigon ? 'key_present' : 'missing_key',
    newsapi: env.news.newsapi ? 'key_present' : 'missing_key',
    benzinga: env.news.benzinga ? 'key_present' : 'missing_key',
    eodhd: env.news.eodhd ? 'key_present' : 'missing_key',
    finnhub: env.news.finnhub ? 'key_present' : 'missing_key',
    polygon: env.news.polygon ? 'key_present' : 'missing_key',
    alphavantage: env.news.alphavantage ? 'key_present' : 'missing_key',
    supabase: env.supabase.serviceKey ? 'key_present' : 'missing_key',
    llm: env.llm.anyLlm ? 'key_present' : 'fallback:rule_based',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const payload = await handleEvents(params, supabase);
    clearTimeout(timeout);

    const elapsed = Date.now() - startMs;

    // Annotate per-provider result from meta errors
    for (const error of payload.meta.errors) {
      const [providerPart] = error.split(':');
      if (providerPart && debug[providerPart] === 'key_present') {
        debug[providerPart] = `failed:${error}`;
      }
    }

    // Determine source label
    let source: 'live' | 'fallback' | 'demo' = 'live';
    const usedDemo = payload.events.some((e) => (e.tags ?? []).includes('demo'));
    const usedSupabase = payload.meta.fromSupabase > 0;
    if (usedDemo && payload.events.length > 0 && payload.events.every((e) => (e.tags ?? []).includes('demo'))) {
      source = 'demo';
    } else if (usedSupabase && !env.news.anyNews) {
      source = 'fallback';
    }

    // Always return something — never an empty array unless truly nothing exists
    const events = payload.events.length > 0 ? payload.events : [];

    return NextResponse.json(
      {
        success: true,
        events,
        source,
        provider: payload.provider,
        meta: {
          count: events.length,
          from: params.fromIso,
          range: params.range,
          tag: params.tag,
          ingested: payload.meta.ingested,
          fromSupabase: payload.meta.fromSupabase,
          elapsed_ms: elapsed,
          errors: payload.meta.errors,
        },
        debug,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error) {
    clearTimeout(timeout);
    const elapsed = Date.now() - startMs;
    const message = error instanceof Error ? error.message : 'pipeline_failed';

    console.error('[api/events] fatal error', { message, elapsed_ms: elapsed });

    // Absolute last resort: return demo events so UI never breaks
    try {
      const { buildDemoEventsFallback } = await import('@/lib/news/api/events');
      const demoEvents = buildDemoEventsFallback(params);
      return NextResponse.json(
        {
          success: true,
          events: demoEvents,
          source: 'demo' as const,
          provider: 'demo',
          meta: { count: demoEvents.length, from: params.fromIso, range: params.range, tag: params.tag, ingested: 0, fromSupabase: 0, elapsed_ms: elapsed, errors: [message] },
          debug: { ...debug, pipeline: `fatal:${message}` },
        },
        { status: 200, headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } }
      );
    } catch {
      return NextResponse.json(
        {
          success: false,
          events: [],
          source: 'demo' as const,
          error: 'provider_failed',
          details: { message, elapsed_ms: elapsed },
          debug,
        },
        { status: 502 }
      );
    }
  }
}
