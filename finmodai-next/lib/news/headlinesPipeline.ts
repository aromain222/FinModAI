import 'server-only';

import { ENV } from '@/lib/env/server';
import { ProviderError, notConfigured, providerFailure } from '@/lib/providers/errors';
import { fetchWithTimeout } from '@/lib/providers/utils';
import { fetchWebzNews } from '@/lib/providers/news/webz';
import { fetchDatabentoNews } from '@/lib/macro/providers/databento';
import { macroKeywords, normalizeTitle } from '@/lib/macro/normalize';
import { NewsItemSchema, type NewsItem } from '@/lib/schemas/news';

export type ProviderMeta = {
  ok: boolean;
  status?: number;
  reason?: string;
  durationMs: number;
};

export type ProviderDiagnostics = Record<string, ProviderMeta>;

export type ProviderCounts = {
  rawTotal: number;
  postFilterTotal: number;
  perProviderRaw: Record<string, number>;
};

export type HeadlinesAggregation = {
  items: NewsItem[];
  source: string;
  providers: ProviderDiagnostics;
  counts: ProviderCounts;
  window: { requested: string; used: string; days: number };
};

type RangeMarket = '1D' | '3D' | '7D' | '14D' | '30D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
type RangeMacro = '1D' | '1W' | '1M';

const rangeDays: Record<string, number> = {
  '1D': 1,
  '3D': 3,
  '7D': 7,
  '14D': 14,
  '30D': 30,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
  '5Y': 365 * 5,
};

const toISODate = (value: unknown) => {
  if (typeof value === 'string' && value.trim().length) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
};

const toDateBucket = (value: string) => {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return 'unknown';
  const date = new Date(ts);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const hashId = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `${Math.abs(hash)}`;
};

const normalizeSentiment = (text: string): 'pos' | 'neg' | 'neu' => {
  const lower = text.toLowerCase();
  if (lower.includes('rally') || lower.includes('surge') || lower.includes('gain') || lower.includes('beats')) return 'pos';
  if (lower.includes('drop') || lower.includes('decline') || lower.includes('fall') || lower.includes('misses')) return 'neg';
  return 'neu';
};

const classifyProviderError = (error: unknown): { status?: number; reason: string } => {
  if (error instanceof ProviderError) {
    if (error.code === 'NOT_CONFIGURED') return { reason: 'missing_key' };
    if (error.code === 'TIMEOUT') return { status: typeof error.status === 'number' ? error.status : 408, reason: 'timeout' };
    const status = typeof error.status === 'number' ? error.status : undefined;
    if (status === 401 || status === 403) return { status, reason: 'auth' };
    if (status === 429) return { status, reason: 'rate_limit' };
    if (typeof status === 'number' && status >= 500) return { status, reason: 'server' };
    return { status, reason: 'provider_error' };
  }
  if (error instanceof Error && error.name === 'AbortError') return { reason: 'timeout' };
  return { reason: 'error' };
};

const safeParseNewsItem = (value: unknown): NewsItem | null => {
  const parsed = NewsItemSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const dedupeNews = (items: NewsItem[]): NewsItem[] => {
  const scoreCandidate = (item: NewsItem) => {
    let score = 0;
    if (item.url && item.url.trim().length) score += 3;
    if (item.summary && item.summary.trim().length >= 40) score += 2;
    if (Array.isArray(item.tickers) && item.tickers.length) score += 1;
    if (Array.isArray(item.topics) && item.topics.length) score += 0.5;
    return score;
  };

  const bestByKey = new Map<string, { item: NewsItem; score: number }>();
  for (const item of items) {
    const titleKey = normalizeTitle(item.title || '');
    if (!titleKey) continue;
    const key = `${titleKey}|${toDateBucket(item.publishedAt)}`;
    const score = scoreCandidate(item);
    const existing = bestByKey.get(key);
    if (!existing || score > existing.score) bestByKey.set(key, { item, score });
  }
  return Array.from(bestByKey.values()).map((row) => row.item);
};

const filterByRange = (items: NewsItem[], range: string): NewsItem[] => {
  const days = rangeDays[range] ?? 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const ts = Date.parse(item.publishedAt);
    return Number.isFinite(ts) ? ts >= cutoff : true;
  });
};

