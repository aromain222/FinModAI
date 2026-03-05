import { NextRequest, NextResponse } from 'next/server';
import { marketEventsProviderSchema, marketEventsViewSchema } from '@/lib/news/marketEventsTypes';
import { getMarketEvents } from '@/lib/news/marketEventsPipeline';

export const dynamic = 'force-dynamic';
export const revalidate = 300;
export const runtime = 'nodejs';

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' },
  });
}

export async function GET(request: NextRequest) {
  const viewParam = request.nextUrl.searchParams.get('view') || 'active';
  const limitParam = request.nextUrl.searchParams.get('limit') || '20';
  const providerParam = request.nextUrl.searchParams.get('provider');
  const debugParam = request.nextUrl.searchParams.get('debug');
  const forceParam = request.nextUrl.searchParams.get('force');
  const parsedView = marketEventsViewSchema.safeParse(viewParam);
  const parsedProvider = marketEventsProviderSchema.safeParse(providerParam);
  const view = parsedView.success ? parsedView.data : 'active';
  const provider = parsedProvider.success ? parsedProvider.data : undefined;
  const limit = Number.parseInt(limitParam, 10);
  const debug = debugParam === '1';
  const force = forceParam === '1';

  try {
    const result = await getMarketEvents({
      origin: request.nextUrl.origin,
      view,
      limit: Number.isFinite(limit) ? limit : 20,
      provider,
      debug,
      force,
    });

    console.log('[api/market/events]', {
      route: 'events',
      provider: result.provider,
      view,
      cacheHit: result.diagnostics?.cacheHit ?? false,
      counts: {
        fetched: result.diagnostics?.fetched ?? 0,
        deduped: result.diagnostics?.deduped ?? 0,
        gated: result.diagnostics?.gated ?? 0,
        clustered: result.diagnostics?.clustered ?? 0,
        classified: result.diagnostics?.classified ?? 0,
        stored: result.diagnostics?.stored ?? 0,
        returned: result.diagnostics?.returned ?? 0,
      },
      errors: result.diagnostics?.openaiErrors ?? [],
    });

    return json({
      ok: true,
      view,
      provider: result.provider,
      fallback: result.fallback,
      events: result.events,
      error: result.error,
      warning: result.warning,
      message: result.message,
      diagnostics: debug ? result.diagnostics : undefined,
    });
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : 'Failed to load market events';
    console.error('[api/market/events] failed', {
      route: 'events',
      provider,
      view,
      cacheHit: false,
      counts: {
        fetched: 0,
        deduped: 0,
        gated: 0,
        clustered: 0,
        classified: 0,
        stored: 0,
        returned: 0,
      },
      errors: [safeMessage],
    });
    return json(
      {
        ok: true,
        view,
        provider: 'live',
        fallback: false,
        events: [],
        error: 'PIPELINE_FAILED',
        message: 'Live pipeline unavailable',
        diagnostics: debug
          ? {
              fetched: 0,
              deduped: 0,
              gated: 0,
              clustered: 0,
              classified: 0,
              stored: 0,
              returned: 0,
              cacheHit: false,
              openaiCallCount: 0,
              openaiErrors: [safeMessage],
              schemaParseFailures: 0,
            }
          : undefined,
      },
      200
    );
  }
}
