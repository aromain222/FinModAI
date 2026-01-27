import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache/memory';
import { fetchMarketHeadlinesLive } from '@/lib/news/headlinesPipeline';
import { NewsItemSchema } from '@/lib/schemas/news';
import { deterministicHeadlines, type DeterministicHeadline } from '@/lib/headlines/deterministic';

/**
 * Enforce deterministic headline contract for market routes
 * Raw provider data MUST pass through deterministicHeadlines()
 * APIs MUST NEVER return provider-native headlines
 */
function enforceDeterministicContractMarket(
  rawItems: any[],
  traceId: string
): Array<DeterministicHeadline & { tickers?: string[]; topics?: string[]; summary?: string }> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  let fallbackUsed = false;

  // Always pass through deterministicHeadlines()
  const deterministic = deterministicHeadlines(rawItems);

  // Map deterministic items, with fallback for any that fail
  const enforced = rawItems.map((rawItem: any) => {
    const rawTitle = rawItem.title || rawItem.headline || '';
    const det = deterministic.find((d) => {
      return (
        (rawTitle && d.canonicalTitle && rawTitle.toLowerCase().includes(d.canonicalTitle.toLowerCase().slice(0, 50))) ||
        (rawTitle && d.canonicalTitle && d.canonicalTitle.toLowerCase().includes(rawTitle.toLowerCase().slice(0, 50))) ||
        rawItem.id === d.id
      );
    });

    if (det && det.canonicalTitle && Array.isArray(det.impactBullets) && det.impactBullets.length >= 2) {
      // Valid deterministic headline
      return {
        ...det,
        tickers: det.tickers || rawItem.tickers || [],
        topics: rawItem.topics || [],
        summary: rawItem.summary || undefined,
      };
    }

    // Fallback: degraded object
    if (!fallbackUsed) {
      console.warn(`[deterministic-headlines][${traceId}] Fallback path used - returning degraded headline object`);
      fallbackUsed = true;
    }

    return {
      id: rawItem.id || `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      canonicalTitle: rawTitle || 'Headline',
      topic: 'equities' as const,
      impact: 'neutral' as const,
      confidence: 0.3,
      impactBullets: ['Data incomplete'],
      publishedAt: rawItem.publishedAt || rawItem.date || null,
      source: rawItem.source || rawItem.provider || null,
      url: rawItem.url || rawItem.link || null,
      tickers: rawItem.tickers || [],
      topics: rawItem.topics || [],
      summary: rawItem.summary || undefined,
    };
  });

  return enforced;
}

export const runtime = 'nodejs';

type CacheValue = {
  items: unknown[];
  source: string;
  providers: Record<string, { ok: boolean; status?: number; reason?: string; durationMs: number }>;
  counts: { rawTotal: number; postFilterTotal: number; perProviderRaw: Record<string, number> };
};

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const searchParams = request.nextUrl.searchParams;
  const range = (searchParams.get('range') || '1W').toUpperCase();
  const ticker = (searchParams.get('ticker') || '').trim().toUpperCase();
  const queryOverride = searchParams.get('q') || '';
  const limit = Number(searchParams.get('limit') || 20);

  const baseQuery = 'stocks OR equities OR S&P 500 OR Nasdaq';
  const tickerQuery = ticker ? `${ticker} OR ${ticker.toUpperCase()}` : '';
  const query = [queryOverride, tickerQuery, baseQuery].filter(Boolean).join(' OR ');

  const cacheKey = `news:market:${range}:${ticker}:${queryOverride}:${limit}`;
  const ttlMs = 5 * 60 * 1000;
  const cached = getCache<CacheValue>(cacheKey);
  if (cached && !cached.stale) {
    // Enforce deterministic contract on cached items
    // NEVER return provider-native headlines - always pass through deterministic processor
    const cachedItems = cached.value.items ?? [];
    const enforced = enforceDeterministicContractMarket(cachedItems, traceId);
    
    const items = enforced
      .map((det) => {
        const baseItem = {
          id: det.id,
          title: det.canonicalTitle,
          source: det.source || 'Unknown',
          url: det.url || '',
          publishedAt: det.publishedAt || new Date().toISOString(),
          tickers: det.tickers || [],
          topics: det.topics || [],
          summary: det.summary || undefined,
        };
        
        const parsed = NewsItemSchema.safeParse(baseItem);
        const validItem = parsed.success ? parsed.data : baseItem;
        
        return {
          ...validItem,
          canonicalTitle: det.canonicalTitle,
          impactBullets: det.impactBullets,
          topic: det.topic,
          confidence: det.confidence,
        };
      })
      .filter((item) => item.title && item.title.trim().length > 0);
    
    items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    
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
    fetchMarketHeadlinesLive({ range: range as any, ticker, query, limit, traceId })
      .then((live) => {
        const anyOk = Object.values(live.providers || {}).some((p: any) => p.ok);
        if (!anyOk) return;
        
        // Enforce deterministic contract before caching
        // NEVER cache provider-native headlines
        const enforced = enforceDeterministicContractMarket(live.items ?? [], traceId);
        const transformedItems = enforced.map((det) => ({
          id: det.id,
          title: det.canonicalTitle,
          canonicalTitle: det.canonicalTitle,
          impactBullets: det.impactBullets,
          topic: det.topic,
          confidence: det.confidence,
          source: det.source || 'Unknown',
          url: det.url || '',
          publishedAt: det.publishedAt || new Date().toISOString(),
          tickers: det.tickers || [],
          topics: det.topics || [],
          summary: det.summary || undefined,
        }));
        
        setCache(
          cacheKey,
          { items: transformedItems, source: live.source, providers: live.providers, counts: live.counts },
          ttlMs
        );
      })
      .catch(() => {});

    // Enforce deterministic contract on stale cached items
    // NEVER return provider-native headlines
    const cachedItems = cached.value.items ?? [];
    const enforced = enforceDeterministicContractMarket(cachedItems, traceId);
    
    const items = enforced
      .map((det) => {
        const baseItem = {
          id: det.id,
          title: det.canonicalTitle,
          source: det.source || 'Unknown',
          url: det.url || '',
          publishedAt: det.publishedAt || new Date().toISOString(),
          tickers: det.tickers || [],
          topics: det.topics || [],
          summary: det.summary || undefined,
        };
        
        const parsed = NewsItemSchema.safeParse(baseItem);
        const validItem = parsed.success ? parsed.data : baseItem;
        
        return {
          ...validItem,
          canonicalTitle: det.canonicalTitle,
          impactBullets: det.impactBullets,
          topic: det.topic,
          confidence: det.confidence,
        };
      })
      .filter((item) => item.title && item.title.trim().length > 0);
    
    items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

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

  const live = await fetchMarketHeadlinesLive({ range: range as any, ticker, query, limit, traceId });
  const anyOk = Object.values(live.providers || {}).some((p: any) => p.ok);
  
  // CRITICAL: Enforce deterministic contract - raw provider data MUST pass through deterministic processor
  // APIs MUST NEVER return provider-native headlines
  const rawItems = live.items ?? [];
  const rawCount = rawItems.length;
  const enforced = enforceDeterministicContractMarket(rawItems, traceId);
  const deterministicCount = enforced.filter((item) => item.impactBullets.length > 1 && item.impactBullets[0] !== 'Data incomplete').length;
  
  // Map enforced deterministic items to NewsItem format, preserving schema compatibility
  const items = enforced
    .map((det) => {
      const baseItem = {
        id: det.id,
        title: det.canonicalTitle, // Primary title
        source: det.source || 'Unknown',
        url: det.url || '',
        publishedAt: det.publishedAt || new Date().toISOString(),
        tickers: det.tickers || [],
        topics: det.topics || [],
        summary: det.summary || undefined,
      };
      
      // Parse through schema for validation, but add deterministic fields
      const parsed = NewsItemSchema.safeParse(baseItem);
      const validItem = parsed.success ? parsed.data : baseItem;
      
      return {
        ...validItem,
        canonicalTitle: det.canonicalTitle,
        impactBullets: det.impactBullets,
        topic: det.topic,
        confidence: det.confidence,
      };
    })
    .filter((item) => item.title && item.title.trim().length > 0);
  
  items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  
  if (anyOk) {
    // Cache enforced deterministic items (NEVER cache provider-native headlines)
    setCache(cacheKey, { items: items, source: live.source, providers: live.providers, counts: live.counts }, ttlMs);
  }

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
      counts: {
        ...live.counts,
        deterministic: process.env.NODE_ENV !== 'production' ? {
          rawCount,
          deterministicCount,
        } : undefined,
      },
    },
  });
}
