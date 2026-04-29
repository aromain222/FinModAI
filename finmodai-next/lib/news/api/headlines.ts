import type { SupabaseClient } from '@supabase/supabase-js';
import { buildHeadlineImageQuery } from '@/lib/headlineQuery';
import { searchPexelsPhotos } from '@/lib/pexels';
import { assessHeadlineRelevance } from '@/lib/news/relevance';
import {
  addRelevanceTags,
  dedupeHeadlines,
  demoPublishedAt,
  demoScenariosForTag,
  evaluateRelevantHeadlines,
  filterHeadlinesByFreshness,
  hashId,
  type HeadlineItem,
  isDev,
  isRealNewsUrl,
  normalizeIso,
  type NewsResponse,
  type Params,
  type ProviderName,
  topicQuery,
  withTimeoutSignal,
} from '@/lib/news/api/shared';

export function buildDemoHeadlines(params: Params, limit = params.limit): HeadlineItem[] {
  const selected = demoScenariosForTag(params.tag).slice(0, Math.min(limit, demoScenariosForTag(params.tag).length));
  return selected.map((scenario, index) => {
    const published = demoPublishedAt(params, index, selected.length);
    const tags = Array.from(new Set([...scenario.topics, scenario.eventType, 'demo']));
    return {
      id: hashId(`demo-headline:${scenario.key}:${published}`),
      title: scenario.headline,
      description: scenario.description,
      url: scenario.url,
      source: scenario.source,
      publishedAt: published,
      published_at: published,
      tags,
      imageUrl: buildHeadlineFallbackImage({
        title: scenario.headline,
        tags,
      }),
    };
  });
}

function pickUrl(raw: Record<string, unknown>): string | null {
  const source = raw.source && typeof raw.source === 'object' ? (raw.source as Record<string, unknown>) : null;
  const candidate = raw.url ?? raw.link ?? raw.articleUrl ?? source?.url;
  if (typeof candidate !== 'string' || candidate.trim().length === 0) return null;
  return candidate.trim();
}

