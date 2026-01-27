import 'server-only';

import { ENV } from '@/lib/env/server';
import { ProviderError, providerFailure, providerTimeout, notConfigured } from '@/lib/providers/errors';
import { classifyImpact, classifySentiment, detectRegion, type Region } from '@/lib/macro/sentiment';
import { dedupeItems, filterMacroItems, normalizeDate, type MacroNewsItem } from '@/lib/macro/normalize';
import { fetchWithTimeout, toErrorText } from '@/lib/providers/utils';

type Range = '1D' | '1W' | '1M';

type MarketPoint = { t: string; close: number };

const BASE_URL = ENV.DATABENTO_BASE_URL || 'https://hist.databento.com/v0';
const API_KEY = ENV.DATABENTO_API_KEY || '';
const NEWS_DATASET = ENV.DATABENTO_NEWS_DATASET || '';
const EQUITIES_DATASET = ENV.DATABENTO_EQUITIES_DATASET || 'DBEQ';

const rangeLimits: Record<Range, number> = { '1D': 3, '1W': 8, '1M': 35 };

const fetchDatabento = async (path: string, params: Record<string, string>) => {
  if (!API_KEY) throw notConfigured('databento');
  const search = new URLSearchParams(params).toString();
  const url = `${BASE_URL}/${path}?${search}`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: { 'X-Api-Key': API_KEY },
        cache: 'no-store',
      },
      8000
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 300);
      throw providerFailure('databento', snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`, res.status);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw providerTimeout('databento');
    }
    if (error instanceof ProviderError) throw error;
    throw providerFailure('databento', toErrorText(error));
  }
};

const toMarketPoints = (rows: any[]): MarketPoint[] =>
  rows
    .map((row) => {
      const t = row.t || row.ts || row.time || row.timestamp;
      const close = row.c ?? row.close ?? row.p;
      const date = typeof t === 'number' ? new Date(t) : new Date(t);
      if (!Number.isFinite(close) || Number.isNaN(date.getTime())) return null;
      return { t: date.toISOString(), close: Number(close) };
    })
    .filter((item): item is MarketPoint => Boolean(item))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

export async function fetchDatabentoMarket(params: {
  symbol: string;
  range: Range;
}): Promise<MarketPoint[]> {
  const schema = params.range === '1D' ? 'ohlcv-1m' : 'ohlcv-1d';
  const limit = params.range === '1D' ? '300' : params.range === '1W' ? '80' : '200';
  const json = await fetchDatabento('timeseries', {
    dataset: EQUITIES_DATASET,
    symbols: params.symbol,
    schema,
    limit,
  });

  const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json?.bars) ? json.bars : json?.data?.bars || [];
  const points = toMarketPoints(rows);
  const limitCount = rangeLimits[params.range] ?? points.length;
  return points.slice(-limitCount);
}

export async function fetchDatabentoNews(params: {
  range: Range;
  region: Region;
  limit: number;
}): Promise<MacroNewsItem[]> {
  if (!NEWS_DATASET) throw notConfigured('databento_news');
  const now = new Date();
  const start = new Date(now.getTime() - (params.range === '1D' ? 1 : params.range === '1W' ? 7 : 30) * 24 * 60 * 60 * 1000);

  const json = await fetchDatabento('news', {
    dataset: NEWS_DATASET,
    start: start.toISOString(),
    end: now.toISOString(),
    limit: String(params.limit),
  });

  const rows = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.news)
    ? json.news
    : Array.isArray(json?.items)
    ? json.items
    : [];

  const normalized: MacroNewsItem[] = rows.map((row: any) => {
    const title = String(row.title || row.headline || row.summary || row.text || 'Untitled');
    const summary = String(row.summary || row.teaser || row.text || '');
    const publishedAt = normalizeDate(String(row.published_at || row.timestamp || row.time || row.date || new Date().toISOString()));
    const source = String(row.source || row.publisher || row.vendor || 'DataBento');
    const url = row.url || row.link || row.uri;
    const text = `${title} ${summary}`;
    const rawSentiment = typeof row.sentiment === 'string' ? row.sentiment.toLowerCase() : '';
    const sentiment =
      rawSentiment === 'bullish' || rawSentiment === 'bearish' || rawSentiment === 'neutral'
        ? rawSentiment
        : classifySentiment(text);
    return {
      id: String(row.id || row.news_id || row.uuid || `${title}-${publishedAt}`),
      title,
      source,
      url,
      publishedAt,
      summary,
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      region: detectRegion(text),
      sentiment,
      impact: classifyImpact(text),
    };
  });

  const filtered = filterMacroItems(normalized);
  const fallback = filtered.length >= 3 ? filtered : normalized;
  const regioned = params.region === 'global' ? fallback : fallback.filter((item) => item.region === params.region);

  return dedupeItems(regioned);
}
