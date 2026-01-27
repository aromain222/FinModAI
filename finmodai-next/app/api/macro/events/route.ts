import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { fetchMacroNewsLive } from '@/lib/news/headlinesPipeline';
import { dedupeItems, filterMacroItems, latestPublishedAt, type MacroNewsItem } from '@/lib/macro/normalize';
import { getMacroCache, setMacroCache } from '@/lib/macro/cache';
import { classifyImpact, classifySentiment, detectRegion, type Region, type Impact } from '@/lib/macro/sentiment';
import { ENV } from '@/lib/env/server';
import type { NewsItem } from '@/lib/schemas/news';
import { deterministicHeadlines, type DeterministicHeadline } from '@/lib/headlines/deterministic';

/**
 * Enforce deterministic headline contract for macro routes
 * Raw provider data MUST pass through deterministicHeadlines()
 * APIs MUST NEVER return provider-native headlines
 */
function enforceDeterministicContractMacro(
  rawItems: any[],
  traceId: string
): Array<DeterministicHeadline & { region?: Region; sentiment?: string; macroImpact?: Impact; tags?: string[]; summary?: string }> {
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
        region: rawItem.region,
        sentiment: rawItem.sentiment,
        macroImpact: rawItem.impact, // Store macro-specific impact separately
        tags: rawItem.tags || rawItem.topics || [],
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
      topic: 'macro' as const,
      impact: 'neutral' as const, // Deterministic impact field
      confidence: 0.3,
      impactBullets: ['Data incomplete'],
      publishedAt: rawItem.publishedAt || rawItem.date || null,
      source: rawItem.source || rawItem.provider || null,
      url: rawItem.url || null,
      region: rawItem.region,
      sentiment: rawItem.sentiment,
      macroImpact: rawItem.impact, // Store macro-specific impact separately
      tags: rawItem.tags || rawItem.topics || [],
      summary: rawItem.summary || undefined,
    };
  });

  return enforced;
}

export const runtime = 'nodejs';
const isDev = process.env.NODE_ENV !== 'production';

const openai = ENV.OPENAI_API_KEY ? new OpenAI({ apiKey: ENV.OPENAI_API_KEY }) : null;

const formatOpenAiError = (error: any) => {
  const status = typeof error?.status === 'number' ? error.status : undefined;
  const code = typeof error?.code === 'string' ? error.code : typeof error?.error?.code === 'string' ? error.error.code : undefined;
  const message = error?.message || 'openai_error';
  return { status, code, message };
};

const RangeSchema = z.enum(['1D', '1W', '1M']);
type Range = z.infer<typeof RangeSchema>;

const RegionSchema = z.enum(['global', 'us', 'europe', 'asia', 'Global', 'US', 'Europe', 'Asia']);
const SentimentSchema = z.enum(['all', 'bullish', 'neutral', 'bearish', 'All', 'Bullish', 'Neutral', 'Bearish']);

const QuerySchema = z.object({
  range: RangeSchema.optional().default('1W'),
  region: RegionSchema.optional().default('global'),
  sentiment: SentimentSchema.optional().default('all'),
});

const normalizeRegion = (region: string): Region => {
  const lower = region.toLowerCase();
  if (lower === 'us') return 'us';
  if (lower === 'europe') return 'europe';
  if (lower === 'asia') return 'asia';
  return 'global';
};

const normalizeSentiment = (sentiment: string) => {
  const lower = sentiment.toLowerCase();
  if (lower === 'bullish') return 'bullish';
  if (lower === 'bearish') return 'bearish';
  if (lower === 'neutral') return 'neutral';
  return 'all';
};

const filterBySentiment = (items: MacroNewsItem[], sentiment: string) => {
  if (sentiment === 'all') return items;
  return items.filter((item) => item.sentiment === sentiment);
};

const mapNewsItemToMacro = (item: NewsItem): MacroNewsItem => {
  const title = typeof item.title === 'string' ? item.title : 'Untitled';
  const summary = typeof item.summary === 'string' ? item.summary : '';
  const tags = Array.isArray(item.topics) ? item.topics.filter((t): t is string => typeof t === 'string') : [];
  const region = detectRegion(`${title} ${summary}`);
  const sentiment = classifySentiment(`${title} ${summary}`);
  const impact = classifyImpact(`${title} ${summary}`);
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : `news-${Date.now()}`,
    title,
    source: typeof item.source === 'string' && item.source.trim() ? item.source : 'Unknown',
    url: typeof item.url === 'string' && item.url.trim() ? item.url : undefined,
    publishedAt: typeof item.publishedAt === 'string' && item.publishedAt.trim() ? item.publishedAt : new Date().toISOString(),
    summary: summary || undefined,
    tags,
    region,
    sentiment,
    impact,
  };
};