function normalizeHeadline(raw: Record<string, unknown>, provider: ProviderName): HeadlineItem | null {
  const titleCandidate = raw.title ?? raw.headline;
  const title = typeof titleCandidate === 'string' ? titleCandidate.trim() : '';
  if (!title) return null;
  const url = pickUrl(raw);
  if (!url || !isRealNewsUrl(url)) return null;
  const sourceObj = raw.source && typeof raw.source === 'object' ? (raw.source as Record<string, unknown>) : null;
  const source =
    (typeof raw.source === 'string' ? raw.source : null) ??
    (typeof sourceObj?.name === 'string' ? sourceObj.name : null) ??
    (typeof raw.sourceDomain === 'string' ? raw.sourceDomain : null) ??
    provider;
  const description = raw.description ?? raw.summary ?? raw.content;
  const publishedIso = normalizeIso(raw.publishedAt ?? raw.published_at ?? raw.pubDate ?? raw.date);
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [];
  const imageCandidate = raw.imageUrl ?? raw.image_url ?? raw.urlToImage ?? raw.image ?? raw.thumbnail;

  return {
    id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : hashId(url),
    title,
    description: typeof description === 'string' && description.trim().length > 0 ? description.trim() : null,
    url,
    source: String(source),
    publishedAt: publishedIso,
    published_at: publishedIso,
    imageUrl: typeof imageCandidate === 'string' && imageCandidate.trim().length > 0 ? imageCandidate : undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

function eodhdTopicTag(tag: string): string {
  const map: Record<string, string> = {
    all: 'market',
    policy: 'central bank',
    rates: 'bond market',
    inflation: 'inflation',
    energy: 'energy',
    fx: 'currency',
    equities: 'stock market',
    growth: 'artificial intelligence',
  };
  return map[tag] ?? map.all;
}

function formatEodhdDate(value: string): string {
  const parsed = new Date(value);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().slice(0, 10);
}

function normalizeEodhdHeadline(row: Record<string, unknown>): HeadlineItem | null {
  const content = typeof row.content === 'string' ? row.content.trim() : '';
  return normalizeHeadline(
    {
      title: row.title,
      description: content ? content.replace(/\s+/g, ' ').slice(0, 500) : null,
      link: row.link,
      source: 'EODHD',
      date: row.date,
      tags: row.tags,
    },
    'eodhd'
  );
}

function absolutizeImageUrl(candidate: string, pageUrl: string): string | null {
  const value = candidate.trim();
  if (!value) return null;
  try {
    const resolved = new URL(value, pageUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function extractMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const content = match?.[1]?.trim();
    if (content) return content;
  }
  return null;
}

function parseOpenGraphImage(html: string, pageUrl: string): string | undefined {
  const candidate =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image') ??
    extractMetaContent(html, 'og:image:url');
  if (!candidate) return undefined;
  return absolutizeImageUrl(candidate, pageUrl) ?? undefined;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHeadlineFallbackImage(item: Pick<HeadlineItem, 'title' | 'tags'>, variant: 'thumb' | 'hero' = 'thumb'): string {
  const query = buildHeadlineImageQuery({
    headline: item.title,
    category: item.tags?.[0] ?? null,
  });
  const headlineWords = query
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const width = variant === 'hero' ? 1280 : 640;
  const height = variant === 'hero' ? 720 : 360;
  const title = escapeSvgText(headlineWords.join(' • ') || 'Macro Headline');
  const subtitle = escapeSvgText((item.tags?.[0] ?? 'macro').toUpperCase());
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#030712" />
        </linearGradient>
        <radialGradient id="glowA" cx="82%" cy="20%" r="48%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glowB" cx="22%" cy="82%" r="40%">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <rect width="${width}" height="${height}" fill="url(#glowA)" />
      <rect width="${width}" height="${height}" fill="url(#glowB)" />
      <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.16)}" width="${Math.round(width * 0.2)}" height="${Math.round(height * 0.02)}" rx="999" fill="rgba(255,255,255,0.08)" />
      <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.22)}" width="${Math.round(width * 0.12)}" height="${Math.round(height * 0.02)}" rx="999" fill="rgba(255,255,255,0.06)" />
      <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.7)}" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="${variant === 'hero' ? 40 : 24}" font-weight="700">${title}</text>
      <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.8)}" fill="rgba(248,250,252,0.72)" font-family="Arial, Helvetica, sans-serif" font-size="${variant === 'hero' ? 20 : 14}" font-weight="600" letter-spacing="3">${subtitle}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function resolveHeadlineImageUrl(item: HeadlineItem): Promise<string | undefined> {
  if (item.imageUrl) return item.imageUrl;
  if (!isRealNewsUrl(item.url)) return buildHeadlineFallbackImage(item);

  const timeout = withTimeoutSignal(4_000);
  try {
    const response = await fetch(item.url, {
      cache: 'no-store',
      signal: timeout.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'CapitalBaseBot/1.0 (+https://capitalbase.app)',
      },
    });
    if (!response.ok) return undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) return undefined;
    const html = await response.text();
    const openGraphImage = parseOpenGraphImage(html, item.url);
    if (openGraphImage) return openGraphImage;
  } catch {
  } finally {
    timeout.cleanup();
  }

  try {
    const query = buildHeadlineImageQuery({ headline: item.title, category: item.tags?.[0] ?? null });
    const photos = await searchPexelsPhotos(query);
    const photo = photos.find((candidate) => typeof candidate.src.landscape === 'string' || typeof candidate.src.large === 'string' || typeof candidate.src.medium === 'string');
    const imageUrl = photo?.src.landscape || photo?.src.large || photo?.src.medium;
    if (typeof imageUrl === 'string' && imageUrl.trim()) return imageUrl;
  } catch {}

  return buildHeadlineFallbackImage(item);
}

async function hydrateHeadlineImages(items: HeadlineItem[], maxResolves: number): Promise<HeadlineItem[]> {
  let remaining = Math.max(0, maxResolves);
  const output: HeadlineItem[] = [];
  for (const item of items) {
    if (item.imageUrl || remaining <= 0) {
      output.push(item);
      continue;
    }
    const resolved = await resolveHeadlineImageUrl(item);
    output.push(resolved ? { ...item, imageUrl: resolved } : item);
    remaining -= 1;
  }
  return output;
}