async function runProvider(name: string, fetcher: () => Promise<NewsItem[]>) {
  const startedAt = Date.now();
  try {
    const items = await fetcher();
    const durationMs = Date.now() - startedAt;
    return {
      name,
      items,
      meta: {
        ok: true,
        status: 200,
        reason: items.length ? 'ok' : 'empty',
        durationMs,
      } satisfies ProviderMeta,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const classified = classifyProviderError(error);
    return {
      name,
      items: [] as NewsItem[],
      meta: {
        ok: false,
        status: classified.status,
        reason: classified.reason,
        durationMs,
      } satisfies ProviderMeta,
    };
  }
}

async function fetchFmpStockNews(params: { ticker?: string; limit: number; traceId: string }): Promise<NewsItem[]> {
  const apiKey = ENV.FMP_API_KEY;
  if (!apiKey) throw notConfigured('fmp');

  const url = params.ticker
    ? `https://financialmodelingprep.com/api/v3/stock_news?tickers=${encodeURIComponent(params.ticker)}&limit=${params.limit}&apikey=${apiKey}`
    : `https://financialmodelingprep.com/api/v3/stock_news?limit=${params.limit}&apikey=${apiKey}`;

  const res = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw providerFailure('fmp', body || `HTTP ${res.status}`, res.status);
  }
  const json = await res.json().catch(() => null);
  const rows = Array.isArray(json) ? json : [];

  return rows
    .slice(0, params.limit)
    .map((row: any, idx: number) => {
      const title = typeof row?.title === 'string' ? row.title : typeof row?.headline === 'string' ? row.headline : 'Untitled';
      const publishedAt = toISODate(row?.publishedDate || row?.published_at || row?.date || row?.time);
      const urlStr = typeof row?.url === 'string' ? row.url : typeof row?.link === 'string' ? row.link : '';
      const source = typeof row?.site === 'string' ? row.site : typeof row?.source === 'string' ? row.source : 'FMP';
      const summary =
        typeof row?.text === 'string'
          ? row.text
          : typeof row?.summary === 'string'
          ? row.summary
          : '';
      const symbol = typeof row?.symbol === 'string' ? row.symbol : typeof row?.ticker === 'string' ? row.ticker : params.ticker;

      return safeParseNewsItem({
        id: `fmp-${symbol || 'news'}-${idx}-${publishedAt}`,
        title,
        url: urlStr || '',
        source: source || 'FMP',
        publishedAt,
        summary,
        topics: [],
        tickers: symbol ? [symbol] : [],
        sentiment: normalizeSentiment(`${title} ${summary}`),
      });
    })
    .filter((item): item is NewsItem => Boolean(item));
}

