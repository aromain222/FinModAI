import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';

import { ENV } from '@/lib/env/server';
import { getCache, setCache } from '@/lib/cache/memory';
import { clusterNews, type EventIntelRange, type EventIntelRegion, type NewsCluster, type RawNewsItem } from '@/lib/events/cluster';
import { enrichCluster, type EventEnrichment } from '@/lib/events/enrich';
import { macroKeywords } from '@/lib/macro/normalize';
import { getReaction } from '@/lib/market/reaction';
import { selectTopStories } from '@/lib/market/topStories';
import { fetchMarketHeadlinesLive } from '@/lib/news/headlinesPipeline';
import { toErrorText } from '@/lib/providers/utils';
import { inferRegion } from '@/lib/data/normalize';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  range: z.enum(['1D', '1W', '1M']).optional().default('1W'),
  region: z.enum(['us', 'europe', 'asia', 'global']).optional().default('global'),
  force: z.coerce.number().int().optional().default(0),
});

type EventIntel = {
  id: string;
  title: string;
  source: string;
  url?: string;
  publishedAt?: string;
  summary: string;
  category: string;
  themeTags: string[];
  affectedTickers: string[];
  affectedSectors: string[];
  impact: EventEnrichment['impact'];
  marketReaction?: {
    spy1d?: number | null;
    tickers: Array<{ symbol: string; pct1d: number | null; deltaVsSpy: number | null }>;
  };
};

type WatchItem = {
  symbol: string;
  label: 'beneficiary' | 'headwind';
  catalysts: string[];
  thesis: string;
  confidence: number;
};

type EventsIntelResponse = {
  updatedAt: string;
  source: 'finnhub' | 'webz' | 'fallback';
  data: {
    events: EventIntel[];
    watchlist: WatchItem[];
    dashboards: {
      themes: Array<{ theme: string; count: number }>;
      sectors: Array<{ sector: string; count: number }>;
      tickers: Array<{ symbol: string; count: number }>;
    };
  };
  warnings: string[];
};

const openai = ENV.OPENAI_API_KEY ? new OpenAI({ apiKey: ENV.OPENAI_API_KEY }) : null;

const ttlByRange: Record<EventIntelRange, number> = {
  '1D': 10 * 60 * 1000,
  '1W': 15 * 60 * 1000,
  '1M': 30 * 60 * 1000,
};

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function dedupeWarnings(raw: string[]): string[] {
  return uniq(raw.map((w) => (w || '').trim()).filter(Boolean));
}

function computeUpdatedAt(events: EventIntel[]): string {
  const timestamps = events
    .map((e) => Date.parse(e.publishedAt || ''))
    .filter((ts) => Number.isFinite(ts));
  if (!timestamps.length) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
}

function buildWebzQuery(region: EventIntelRegion): string {
  const baseTerms = [
    ...macroKeywords,
    'tariff',
    'sanctions',
    'war',
    'election',
    'oil',
    'opec',
    'earthquake',
    'hurricane',
    'wildfire',
    'flood',
    'cyber',
    'outage',
    'fda',
    'doj',
    'sec',
    'ftc',
    'regulation',
    'antitrust',
    'ai',
    'semiconductor',
    'chip',
  ];
  
  const regionQueries: Record<EventIntelRegion, string> = {
    us: 'US OR U.S. OR Fed OR Treasury OR FOMC OR Congress',
    europe: 'Europe OR EU OR Eurozone OR ECB OR European Central Bank OR UK OR England OR France OR Germany OR Italy OR Spain OR BoE',
    asia: 'Asia OR China OR Japan OR Korea OR Singapore OR Hong Kong OR India OR Australia OR PBOC OR BoJ OR Reserve Bank',
    global: '',
  };
  
  const regionQuery = regionQueries[region] || '';
  return [regionQuery, baseTerms.join(' OR ')].filter(Boolean).join(' OR ');
}

