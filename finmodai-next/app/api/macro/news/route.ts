import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache/memory';
import { fetchMacroNewsLive } from '@/lib/news/headlinesPipeline';
import { NewsItemSchema } from '@/lib/schemas/news';

export const runtime = 'nodejs';

type Range = '1D' | '1W' | '1M';

type CacheValue = {
  items: unknown[];
  source: string;
  providers: Record<string, { ok: boolean; status?: number; reason?: string; durationMs: number }>;
  counts: { rawTotal: number; postFilterTotal: number; perProviderRaw: Record<string, number> };
};

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  if (process.env.NODE_ENV !== 'production' || process.env.MACRO_DEBUG_KEYS === '1') {
    console.log('[MACRO_KEYS]', {
      FRED: !!process.env.FRED_API_KEY,
      DATABENTO: !!process.env.DATABENTO_API_KEY,
      WEBZ: !!process.env.WEBZ_API_KEY,
      WEBZIO: !!process.env.WEBZIO_API_KEY,
      OPENAI: !!process.env.OPENAI_API_KEY,
      FINNHUB: !!process.env.FINNHUB_API_KEY,
      POLYGON: !!process.env.POLYGON_API_KEY,
      MARKETSTACK: !!process.env.MARKETSTACK_API_KEY,
    });
  }

  const searchParams = request.nextUrl.searchParams;
  const range = (searchParams.get('range') || '1W').toUpperCase() as Range;
  const limit = Number(searchParams.get('limit') || 20);
  const queryOverride = searchParams.get('q') || '';

  const baseQuery = 'Federal Reserve OR inflation OR CPI OR unemployment OR rates OR tariffs OR war';
  const query = [queryOverride, baseQuery].filter(Boolean).join(' OR ');

  const cacheKey = `news:macro:${range}:${queryOverride}:${limit}`;
  const ttlMs = 10 * 60 * 1000;
  const cached = getCache<CacheValue>(cacheKey);
  if (cached && !cached.stale) {
    const items = (cached.value.items ?? [])
      .map((item) => NewsItemSchema.safeParse(item))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

    return NextResponse.json({
      ok: true,
      data: { items },
      meta: {
        source: cached.value.source || 'cache',
        stale: false,
        fetchedAt: new Date().toISOString(),
        traceId,
        providers: cached.value.providers,
        counts: cached.value.counts,
      },
    });
  }

  if (cached && cached.stale) {
    fetchMacroNewsLive({ range, query, limit, traceId })
      .then((live) => {
        const anyOk = Object.values(live.providers).some((p) => p.ok);
        if (!anyOk) return;
        setCache(cacheKey, { items: live.items, source: live.source, providers: live.providers, counts: live.counts }, ttlMs);
      })
      .catch(() => {});

    const items = (cached.value.items ?? [])
      .map((item) => NewsItemSchema.safeParse(item))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

    return NextResponse.json({
      ok: true,
      data: { items },
      meta: {
        source: cached.value.source || 'cache',
        stale: true,
        fetchedAt: new Date().toISOString(),
        traceId,
        providers: cached.value.providers,
        counts: { ...cached.value.counts, postFilterTotal: items.length },
        reason: 'cache_stale',
      },
    });
  }

  const live = await fetchMacroNewsLive({ range, query, limit, traceId });
  const anyOk = Object.values(live.providers).some((p) => p.ok);
  if (anyOk) {
    setCache(cacheKey, { items: live.items, source: live.source, providers: live.providers, counts: live.counts }, ttlMs);
  }

  const items = (live.items ?? []).map((item) => NewsItemSchema.parse(item));
  items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  return NextResponse.json({
    ok: true,
    data: { items },
    meta: {
      source: anyOk ? live.source : 'fallback',
      stale: !anyOk,
      fetchedAt: new Date().toISOString(),
      traceId,
      reason: anyOk ? (items.length ? undefined : 'empty') : 'provider_error',
      providers: live.providers,
      counts: live.counts,
    },
  });
}