async function fetchFinnhubNews(params: { ticker?: string; range: string; limit: number }): Promise<NewsItem[]> {
  const apiKey = ENV.FINNHUB_API_KEY;
  if (!apiKey) throw notConfigured('finnhub');

  const ticker = params.ticker?.trim().toUpperCase() || '';
  const days = rangeDays[params.range] ?? 7;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = now.toISOString().slice(0, 10);

  const tryCompanyNews = async () => {
    if (!ticker) return [] as any[];
    const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${fromStr}&to=${toStr}&token=${apiKey}`;
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
    if (!res.ok) throw providerFailure('finnhub', `HTTP ${res.status}`, res.status);
    const json = await res.json().catch(() => null);
    return Array.isArray(json) ? json : [];
  };

  const tryGeneralNews = async () => {
    const url = `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`;
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
    if (!res.ok) throw providerFailure('finnhub', `HTTP ${res.status}`, res.status);
    const json = await res.json().catch(() => null);
    return Array.isArray(json) ? json : [];
  };

  let rows: any[] = [];
  try {
    rows = await tryCompanyNews();
  } catch {
    rows = [];
  }
  if (!rows.length) {
    rows = await tryGeneralNews();
  }

  return rows
    .slice(0, params.limit)
    .map((row: any, idx: number) => {
      const title = typeof row?.headline === 'string' ? row.headline : typeof row?.title === 'string' ? row.title : 'Untitled';
      const publishedAt = typeof row?.datetime === 'number' ? toISODate(row.datetime * 1000) : toISODate(row?.publishedAt || row?.published_at);
      const urlStr = typeof row?.url === 'string' ? row.url : '';
      const source = typeof row?.source === 'string' ? row.source : 'Finnhub';
      const summary = typeof row?.summary === 'string' ? row.summary : '';
      const related = typeof row?.related === 'string' ? row.related : '';
      const tickers = related
        ? related
            .split(',')
            .map((t: string) => t.trim().toUpperCase())
            .filter(Boolean)
        : ticker
        ? [ticker]
        : [];

      return safeParseNewsItem({
        id: `finnhub-${idx}-${publishedAt}`,
        title,
        url: urlStr || '',
        source,
        publishedAt,
        summary,
        topics: [],
        tickers,
        sentiment: normalizeSentiment(`${title} ${summary}`),
      });
    })
    .filter((item): item is NewsItem => Boolean(item));
}

async function fetchGdeltNews(params: { query: string; limit: number }): Promise<NewsItem[]> {
  const query = params.query?.trim() || 'stocks OR equities OR earnings OR rates';
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
    query
  )}&mode=artlist&maxrecords=${params.limit}&format=json&sort=datedesc`;

  const res = await fetchWithTimeout(
    url,
    { cache: 'no-store', headers: { 'User-Agent': 'CapitalBase/1.0' } },
    3500
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw providerFailure('gdelt', body || `HTTP ${res.status}`, res.status);
  }

  const json = await res.json().catch(() => null);
  const articles = Array.isArray(json?.articles) ? json.articles : [];

  return articles
    .slice(0, params.limit)
    .map((article: any, idx: number) => {
      const title = typeof article?.title === 'string' ? article.title : 'Untitled';
      const publishedAt = toISODate(article?.seendate || article?.publishedAt || article?.published_at);
      const urlStr = typeof article?.url === 'string' ? article.url : '';
      const source =
        typeof article?.domain === 'string' ? article.domain : typeof article?.source === 'string' ? article.source : 'GDELT';
      const summary =
        typeof article?.summary === 'string' ? article.summary : typeof article?.excerpt === 'string' ? article.excerpt : '';
      const id = urlStr ? `gdelt-${hashId(urlStr)}` : `gdelt-${idx}-${publishedAt}`;

      return safeParseNewsItem({
        id,
        title,
        url: urlStr || '',
        source,
        publishedAt,
        summary,
        topics: [],
        tickers: [],
        sentiment: normalizeSentiment(`${title} ${summary}`),
      });
    })
    .filter((item): item is NewsItem => Boolean(item));
}

async function fetchPolygonNews(params: { ticker?: string; limit: number }): Promise<NewsItem[]> {
  const apiKey = ENV.POLYGON_API_KEY;
  if (!apiKey) throw notConfigured('polygon');

  const ticker = params.ticker?.trim().toUpperCase() || '';
  const tickerParam = ticker ? `ticker=${encodeURIComponent(ticker)}&` : '';
  const url = `https://api.polygon.io/v2/reference/news?${tickerParam}limit=${params.limit}&apiKey=${encodeURIComponent(apiKey)}`;

  const res = await fetchWithTimeout(url, { cache: 'no-store' }, 3500);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw providerFailure('polygon', body || `HTTP ${res.status}`, res.status);
  }

  const json = await res.json().catch(() => null);
  const results = Array.isArray(json?.results) ? json.results : [];

  return results
    .slice(0, params.limit)
    .map((row: any, idx: number) => {
      const title = typeof row?.title === 'string' ? row.title : 'Untitled';
      const publishedAt = toISODate(row?.published_utc || row?.publishedAt || row?.published_at);
      const urlStr = typeof row?.article_url === 'string' ? row.article_url : typeof row?.url === 'string' ? row.url : '';
      const source = typeof row?.publisher?.name === 'string' ? row.publisher.name : 'Polygon';
      const summary = typeof row?.description === 'string' ? row.description : typeof row?.summary === 'string' ? row.summary : '';
      const tickers = Array.isArray(row?.tickers)
        ? row.tickers
            .map((t: any) => (typeof t === 'string' ? t.trim().toUpperCase() : ''))
            .filter(Boolean)
        : ticker
        ? [ticker]
        : [];
      const topics = Array.isArray(row?.keywords)
        ? row.keywords
            .map((t: any) => (typeof t === 'string' ? t.trim() : ''))
            .filter(Boolean)
        : [];
      const id = urlStr ? `polygon-${hashId(urlStr)}` : `polygon-${idx}-${publishedAt}`;

      return safeParseNewsItem({
        id,
        title,
        url: urlStr || '',
        source,
        publishedAt,
        summary,
        topics: topics.slice(0, 6),
        tickers: tickers.slice(0, 8),
        sentiment: normalizeSentiment(`${title} ${summary}`),
      });
    })
    .filter((item): item is NewsItem => Boolean(item));
}