function isEventRelevant(item: { title: string; summary?: string }): boolean {
  const haystack = `${item.title} ${item.summary || ''}`.toLowerCase();
  const keywords = [
    ...macroKeywords,
    'tariff',
    'sanction',
    'war',
    'geopolit',
    'election',
    'oil',
    'opec',
    'crude',
    'gas',
    'lng',
    'cpi',
    'inflation',
    'jobs',
    'unemployment',
    'fed',
    'rate',
    'rates',
    'yield',
    'treasury',
    'central bank',
    'earthquake',
    'hurricane',
    'wildfire',
    'flood',
    'outage',
    'cyber',
    'fda',
    'drug',
    'biotech',
    'pharma',
    'health',
    'doj',
    'sec',
    'ftc',
    'regulation',
    'policy',
    'antitrust',
    'chip',
    'semiconductor',
    'ai',
    'software',
    'cloud',
  ];
  return keywords.some((k) => haystack.includes(k));
}

function mapToRaw(item: { id: string; title: string; summary?: string; source: string; url?: string; publishedAt: string; tickers?: string[] }): RawNewsItem {
  return {
    id: String(item.id),
    title: String(item.title || ''),
    summary: typeof item.summary === 'string' && item.summary.trim().length ? item.summary : undefined,
    source: String(item.source || ''),
    url: typeof item.url === 'string' && item.url.trim().length ? item.url : undefined,
    publishedAt: String(item.publishedAt || new Date().toISOString()),
    tickers: Array.isArray(item.tickers) ? item.tickers.map((t) => String(t)) : undefined,
  };
}

function buildDashboards(events: EventIntelResponse['data']['events']): EventsIntelResponse['data']['dashboards'] {
  const themeCounts = new Map<string, number>();
  const sectorCounts = new Map<string, number>();
  const tickerCounts = new Map<string, number>();

  for (const event of events) {
    for (const tag of event.themeTags ?? []) {
      const key = (tag || '').trim();
      if (!key) continue;
      themeCounts.set(key, (themeCounts.get(key) ?? 0) + 1);
    }
    for (const sector of event.affectedSectors ?? []) {
      const key = (sector || '').trim();
      if (!key) continue;
      sectorCounts.set(key, (sectorCounts.get(key) ?? 0) + 1);
    }
    for (const ticker of event.affectedTickers ?? []) {
      const key = (ticker || '').trim().toUpperCase();
      if (!key) continue;
      tickerCounts.set(key, (tickerCounts.get(key) ?? 0) + 1);
    }
  }

  const toSorted = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    themes: toSorted(themeCounts)
      .slice(0, 12)
      .map((row) => ({ theme: row.key, count: row.count })),
    sectors: toSorted(sectorCounts)
      .slice(0, 12)
      .map((row) => ({ sector: row.key, count: row.count })),
    tickers: toSorted(tickerCounts)
      .slice(0, 12)
      .map((row) => ({ symbol: row.key, count: row.count })),
  };
}

