import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getCache, setCache } from '@/lib/cache/memory';
import { fetchMarketHeadlinesLive } from '@/lib/news/headlinesPipeline';
import { getMarketBriefHeadlinesCache, setMarketBriefHeadlinesCache } from '@/lib/news/marketBriefHeadlinesCache';
import { toErrorText } from '@/lib/providers/utils';
import { deterministicHeadlines, type DeterministicHeadline } from '@/lib/headlines/deterministic';

/**
 * Enforce deterministic headline contract
 * Raw provider data MUST pass through deterministicHeadlines()
 * APIs MUST NEVER return provider-native headlines
 * Returns deterministic headlines or degraded fallback objects
 */
function enforceDeterministicContract(
  rawItems: any[],
  traceId: string
): Array<DeterministicHeadline & { publisher?: string; tags?: string[]; summary?: string; tickers?: string[] }> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  let fallbackUsed = false;

  // Always pass through deterministicHeadlines()
  const deterministic = deterministicHeadlines(rawItems);

  // Map deterministic items, with fallback for any that fail
  const enforced = rawItems.map((rawItem: any) => {
    // Try to find matching deterministic item
    const rawTitle = rawItem.title || rawItem.headline || rawItem.name || '';
    const det = deterministic.find((d) => {
      // Match by title similarity or ID
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
        publisher: det.source || rawItem.source || rawItem.provider || 'Unknown',
        tags: rawItem.topics || rawItem.tags || [],
        summary: rawItem.summary || undefined,
        tickers: det.tickers || rawItem.tickers || [],
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
      publishedAt: rawItem.publishedAt || rawItem.published_at || rawItem.date || null,
      source: rawItem.source || rawItem.provider || null,
      url: rawItem.url || rawItem.link || null,
      publisher: rawItem.source || rawItem.provider || 'Unknown',
      tags: rawItem.topics || rawItem.tags || [],
      summary: rawItem.summary || undefined,
      tickers: rawItem.tickers || [],
    };
  });

  return enforced;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  range: z.enum(['1D', '1W', '1M', '3D', '7D', '14D', '30D']).optional().default('1D'),
  limit: z.coerce.number().int().min(6).max(50).optional().default(20),
  ticker: z.string().optional().default(''),
  q: z.string().optional().default(''),
  region: z.enum(['us', 'europe', 'asia', 'global']).optional().default('global'),
  force: z.coerce.number().int().optional().default(0),
});

type Range = z.infer<typeof QuerySchema>['range'];

const RANGE_DAYS: Record<string, number> = {
  '1D': 1,
  '3D': 3,
  '7D': 7,
  '14D': 14,
  '30D': 30,
  '1W': 7,
  '1M': 30,
};

type HeadlineItem = {
  id: string;
  title: string;
  canonicalTitle?: string;
  impactBullets?: string[];
  topic?: string;
  confidence?: number;
  publisher: string;
  publishedAt: string;
  url: string;
  tickers?: string[];
  tags?: string[];
  summary?: string;
};

type CacheValue = {
  items: HeadlineItem[];
  effectiveRange: string;
  updatedAt: string;
  cachedAt: string;
  providers?: Record<string, { ok: boolean; status?: number; reason?: string; durationMs: number }>;
  counts?: { rawTotal: number; postFilterTotal: number; perProviderRaw: Record<string, number> };
};