export async function fetchMarketHeadlinesLive(params: {
  range: RangeMarket;
  ticker?: string;
  query?: string;
  limit: number;
  traceId: string;
}): Promise<HeadlinesAggregation> {
  const ticker = params.ticker?.trim().toUpperCase() || '';
  const query = params.query || '';
  const effectiveQuery = query.trim() ? query.trim() : ticker ? `${ticker} OR stocks OR equities OR earnings` : 'stocks OR equities OR earnings';
  const requestedDays = rangeDays[params.range] ?? 7;
  const rawLimit = Math.min(Math.max(params.limit * 2, 25), 60);
  const finnhubFetchRange = requestedDays <= 30 ? ('30D' as const) : params.range;

  const providerDefs = [
    { name: 'polygon', fn: () => fetchPolygonNews({ ticker, limit: rawLimit }) },
    { name: 'finnhub', fn: () => fetchFinnhubNews({ ticker, range: finnhubFetchRange, limit: rawLimit }) },
    { name: 'fmp', fn: () => fetchFmpStockNews({ ticker, limit: rawLimit, traceId: params.traceId }) },
    { name: 'webz', fn: () => fetchWebzNews({ query: effectiveQuery, size: rawLimit, traceId: params.traceId }) },
    { name: 'gdelt', fn: () => fetchGdeltNews({ query: effectiveQuery, limit: rawLimit }) },
  ] as const;

  const settled = await Promise.allSettled(providerDefs.map((provider) => runProvider(provider.name, provider.fn)));
  const providers = settled.map((result, idx) => {
    if (result.status === 'fulfilled') return result.value;
    const classified = classifyProviderError(result.reason);
    return {
      name: providerDefs[idx]?.name ?? `provider_${idx}`,
      items: [] as NewsItem[],
      meta: {
        ok: false,
        status: classified.status,
        reason: classified.reason,
        durationMs: 0,
      } satisfies ProviderMeta,
    };
  });

  const diagnostics: ProviderDiagnostics = {};
  const perProviderRaw: Record<string, number> = {};
  let merged: NewsItem[] = [];
  for (const p of providers) {
    diagnostics[p.name] = p.meta;
    perProviderRaw[p.name] = p.items.length;
    merged = merged.concat(p.items);
  }

  const minWanted = Math.min(6, params.limit);
  const widenSequence = ['1D', '3D', '7D', '14D', '30D'] as const;
  const widenStartIndex = widenSequence.findIndex((label) => (rangeDays[label] ?? 0) >= requestedDays);
  const widenCandidates =
    requestedDays <= 30 ? widenSequence.slice(widenStartIndex >= 0 ? widenStartIndex : widenSequence.length - 1) : [params.range];

  const computeDeduped = (window: string) =>
    dedupeNews(filterByRange(merged, window))
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
      .slice(0, params.limit);

  let windowUsed: string = widenCandidates[0] ?? params.range;
  let deduped = computeDeduped(windowUsed);
  for (const candidate of widenCandidates.slice(1)) {
    if (deduped.length >= minWanted) break;
    windowUsed = candidate;
    deduped = computeDeduped(windowUsed);
  }

  if (process.env.NODE_ENV !== 'production') {
    const disabled = Object.entries(diagnostics).filter(([, meta]) => !meta.ok && meta.reason === 'missing_key');
    if (disabled.length) {
      console.warn('[market:headlines] providers_disabled', {
        traceId: params.traceId,
        disabled: disabled.map(([name]) => name),
      });
    }
  }

  const priority = ['polygon', 'finnhub', 'fmp', 'webz', 'gdelt'] as const;
  const primary =
    priority.find((name) => perProviderRaw[name] > 0) ??
    priority.find((name) => diagnostics[name]?.ok) ??
    'fallback';

  return {
    items: deduped,
    source: primary,
    providers: diagnostics,
    counts: {
      rawTotal: Object.values(perProviderRaw).reduce((acc, n) => acc + n, 0),
      postFilterTotal: deduped.length,
      perProviderRaw,
    },
    window: {
      requested: params.range,
      used: windowUsed,
      days: rangeDays[windowUsed] ?? requestedDays,
    },
  };
}