function buildWatchlist(events: EventIntel[]): WatchItem[] {
  type Agg = {
    symbol: string;
    label: WatchItem['label'];
    catalysts: Set<string>;
    bestReasoning: string;
    bestThemes: string[];
    bestConfidence: number;
    mentions: number;
    score: number;
  };

  const bySymbol = new Map<string, Agg>();

  for (const event of events) {
    const dir = event.impact?.direction;
    const confidence = typeof event.impact?.confidence === 'number' ? event.impact.confidence : 0;
    if (dir !== 'bullish' && dir !== 'bearish') continue;
    const label: WatchItem['label'] = dir === 'bullish' ? 'beneficiary' : 'headwind';

    for (const rawSymbol of event.affectedTickers ?? []) {
      const symbol = (rawSymbol || '').trim().toUpperCase();
      if (!symbol) continue;

      const existing = bySymbol.get(symbol);
      if (!existing) {
        bySymbol.set(symbol, {
          symbol,
          label,
          catalysts: new Set([event.title].filter(Boolean)),
          bestReasoning: (event.impact?.reasoning || '').trim(),
          bestThemes: Array.isArray(event.themeTags) ? event.themeTags.slice(0, 3) : [],
          bestConfidence: confidence,
          mentions: 1,
          score: confidence + 10,
        });
        continue;
      }

      existing.mentions += 1;
      existing.score += confidence + 5;
      if (event.title) existing.catalysts.add(event.title);

      if (confidence > existing.bestConfidence) {
        existing.bestConfidence = confidence;
        existing.bestReasoning = (event.impact?.reasoning || '').trim();
        existing.bestThemes = Array.isArray(event.themeTags) ? event.themeTags.slice(0, 3) : [];
        existing.label = label;
      }
    }
  }

  const candidates = Array.from(bySymbol.values())
    .map((row) => {
      const catalysts = Array.from(row.catalysts).slice(0, 3);
      const themeSuffix = row.bestThemes.length ? ` Themes: ${row.bestThemes.join(', ')}.` : '';
      const thesisBase = row.bestReasoning ? row.bestReasoning : 'Event-driven impact is unclear; monitor follow-through and confirmation.';
      const thesis = `${thesisBase}${themeSuffix}`.slice(0, 220);
      return {
        symbol: row.symbol,
        label: row.label,
        catalysts,
        thesis,
        confidence: Math.max(0, Math.min(100, Math.round(row.bestConfidence))),
        score: row.score,
        mentions: row.mentions,
      };
    })
    .filter((row) => row.confidence >= 40 || row.mentions >= 2)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.symbol.localeCompare(b.symbol))
    .slice(0, 10)
    .map(({ score: _score, mentions: _mentions, ...rest }) => rest);

  return candidates;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function worker() {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();

  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    region: searchParams.get('region') ?? undefined,
    force: searchParams.get('force') ?? undefined,
  });

  const range: EventIntelRange = parsed.success ? parsed.data.range : '1W';
  const region: EventIntelRegion = parsed.success ? parsed.data.region : 'global';
  const force = parsed.success ? Boolean(parsed.data.force) : false;

  const ttlMs = ttlByRange[range] ?? ttlByRange['1W'];
  const cacheKey = `events:intelligence:${range}:${region}`;

  const cached = !force ? getCache<EventsIntelResponse>(cacheKey) : null;
  if (cached && !cached.stale) return NextResponse.json(cached.value);

  const staleCached = cached && cached.stale ? cached.value : null;
  const warnings: string[] = [];

  try {
    const query = buildWebzQuery(region);

    const headlinesAgg = await fetchMarketHeadlinesLive({
      range,
      ticker: '',
      query,
      limit: 60,
      traceId,
    });

    const rawItems = Array.isArray(headlinesAgg.items) ? headlinesAgg.items.map(mapToRaw) : [];
    const relevant = rawItems.filter((item) => isEventRelevant(item));
    const forClustering = relevant.length >= 20 ? relevant : rawItems;

    let clusters = clusterNews({ items: forClustering, threshold: 0.35 });
    if (clusters.length < 4) {
      const top = selectTopStories({ items: headlinesAgg.items ?? [], limit: 8 });
      clusters = top.map((item) => {
        const raw = mapToRaw(item);
        return {
          id: raw.id,
          items: [raw],
          representative: raw,
          sources: [raw.source].filter(Boolean),
          headlineCount: 1,
          score: 1,
          tokens: new Set<string>(),
        } satisfies NewsCluster;
      });
    }

    clusters = clusters.slice(0, 8);

    const enriched = await mapWithConcurrency(clusters, 2, async (cluster) => {
      const result = await enrichCluster({
        cluster,
        range,
        region,
        openai,
        model: ENV.OPENAI_MODEL,
        traceId,
      });
      if (result.warning) warnings.push(result.warning);
      return { cluster, enrichment: result.enrichment };
    });

    let events: EventIntel[] = enriched.map(({ cluster, enrichment }) => {
      const rep = cluster.representative;
      return {
        id: String(cluster.id || rep.id),
        title: rep.title,
        source: rep.source,
        url: rep.url,
        publishedAt: rep.publishedAt,
        summary: enrichment.summary,
        category: enrichment.category,
        themeTags: enrichment.themeTags,
        affectedTickers: enrichment.affectedTickers,
        affectedSectors: enrichment.affectedSectors,
        impact: enrichment.impact,
      };
    });

    // Filter by region if not 'global' (fallback keyword-based filtering)
    if (region !== 'global' && events.length > 0) {
      const regionKeywords: Record<EventIntelRegion, string[]> = {
        us: ['us', 'usa', 'united states', 'america', 'fed', 'federal reserve', 'treasury', 'sec', 'fomc', 'congress'],
        europe: ['europe', 'eu', 'eurozone', 'ecb', 'european central bank', 'uk', 'england', 'france', 'germany', 'italy', 'spain', 'netherlands', 'boe'],
        asia: ['asia', 'china', 'japan', 'korea', 'singapore', 'hong kong', 'india', 'australia', 'pboc', 'boj', 'reserve bank', 'rbi'],
        global: [],
      };
      
      const keywords = regionKeywords[region] || [];
      const searchText = (text: string) => text.toLowerCase();
      
      // Filter events based on title, summary, and source
      events = events.filter((event) => {
        const title = searchText(event.title || '');
        const summary = searchText(event.summary || '');
        const source = searchText(event.source || '');
        const combined = `${title} ${summary} ${source}`;
        
        // Check if any region keyword matches
        return keywords.some(keyword => combined.includes(keyword));
      });
    }

    // Market reaction (best-effort): compute SPY once and then up to 3 tickers per event.
    let spy1d: number | null = null;
    try {
      const spy = await getReaction({ symbol: 'SPY', range: '1D', traceId });
      spy1d = spy.pctChange;
    } catch (error) {
      warnings.push('market_reaction_unavailable');
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[events:intelligence] spy_reaction_failed', { traceId, error: toErrorText(error) });
      }
    }

    const tickersNeeded = new Set<string>();
    for (const event of events) {
      for (const t of (event.affectedTickers ?? []).slice(0, 3)) {
        const sym = (t || '').trim().toUpperCase();
        if (sym && sym !== 'SPY') tickersNeeded.add(sym);
      }
    }
    const tickersList = Array.from(tickersNeeded);

    const tickerReactions = new Map<string, number | null>();
    await mapWithConcurrency(tickersList, 6, async (symbol) => {
      try {
        const r = await getReaction({ symbol, range: '1D', traceId });
        tickerReactions.set(symbol, r.pctChange);
      } catch {
        tickerReactions.set(symbol, null);
      }
      return null;
    });

    for (const event of events) {
      const tickers = (event.affectedTickers ?? [])
        .slice(0, 3)
        .map((t) => (t || '').trim().toUpperCase())
        .filter(Boolean);
      if (!tickers.length) continue;
      event.marketReaction = {
        spy1d,
        tickers: tickers.map((symbol) => {
          const pct1d = tickerReactions.get(symbol) ?? null;
          const deltaVsSpy = typeof pct1d === 'number' && typeof spy1d === 'number' ? pct1d - spy1d : null;
          return { symbol, pct1d, deltaVsSpy };
        }),
      };
    }

    const dashboards = buildDashboards(events);
    const watchlist = buildWatchlist(events);

    const perProvider = headlinesAgg.counts?.perProviderRaw ?? {};
    const source: EventsIntelResponse['source'] =
      (perProvider.finnhub ?? 0) > 0 ? 'finnhub' : (perProvider.webz ?? 0) > 0 ? 'webz' : 'fallback';

    if (!events.length && headlinesAgg.items?.length) warnings.push('no_events');
    if (!events.length && !headlinesAgg.items?.length) warnings.push('events_unavailable');

    const payload: EventsIntelResponse = {
      updatedAt: computeUpdatedAt(events),
      source,
      data: {
        events,
        watchlist,
        dashboards,
      },
      warnings: dedupeWarnings(warnings),
    };

    setCache(cacheKey, payload, ttlMs);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[events:intelligence]', { traceId, range, region, source, events: events.length, warnings: payload.warnings });
    }
    return NextResponse.json(payload);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[events:intelligence] failed', { traceId, error: toErrorText(error) });
    }

    if (staleCached) {
      return NextResponse.json({
        ...staleCached,
        warnings: dedupeWarnings([...(staleCached.warnings ?? []), 'stale']),
      } satisfies EventsIntelResponse);
    }

    const payload: EventsIntelResponse = {
      updatedAt: new Date().toISOString(),
      source: 'fallback',
      data: {
        events: [],
        watchlist: [],
        dashboards: { themes: [], sectors: [], tickers: [] },
      },
      warnings: ['events_unavailable'],
    };
    return NextResponse.json(payload);
  }
}