const buildAiSummary = async (items: MacroNewsItem[], range: Range, region: Region) => {
  if (!openai) {
    return { ok: false, error: 'ai_unavailable', errorInfo: { code: 'missing_api_key', message: 'OpenAI API key not configured' } };
  }
  const titles = items
    .slice(0, 8)
    .map((item) => `${item.title}${item.summary ? ` — ${item.summary}` : ''}`)
    .join(' | ');
  const prompt = [
    `Range: ${range}`,
    `Region: ${region}`,
    `Headlines: ${titles || 'none'}`,
  ].join('\n');

  try {
    const resp = await openai.responses.create({
      model: 'gpt-5.2-mini',
      temperature: 0,
      text: {
        format: {
          type: 'json_schema',
          name: 'macro_events_ai',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              narrative: { type: 'string' },
              keyDrivers: { type: 'array', items: { type: 'string' } },
              risks: { type: 'array', items: { type: 'string' } },
              sentiment: { type: 'string', enum: ['bullish', 'neutral', 'bearish'] },
            },
            required: ['narrative', 'keyDrivers', 'risks', 'sentiment'],
          },
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content:
            'You are a macro strategist. Summarize what happened and why it matters using only the provided headlines.',
        },
        { role: 'user', content: `Return JSON per schema.\n\n${prompt}` },
      ],
    });
    const parsed = JSON.parse(resp.output_text ?? '{}');
    return {
      ok: true,
      narrative: typeof parsed.narrative === 'string' ? parsed.narrative : '',
      keyDrivers: Array.isArray(parsed.keyDrivers) ? parsed.keyDrivers : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral',
    };
  } catch (error: any) {
    const errorInfo = formatOpenAiError(error);
    if (isDev) {
      console.warn('[macro:events] AI summary failed', { ...errorInfo });
    }
    return { ok: false, error: errorInfo.message || 'ai_failed', errorInfo };
  }
};

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  if (process.env.NODE_ENV !== 'production' || process.env.MACRO_DEBUG_KEYS === '1') {
    console.log('[MACRO_KEYS]', {
      FRED: !!process.env.FRED_API_KEY,
      DATABENTO: !!process.env.DATABENTO_API_KEY,
      DATABENTO_NEWS_DATASET: !!process.env.DATABENTO_NEWS_DATASET,
      WEBZ: !!process.env.WEBZ_API_KEY,
      WEBZIO: !!process.env.WEBZIO_API_KEY,
      OPENAI: !!process.env.OPENAI_API_KEY,
      FINNHUB: !!process.env.FINNHUB_API_KEY,
      POLYGON: !!process.env.POLYGON_API_KEY,
    });
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    region: searchParams.get('region') ?? undefined,
    sentiment: searchParams.get('sentiment') ?? undefined,
  });

  const rawRegion = parsed.success ? parsed.data.region : 'global';
  const region = normalizeRegion(rawRegion);
  const range = parsed.success ? parsed.data.range : ('1W' as Range);
  const sentiment = normalizeSentiment(parsed.success ? parsed.data.sentiment : 'all');

  const warnings: string[] = [];
  const cacheKey = `macro:events:${range}:${region}`;
  let items: MacroNewsItem[] = [];
  let source: 'databento' | 'webz' | 'finnhub' | 'cache' | 'fallback' = 'fallback';
  let providerOk = false;
  let providers: Record<string, any> | undefined;
  let counts: any | undefined;

  try {
    const query = 'Federal Reserve OR inflation OR CPI OR unemployment OR central bank OR interest rates OR GDP OR recession OR yields';
    const live = await fetchMacroNewsLive({ range, query, limit: 25, traceId });
    providers = live.providers;
    counts = live.counts;
    providerOk = Object.values(live.providers || {}).some((p: any) => p.ok);

    const mapped = (live.items ?? []).map(mapNewsItemToMacro);
    items = mapped;
    if (live.source === 'databento' || live.source === 'webz' || live.source === 'finnhub') {
      source = items.length ? (live.source as any) : 'fallback';
    }

    if (items.length) {
      const regionFiltered =
        region === 'global' ? items : items.filter((item) => (item.region || 'global') === region);
      if (region !== 'global' && regionFiltered.length >= 3) {
        items = regionFiltered;
      }

      const filtered = filterMacroItems(items);
      if (filtered.length >= 3) items = filtered;
      else if (!filtered.length) warnings.push('macro_filter_relaxed');

      items = dedupeItems(items).map((item) => ({
        ...item,
        sentiment: item.sentiment ?? classifySentiment(`${item.title} ${item.summary ?? ''}`),
      }));

      await setMacroCache(cacheKey, { items, source }, latestPublishedAt(items));
    }
  } catch {
    warnings.push('events_unavailable');
  }

  if (!items.length) {
    const cached = await getMacroCache<{ items: MacroNewsItem[]; source: string }>(cacheKey);
    if (cached?.payload?.items?.length) {
      items = cached.payload.items;
      source = 'cache';
      warnings.push('stale');
      providerOk = true;
    }
  }

  const filteredBySentiment = filterBySentiment(items, sentiment);
  if (sentiment !== 'all' && filteredBySentiment.length !== items.length) {
    items = filteredBySentiment;
  }

  const updatedAt = items.length ? latestPublishedAt(items) : new Date().toISOString();
  const ai = openai && items.length ? await buildAiSummary(items, range, region) : undefined;
  // AI is best-effort; treat failures as non-fatal and keep warnings minimal.

  // CRITICAL: Enforce deterministic contract - raw provider data MUST pass through deterministic processor
  // APIs MUST NEVER return provider-native headlines
  const rawCount = items.length;
  const rawItemsForDeterministic = items.map((item) => ({
    id: item.id,
    title: item.title,
    source: item.source,
    url: item.url,
    publishedAt: item.publishedAt,
    summary: item.summary,
    tickers: [],
    topics: item.tags,
    region: item.region,
    sentiment: item.sentiment,
    impact: item.impact,
  }));
  
  const enforced = enforceDeterministicContractMacro(rawItemsForDeterministic, traceId);
  const deterministicCount = enforced.filter((item) => item.impactBullets.length > 1 && item.impactBullets[0] !== 'Data incomplete').length;
  
  // Map enforced deterministic items back to MacroNewsItem format (with deterministic fields)
  // Note: det.impact is the deterministic impact field (positive/neutral/negative)
  // det.macroImpact is the macro-specific impact classification
  const enrichedItems: Array<MacroNewsItem & { 
    canonicalTitle: string;
    impactBullets: string[];
    topic: string;
    confidence: number;
  }> = enforced.map((det) => ({
    id: det.id,
    title: det.canonicalTitle, // Use canonicalTitle as primary title
    source: det.source || 'Unknown',
    url: det.url || undefined,
    publishedAt: det.publishedAt || new Date().toISOString(),
    summary: det.summary,
    tags: det.tags,
    region: det.region,
    sentiment: det.sentiment,
    impact: det.macroImpact, // Use macro-specific impact
    canonicalTitle: det.canonicalTitle,
    impactBullets: det.impactBullets,
    topic: det.topic,
    confidence: det.confidence,
  }));
  
  // Use enforced deterministic items (NEVER return provider-native headlines)
  items = enrichedItems as MacroNewsItem[];

  const ok = items.length > 0 || providerOk;

  // Log raw response once (server-side) in dev mode to trace duplicates
  if (process.env.NODE_ENV !== 'production') {
    console.log('[MACRO_EVENTS_API] Raw response:', {
      traceId,
      itemCount: items.length,
      items: items.map((item) => ({
        title: item.title,
        publishedAt: item.publishedAt,
        region: item.region,
        impact: item.impact,
      })),
      source,
      range,
      region,
    });
  }

  return NextResponse.json({
    ok,
    source,
    updatedAt,
    range,
    region,
    items,
    ai,
    warnings: Array.from(new Set(warnings)),
    meta:
      process.env.NODE_ENV !== 'production'
        ? {
            traceId,
            fetchedAt: new Date().toISOString(),
            providers,
            counts,
            deterministic: {
              rawCount,
              deterministicCount,
            },
            ...(ai && !ai.ok && ai.errorInfo ? { aiError: ai.errorInfo } : {}),
          }
        : undefined,
  });
}