export async function fetchMacroNewsLive(params: {
  range: RangeMacro;
  query: string;
  limit: number;
  traceId: string;
}): Promise<HeadlinesAggregation> {
  const macroFilter = (items: NewsItem[]) => {
    const filtered = items.filter((item) => {
      const haystack = `${item.title} ${item.summary} ${item.topics.join(' ')}`.toLowerCase();
      return macroKeywords.some((word) => haystack.includes(word));
    });
    return filtered.length >= 3 ? filtered : items;
  };

  const databentoProvider = async () => {
    if (!ENV.DATABENTO_NEWS_DATASET) throw notConfigured('databento_news');
    const items = await fetchDatabentoNews({ range: params.range, region: 'global', limit: params.limit });
    const mapped = items
      .map((item) => {
        const sentiment =
          item.sentiment === 'bullish' ? 'pos' : item.sentiment === 'bearish' ? 'neg' : item.sentiment ? 'neu' : undefined;
        return safeParseNewsItem({
          id: item.id,
          title: item.title,
          url: item.url || '',
          source: item.source || 'DataBento',
          publishedAt: item.publishedAt,
          summary: item.summary || '',
          topics: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [],
          tickers: [],
          ...(sentiment ? { sentiment } : {}),
        });
      })
      .filter((row): row is NewsItem => Boolean(row));
    return mapped;
  };

  const providers = await Promise.all([
    runProvider('databento', databentoProvider),
    runProvider('webz', () => fetchWebzNews({ query: params.query, size: params.limit, traceId: params.traceId })),
    runProvider('finnhub', async () => macroFilter(await fetchFinnhubNews({ range: params.range, limit: params.limit }))),
  ]);

  const diagnostics: ProviderDiagnostics = {};
  const perProviderRaw: Record<string, number> = {};
  let merged: NewsItem[] = [];
  for (const p of providers) {
    diagnostics[p.name] = p.meta;
    perProviderRaw[p.name] = p.items.length;
    merged = merged.concat(p.items);
  }

  const filtered = filterByRange(merged, params.range);
  const deduped = dedupeNews(filtered)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, params.limit);

  const priority: Array<'databento' | 'webz' | 'finnhub'> = ['databento', 'webz', 'finnhub'];
  const primary =
    priority.find((name) => perProviderRaw[name] > 0) ??
    priority.find((name) => diagnostics[name]?.ok) ??
    'fallback';

  return {
    items: deduped,
    source: primary,
    providers: diagnostics,
    counts: {
      rawTotal: Object.values(perProviderRaw).reduce((acc, n) => acc + n, 0),
      postFilterTotal: deduped.length,
      perProviderRaw,
    },
    window: {
      requested: params.range,
      used: params.range,
      days: rangeDays[params.range] ?? 7,
    },
  };
}