async function fetchPerigon(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.PERIGON_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    apiKey: key,
    q: topicQuery(params.tag),
    from: params.fromIso,
    sortBy: 'date',
    size: String(params.limit),
  });
  const timeout = withTimeoutSignal(10_000);
  const origin = process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : 'https://capital-base.com';
  try {
    const response = await fetch(`https://api.goperigon.com/v1/all?${qs.toString()}`, {
      cache: 'no-store',
      signal: timeout.signal,
      headers: { Referer: origin, Origin: origin },
    });
    if (!response.ok) throw new Error(`PERIGON_HTTP_${response.status}`);
    const payload = (await response.json()) as { articles?: unknown[] };
    const rows = Array.isArray(payload.articles) ? payload.articles.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
    const normalized = rows.map((row) => normalizeHeadline(row, 'perigon')).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) console.debug('[api/news] perigon', { rawCount: rows.length, normalizedCount: normalized.length, droppedCount: rows.length - normalized.length, sampleKeys: rows.length > 0 ? Object.keys(rows[0]) : [] });
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function fetchBenzinga(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.BENZINGA_API_KEY || process.env.BENZINGA_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    token: key,
    channels: 'economics,markets,general',
    dateFrom: params.fromIso,
    pageSize: String(params.limit),
    displayOutput: 'full',
  });
  const timeout = withTimeoutSignal(10_000);
  try {
    const response = await fetch(`https://api.benzinga.com/api/v2/news?${qs.toString()}`, {
      cache: 'no-store',
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`BENZINGA_HTTP_${response.status}`);
    const payload = (await response.json()) as { data?: unknown[]; articles?: unknown[] };
    const rawRows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.articles) ? payload.articles : [];
    const rows = rawRows.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'));
    const normalized = rows.map((row) => normalizeHeadline(row, 'benzinga')).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) console.debug('[api/news] benzinga', { rawCount: rows.length, normalizedCount: normalized.length, droppedCount: rows.length - normalized.length, sampleKeys: rows.length > 0 ? Object.keys(rows[0]) : [] });
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function fetchEodhd(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.EODHD_API_KEY || process.env.EODHD_API || process.env.EOD_HISTORICAL_DATA_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    api_token: key,
    fmt: 'json',
    t: eodhdTopicTag(params.tag),
    from: formatEodhdDate(params.fromIso),
    limit: String(params.limit),
    offset: '0',
  });
  const timeout = withTimeoutSignal(10_000);
  try {
    const response = await fetch(`https://eodhd.com/api/news?${qs.toString()}`, {
      cache: 'no-store',
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`EODHD_HTTP_${response.status}`);
    const payload = (await response.json()) as unknown;
    const rows = Array.isArray(payload)
      ? payload.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
      : [];
    const normalized = rows.map(normalizeEodhdHeadline).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) console.debug('[api/news] eodhd', { rawCount: rows.length, normalizedCount: normalized.length, droppedCount: rows.length - normalized.length, sampleKeys: rows.length > 0 ? Object.keys(rows[0]) : [] });
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function fetchNewsApi(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    apiKey: key,
    q: topicQuery(params.tag),
    from: params.fromIso,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: String(params.limit),
  });
  const timeout = withTimeoutSignal(10_000);
  try {
    const response = await fetch(`https://newsapi.org/v2/everything?${qs.toString()}`, {
      cache: 'no-store',
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`NEWSAPI_HTTP_${response.status}`);
    const payload = (await response.json()) as { articles?: unknown[] };
    const rows = Array.isArray(payload.articles) ? payload.articles.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
    const normalized = rows.map((row) => normalizeHeadline(row, 'newsapi')).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) console.debug('[api/news] newsapi', { rawCount: rows.length, normalizedCount: normalized.length, droppedCount: rows.length - normalized.length, sampleKeys: rows.length > 0 ? Object.keys(rows[0]) : [] });
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function fetchPolygon(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return [];
  const timeout = withTimeoutSignal(10_000);
  try {
    const { fetchPolygonHeadlines } = await import('@/lib/news/providers/polygon');
    const items = await fetchPolygonHeadlines({
      apiKey: key,
      range: params.range as import('@/lib/news/types').NewsRange,
      topic: (params.tag as import('@/lib/news/types').NewsTopic) ?? 'all',
      limit: params.limit,
      signal: timeout.signal,
    });
    const normalized = items.map((item) =>
      normalizeHeadline(
        { id: item.id, title: item.title, description: item.description, url: item.url, source: item.source, publishedAt: item.published_at, tags: item.tags, imageUrl: undefined },
        'newsapi' as ProviderName
      )
    ).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) console.debug('[api/news] polygon', { rawCount: items.length, normalizedCount: normalized.length });
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function fetchAlphaVantage(params: Params): Promise<HeadlineItem[]> {
  const key =
    process.env.ALPHA_VANTAGE_API_KEY ||
    process.env.ALPHAVANTAGE_API_KEY ||
    process.env.ALPHA_VANTAGE;
  if (!key) return [];
  const timeout = withTimeoutSignal(12_000);
  try {
    const { fetchAlphaVantageHeadlines } = await import('@/lib/news/providers/alphavantage');
    const items = await fetchAlphaVantageHeadlines({
      apiKey: key,
      range: params.range as import('@/lib/news/types').NewsRange,
      topic: (params.tag as import('@/lib/news/types').NewsTopic) ?? 'all',
      limit: params.limit,
      signal: timeout.signal,
    });
    const normalized = items.map((item) =>
      normalizeHeadline(
        { id: item.id, title: item.title, description: item.description, url: item.url, source: item.source, publishedAt: item.published_at, tags: item.tags, imageUrl: undefined },
        'newsapi' as ProviderName
      )
    ).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) console.debug('[api/news] alphavantage', { rawCount: items.length, normalizedCount: normalized.length });
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } finally {
    timeout.cleanup();
  }
}

async function fetchFinnhub(params: Params): Promise<HeadlineItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  const timeout = withTimeoutSignal(10_000);
  try {
    const { fetchFinnhubHeadlines } = await import('@/lib/news/providers/finnhub');
    const items = await fetchFinnhubHeadlines({
      apiKey: key,
      range: params.range as import('@/lib/news/types').NewsRange,
      topic: (params.tag as import('@/lib/news/types').NewsTopic) ?? 'all',
      limit: params.limit,
      signal: timeout.signal,
    });
    const normalized = items.map((item) =>
      normalizeHeadline(
        {
          id: item.id,
          title: item.title,
          description: item.description,
          url: item.url,
          source: item.source,
          publishedAt: item.published_at,
          tags: item.tags,
          imageUrl: undefined,
        },
        'newsapi' as ProviderName
      )
    ).filter((x): x is HeadlineItem => x !== null);
    if (isDev()) console.debug('[api/news] finnhub', { rawCount: items.length, normalizedCount: normalized.length });
    return dedupeHeadlines(normalized).slice(0, params.limit);
  } catch (error) {
    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function pullLiveHeadlines(params: Params, providers: ProviderName[], errors: string[]): Promise<{ provider: ProviderName | null; items: HeadlineItem[] }> {
  let primaryProvider: ProviderName | null = null;
  const collected: HeadlineItem[] = [];
  for (const provider of providers) {
    try {
      let items: HeadlineItem[] = [];
      if (provider === 'perigon') items = await fetchPerigon(params);
      if (provider === 'polygon') items = await fetchPolygon(params);
      if (provider === 'benzinga') items = await fetchBenzinga(params);
      if (provider === 'eodhd') items = await fetchEodhd(params);
      if (provider === 'newsapi') items = await fetchNewsApi(params);
      if (provider === 'alphavantage') items = await fetchAlphaVantage(params);
      if (provider === 'finnhub') items = await fetchFinnhub(params);
      if (items.length > 0) {
        if (primaryProvider === null) primaryProvider = provider;
        collected.push(...items);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'provider_failed';
      errors.push(`${provider}:${message}`);
      if (isDev()) console.error(`[api/news] ${provider} failed`, message);
    }
  }
  return {
    provider: primaryProvider,
    items: filterHeadlinesByFreshness(dedupeHeadlines(collected), params.fromIso).slice(0, Math.max(params.limit * 2, 30)),
  };
}

async function upsertHeadlines(supabase: SupabaseClient, items: HeadlineItem[], errors: string[]): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((item) => ({
    published_at: item.publishedAt,
    source: item.source,
    title: item.title,
    description: item.description,
    url: item.url,
    image_url: item.imageUrl ?? null,
    tags: item.tags ?? [],
  }));
  const { error } = await supabase.from('news_headlines').upsert(rows, { onConflict: 'url' });
  if (error) {
    errors.push(`supabase_upsert_headlines:${error.message}`);
    if (isDev()) console.error('[api/news] supabase upsert headlines failed', error.message);
    return 0;
  }
  return rows.length;
}

async function readHeadlinesFromSupabase(supabase: SupabaseClient, params: Params, errors: string[]): Promise<HeadlineItem[]> {
  let query = supabase.from('news_headlines').select('*').gte('published_at', params.fromIso).order('published_at', { ascending: false }).limit(params.limit);
  if (params.tag !== 'all') query = query.contains('tags', [params.tag]);
  const { data, error } = await query;
  if (error) {
    errors.push(`supabase_read_headlines:${error.message}`);
    if (isDev()) console.error('[api/news] supabase read headlines failed', error.message);
    return [];
  }
  const windowRows = Array.isArray(data) ? data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
  if (windowRows.length > 0) {
    return windowRows
      .map((row) =>
        normalizeHeadline(
          { id: row.id, title: row.title, description: row.description ?? row.summary, url: row.url, source: row.source, publishedAt: row.published_at, imageUrl: row.image_url, tags: row.tags },
          'supabase'
        )
      )
      .filter((item): item is HeadlineItem => item !== null)
      .slice(0, params.limit);
  }

  const latest = await supabase.from('news_headlines').select('*').order('published_at', { ascending: false }).limit(params.limit);
  if (latest.error) {
    errors.push(`supabase_read_headlines_latest:${latest.error.message}`);
    return [];
  }
  const rows = Array.isArray(latest.data) ? latest.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')) : [];
  const normalizedLatest = rows
    .map((row) =>
      normalizeHeadline(
        { id: row.id, title: row.title, description: row.description ?? row.summary, url: row.url, source: row.source, publishedAt: row.published_at, imageUrl: row.image_url, tags: row.tags },
        'supabase'
      )
    )
    .filter((item): item is HeadlineItem => item !== null)
    .slice(0, params.limit);

  if (normalizedLatest.length > 0) return normalizedLatest;
  return [];
}

export async function handleHeadlines(params: Params, supabase: SupabaseClient | null): Promise<NewsResponse> {
  const errors: string[] = [];
  const live = await pullLiveHeadlines(params, ['perigon', 'polygon', 'benzinga', 'eodhd', 'newsapi', 'alphavantage', 'finnhub'], errors);
  let ingested = 0;
  let provider: ProviderName = live.provider ?? 'supabase';
  const freshLiveHeadlines = filterHeadlinesByFreshness(dedupeHeadlines(live.items), params.fromIso);
  const strictLive = evaluateRelevantHeadlines(freshLiveHeadlines, 35);
  const softLive = evaluateRelevantHeadlines(freshLiveHeadlines, 26);
  const looseLive = evaluateRelevantHeadlines(freshLiveHeadlines, 18);
  const livePicked =
    strictLive.accepted.length >= Math.min(params.limit, 8)
      ? strictLive.accepted
      : softLive.accepted.length >= Math.min(params.limit, 5)
      ? softLive.accepted
      : looseLive.accepted;
  const finalLiveItems = await hydrateHeadlineImages(livePicked.map(addRelevanceTags), 6);

  if (isDev()) console.debug('[api/news][headlines][live]', { rawCount: live.items.length, normalizedCount: dedupeHeadlines(live.items).length, relevantCount: strictLive.accepted.length, droppedNoiseCount: strictLive.droppedNoiseCount, minScoreUsed: strictLive.accepted.length >= Math.min(params.limit, 8) ? 35 : softLive.accepted.length >= Math.min(params.limit, 5) ? 26 : 18 });

  if (supabase && finalLiveItems.length > 0) {
    try { ingested = await upsertHeadlines(supabase, finalLiveItems, errors); } catch (e) {
      errors.push(`supabase_upsert:${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  let supabaseItems: HeadlineItem[] = [];
  if (supabase) {
    try {
      supabaseItems = filterHeadlinesByFreshness(await readHeadlinesFromSupabase(supabase, params, errors), params.fromIso);
    } catch (e) {
      errors.push(`supabase_read:${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  const freshSupabaseHeadlines = filterHeadlinesByFreshness(dedupeHeadlines(supabaseItems), params.fromIso);
  const strictSupabase = evaluateRelevantHeadlines(freshSupabaseHeadlines, 35);
  const softSupabase = evaluateRelevantHeadlines(freshSupabaseHeadlines, 26);
  const looseSupabase = evaluateRelevantHeadlines(freshSupabaseHeadlines, 18);
  const supabasePicked =
    strictSupabase.accepted.length >= Math.min(params.limit, 8)
      ? strictSupabase.accepted
      : softSupabase.accepted.length >= Math.min(params.limit, 5)
      ? softSupabase.accepted
      : looseSupabase.accepted;
  const finalSupabaseItems = supabasePicked.map(addRelevanceTags);

  if (isDev()) console.debug('[api/news][headlines][supabase]', { rawCount: supabaseItems.length, normalizedCount: dedupeHeadlines(supabaseItems).length, relevantCount: strictSupabase.accepted.length, droppedNoiseCount: strictSupabase.droppedNoiseCount, minScoreUsed: strictSupabase.accepted.length >= Math.min(params.limit, 8) ? 35 : softSupabase.accepted.length >= Math.min(params.limit, 5) ? 26 : 18 });

  const salvage = filterHeadlinesByFreshness(dedupeHeadlines([...supabaseItems, ...live.items]), params.fromIso)
    .map((item) => ({
      item,
      relevance: assessHeadlineRelevance({
        title: item.title,
        description: item.description,
        source: item.source,
        minScore: 0,
      }),
    }))
    .filter((entry) => !entry.relevance.reasons.includes('noise:detected') && entry.relevance.eventType !== 'other' && entry.relevance.score >= 6)
    .sort((a, b) => b.relevance.score - a.relevance.score)
    .map(({ item, relevance }) => addRelevanceTags({ ...item, relevance }))
    .slice(0, params.limit);

  const preferred = filterHeadlinesByFreshness(dedupeHeadlines([...finalLiveItems, ...finalSupabaseItems]), params.fromIso).slice(0, params.limit);
  const minimumTarget = Math.min(params.limit, 6);
  const blended = preferred.length >= minimumTarget ? preferred : dedupeHeadlines([...preferred, ...salvage]).slice(0, params.limit);
  const demoHeadlines = buildDemoHeadlines(params, params.limit);
  const supplemented = blended.length > 0 ? blended : demoHeadlines;

  if (supplemented.length > 0) {
    const fromSupabaseCount = supplemented.filter((item) => finalSupabaseItems.some((cached) => cached.url === item.url)).length;
    const usedDemoFallback = supplemented.some((item) => (item.tags ?? []).includes('demo'));
    const responseErrors = usedDemoFallback ? [...errors, 'fallback:demo_headlines'] : errors;
    return {
      ok: true,
      provider: live.provider ?? (fromSupabaseCount > 0 ? 'supabase' : usedDemoFallback ? 'demo' : provider),
      items: supplemented,
      meta: { ingested, fromSupabase: fromSupabaseCount, errors: responseErrors },
    };
  }

  return { ok: true, provider: 'none', items: [], meta: { ingested: 0, fromSupabase: 0, errors } };
}