const hasItems = (value: CacheValue | null | undefined) => Boolean(value && Array.isArray(value.items) && value.items.length > 0);

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();
  const searchParams = request.nextUrl.searchParams;

  const parsed = QuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    ticker: searchParams.get('ticker') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    region: searchParams.get('region') ?? undefined,
    force: searchParams.get('force') ?? undefined,
  });

  const range: Range = parsed.success ? parsed.data.range : '1D';
  const limit = parsed.success ? parsed.data.limit : 20;
  const ticker = parsed.success ? (parsed.data.ticker || '').trim().toUpperCase() : '';
  const queryOverride = parsed.success ? parsed.data.q : '';
  const region = parsed.success ? parsed.data.region : 'global';
  const force = parsed.success ? Boolean(parsed.data.force) : false;

  const baseQuery = 'stocks OR equities OR S&P 500 OR Nasdaq OR earnings OR guidance';
  const tickerQuery = ticker ? `${ticker} OR ${ticker.toUpperCase()}` : '';
  const query = [queryOverride, tickerQuery, baseQuery].filter(Boolean).join(' OR ');

  const cacheKey = `market-brief:headlines:${range}:${ticker || 'all'}:${queryOverride}:${region}:${limit}`;
  const lastGoodKey = `market-brief:headlines:last_good`;
  const lastGoodFileKey = `last_good`;
  const ttlMs = 2 * 60 * 1000;
  const lastGoodTtlMs = 24 * 60 * 60 * 1000;

  const getLastGood = async (): Promise<CacheValue | null> => {
    const memory = getCache<CacheValue>(lastGoodKey);
    if (memory && hasItems(memory.value)) return memory.value;

    const file = await getMarketBriefHeadlinesCache<CacheValue>(lastGoodFileKey);
    if (file && hasItems(file.payload)) {
      setCache(lastGoodKey, file.payload, lastGoodTtlMs);
      return file.payload;
    }

    return null;
  };

  const cached = !force ? getCache<CacheValue>(cacheKey) : null;
  if (cached && !cached.stale && hasItems(cached.value)) {
    // Enforce deterministic contract on cached items
    // NEVER return provider-native headlines - always pass through deterministic processor
    const cachedItems = cached.value.items;
    const enforced = enforceDeterministicContract(cachedItems, traceId);
    
    // Map to HeadlineItem format expected by UI
    const finalItems: HeadlineItem[] = enforced.map((det) => ({
      id: det.id,
      title: det.canonicalTitle,
      canonicalTitle: det.canonicalTitle,
      impactBullets: det.impactBullets,
      topic: det.topic,
      confidence: det.confidence,
      publisher: det.publisher || det.source || 'Unknown',
      publishedAt: det.publishedAt || new Date().toISOString(),
      url: det.url || '',
      ...(det.tickers && det.tickers.length > 0 ? { tickers: det.tickers } : {}),
      ...(det.tags && det.tags.length > 0 ? { tags: det.tags } : {}),
      ...(det.summary ? { summary: det.summary } : {}),
    }));
    
    return NextResponse.json({
      ok: true,
      data: { items: finalItems },
      meta: {
        traceId,
        fetchedAt: new Date().toISOString(),
        requestedRange: range,
        effectiveRange: cached.value.effectiveRange,
        expanded:
          (RANGE_DAYS[cached.value.effectiveRange] ?? 0) > (RANGE_DAYS[range] ?? RANGE_DAYS['1D']) &&
          (RANGE_DAYS[range] ?? 0) > 0,
        isCached: true,
        cachedAt: cached.value.cachedAt,
        updatedAt: cached.value.updatedAt,
        providers: cached.value.providers,
        counts: cached.value.counts,
        latencyMs: Date.now() - startedAt,
      },
    });
  }

  try {
    const headlines = await fetchMarketHeadlinesLive({ range: range as any, ticker, query, limit, traceId });
    const rawItems = headlines.items ?? [];
    
    // CRITICAL: Enforce deterministic contract - raw provider data MUST pass through deterministic processor
    // APIs MUST NEVER return provider-native headlines
    const enforced = enforceDeterministicContract(rawItems, traceId);
    const rawCount = rawItems.length;
    const deterministicCount = enforced.filter((item) => item.impactBullets.length > 1 && item.impactBullets[0] !== 'Data incomplete').length;
    
    // Filter by region if not 'global'
    // First, try to use inferred region from deterministic items
    let regionFiltered = enforced;
    if (region !== 'global') {
      regionFiltered = enforced.filter((item) => {
        // Try to infer region from the item
        const itemRegion = inferRegion(item);
        return itemRegion === region;
      });
      
      // If no items match, apply keyword-based fallback filtering
      if (regionFiltered.length === 0 && enforced.length > 0) {
        const regionKeywords: Record<string, string[]> = {
          us: ['us', 'usa', 'united states', 'america', 'fed', 'federal reserve', 'treasury', 'sec', 'fomc'],
          europe: ['europe', 'eu', 'eurozone', 'ecb', 'european central bank', 'uk', 'england', 'france', 'germany', 'italy', 'spain', 'netherlands', 'boe'],
          asia: ['asia', 'china', 'japan', 'korea', 'singapore', 'hong kong', 'india', 'australia', 'pboc', 'boj', 'reserve bank', 'rbi'],
        };
        
        const keywords = regionKeywords[region] || [];
        const searchText = (text: string) => text.toLowerCase();
        
        regionFiltered = enforced.filter((item) => {
          const title = searchText(item.canonicalTitle || item.title || '');
          const source = searchText(item.source || item.publisher || '');
          const tags = Array.isArray(item.tags) ? item.tags.map(t => searchText(String(t))).join(' ') : '';
          const combined = `${title} ${source} ${tags}`;
          
          return keywords.some(keyword => combined.includes(keyword));
        });
      }
    }
    
    // Map enforced deterministic items to HeadlineItem format expected by UI
    const items: HeadlineItem[] = regionFiltered
      .slice(0, limit)
      .map((det) => ({
        id: det.id,
        title: det.canonicalTitle, // Primary title
        canonicalTitle: det.canonicalTitle,
        impactBullets: det.impactBullets,
        topic: det.topic,
        confidence: det.confidence,
        publisher: det.publisher || det.source || 'Unknown',
        publishedAt: det.publishedAt || new Date().toISOString(),
        url: det.url || '',
        ...(det.tickers && det.tickers.length > 0 ? { tickers: det.tickers } : {}),
        ...(det.tags && det.tags.length > 0 ? { tags: det.tags } : {}),
        ...(det.summary ? { summary: det.summary } : {}),
      }))
      .filter((item) => item.title && item.title.trim().length > 0);

    const effectiveRange = typeof headlines.window?.used === 'string' && headlines.window.used ? headlines.window.used : range;
    const requestedDays = RANGE_DAYS[range] ?? RANGE_DAYS['1D'];
    const effectiveDays = RANGE_DAYS[effectiveRange] ?? headlines.window?.days ?? requestedDays;
    const expanded = effectiveDays > requestedDays;
    const diagnostics =
      process.env.NODE_ENV !== 'production'
        ? {
            providersTried: Object.keys(headlines.providers || {}),
            itemsPerProvider: headlines.counts?.perProviderRaw ?? {},
            dedupedCount: headlines.counts?.postFilterTotal ?? items.length,
            timeWindowUsed: headlines.window,
            traceId,
            deterministic: {
              rawCount,
              deterministicCount,
            },
          }
        : undefined;

    const updatedAt = (() => {
      const ts = items
        .map((story) => Date.parse(story.publishedAt))
        .filter((n) => Number.isFinite(n))
        .reduce((max, n) => Math.max(max, n), 0);
      return ts ? new Date(ts).toISOString() : new Date().toISOString();
    })();

    const cacheValue: CacheValue = {
      items,
      effectiveRange,
      updatedAt,
      cachedAt: new Date().toISOString(),
      providers: headlines.providers,
      counts: headlines.counts,
    };

    if (items.length > 0) {
      setCache(cacheKey, cacheValue, ttlMs);
      setCache(lastGoodKey, cacheValue, lastGoodTtlMs);
      void setMarketBriefHeadlinesCache(lastGoodFileKey, cacheValue, cacheValue.cachedAt);
    }

    if (items.length === 0) {
      const lastGood = await getLastGood();
      if (lastGood) {
        // Enforce deterministic contract on lastGood items
        // NEVER return provider-native headlines
        const lastGoodItems = lastGood.items;
        const enforced = enforceDeterministicContract(lastGoodItems, traceId);
        
        // Filter by region if not 'global'
        let regionFiltered = enforced;
        if (region !== 'global') {
          regionFiltered = enforced.filter((item) => {
            const itemRegion = inferRegion(item);
            return itemRegion === region;
          });
          
          // Keyword-based fallback if no items match
          if (regionFiltered.length === 0 && enforced.length > 0) {
            const regionKeywords: Record<string, string[]> = {
              us: ['us', 'usa', 'united states', 'america', 'fed', 'federal reserve', 'treasury', 'sec', 'fomc'],
              europe: ['europe', 'eu', 'eurozone', 'ecb', 'european central bank', 'uk', 'england', 'france', 'germany', 'italy', 'spain', 'netherlands', 'boe'],
              asia: ['asia', 'china', 'japan', 'korea', 'singapore', 'hong kong', 'india', 'australia', 'pboc', 'boj', 'reserve bank', 'rbi'],
            };
            
            const keywords = regionKeywords[region] || [];
            const searchText = (text: string) => text.toLowerCase();
            
            regionFiltered = enforced.filter((item) => {
              const title = searchText(item.canonicalTitle || item.title || '');
              const source = searchText(item.source || item.publisher || '');
              const tags = Array.isArray(item.tags) ? item.tags.map(t => searchText(String(t))).join(' ') : '';
              const combined = `${title} ${source} ${tags}`;
              
              return keywords.some(keyword => combined.includes(keyword));
            });
          }
        }
        
        const finalLastGoodItems: HeadlineItem[] = regionFiltered.map((det) => ({
          id: det.id,
          title: det.canonicalTitle,
          canonicalTitle: det.canonicalTitle,
          impactBullets: det.impactBullets,
          topic: det.topic,
          confidence: det.confidence,
          publisher: det.publisher || det.source || 'Unknown',
          publishedAt: det.publishedAt || new Date().toISOString(),
          url: det.url || '',
          ...(det.tickers && det.tickers.length > 0 ? { tickers: det.tickers } : {}),
          ...(det.tags && det.tags.length > 0 ? { tags: det.tags } : {}),
          ...(det.summary ? { summary: det.summary } : {}),
        }));
        
        return NextResponse.json({
          ok: true,
          data: { items: finalLastGoodItems },
          meta: {
            traceId,
            fetchedAt: new Date().toISOString(),
            requestedRange: range,
            requestedRegion: region,
            effectiveRange: lastGood.effectiveRange,
            expanded: (RANGE_DAYS[lastGood.effectiveRange] ?? 0) > requestedDays,
            isCached: true,
            cachedAt: lastGood.cachedAt,
            updatedAt: lastGood.updatedAt,
            providers: headlines.providers,
            counts: headlines.counts,
            reason: 'last_good_fallback',
            latencyMs: Date.now() - startedAt,
            ...(diagnostics ? { diagnostics } : {}),
          },
        });
      }

      return NextResponse.json({
        ok: false,
        data: { items: [] as HeadlineItem[] },
        error: { code: 'HEADLINES_EMPTY', message: 'No headlines available from providers.' },
        meta: {
          traceId,
          fetchedAt: new Date().toISOString(),
          requestedRange: range,
          effectiveRange,
          expanded,
          isCached: false,
          providers: headlines.providers,
          counts: headlines.counts,
          reason: 'empty',
          latencyMs: Date.now() - startedAt,
          ...(diagnostics ? { diagnostics } : {}),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: { items },
      meta: {
        traceId,
        fetchedAt: new Date().toISOString(),
        requestedRange: range,
        effectiveRange,
        expanded,
        isCached: false,
        cachedAt: cacheValue.cachedAt,
        updatedAt,
        providers: headlines.providers,
        counts: headlines.counts,
        latencyMs: Date.now() - startedAt,
        ...(diagnostics ? { diagnostics } : {}),
      },
    });
  } catch (error) {
    const lastGood = await getLastGood();
    if (lastGood) {
      // Enforce deterministic contract on lastGood items
      // NEVER return provider-native headlines
      const lastGoodItems = lastGood.items;
      const enforced = enforceDeterministicContract(lastGoodItems, traceId);
      
      // Filter by region if not 'global'
      let regionFiltered = enforced;
      if (region !== 'global') {
        regionFiltered = enforced.filter((item) => {
          const itemRegion = inferRegion(item);
          return itemRegion === region;
        });
        
        // Keyword-based fallback if no items match
        if (regionFiltered.length === 0 && enforced.length > 0) {
          const regionKeywords: Record<string, string[]> = {
            us: ['us', 'usa', 'united states', 'america', 'fed', 'federal reserve', 'treasury', 'sec', 'fomc'],
            europe: ['europe', 'eu', 'eurozone', 'ecb', 'european central bank', 'uk', 'england', 'france', 'germany', 'italy', 'spain', 'netherlands', 'boe'],
            asia: ['asia', 'china', 'japan', 'korea', 'singapore', 'hong kong', 'india', 'australia', 'pboc', 'boj', 'reserve bank', 'rbi'],
          };
          
          const keywords = regionKeywords[region] || [];
          const searchText = (text: string) => text.toLowerCase();
          
          regionFiltered = enforced.filter((item) => {
            const title = searchText(item.canonicalTitle || item.title || '');
            const source = searchText(item.source || item.publisher || '');
            const tags = Array.isArray(item.tags) ? item.tags.map(t => searchText(String(t))).join(' ') : '';
            const combined = `${title} ${source} ${tags}`;
            
            return keywords.some(keyword => combined.includes(keyword));
          });
        }
      }
      
      const finalLastGoodItems: HeadlineItem[] = regionFiltered.map((det) => ({
        id: det.id,
        title: det.canonicalTitle,
        canonicalTitle: det.canonicalTitle,
        impactBullets: det.impactBullets,
        topic: det.topic,
        confidence: det.confidence,
        publisher: det.publisher || det.source || 'Unknown',
        publishedAt: det.publishedAt || new Date().toISOString(),
        url: det.url || '',
        ...(det.tickers && det.tickers.length > 0 ? { tickers: det.tickers } : {}),
        ...(det.tags && det.tags.length > 0 ? { tags: det.tags } : {}),
        ...(det.summary ? { summary: det.summary } : {}),
      }));
      
      return NextResponse.json({
        ok: true,
        data: { items: finalLastGoodItems },
        meta: {
          traceId,
          fetchedAt: new Date().toISOString(),
          requestedRange: range,
          requestedRegion: region,
          effectiveRange: lastGood.effectiveRange,
          expanded: (RANGE_DAYS[lastGood.effectiveRange] ?? 0) > (RANGE_DAYS[range] ?? RANGE_DAYS['1D']),
          isCached: true,
          cachedAt: lastGood.cachedAt,
          updatedAt: lastGood.updatedAt,
          reason: 'provider_error_last_good',
          error: toErrorText(error),
          latencyMs: Date.now() - startedAt,
        },
        warnings: ['provider_error', 'last_good_fallback'],
      });
    }

    return NextResponse.json({
      ok: false,
      data: { items: [] as HeadlineItem[] },
      error: { code: 'PROVIDER_ERROR', message: 'Failed to fetch headlines from providers.' },
      meta: {
        traceId,
        fetchedAt: new Date().toISOString(),
        requestedRange: range,
        effectiveRange: range,
        expanded: false,
        isCached: false,
        reason: 'provider_error',
        error: toErrorText(error),
        latencyMs: Date.now() - startedAt,
      },
    });
  }
}
