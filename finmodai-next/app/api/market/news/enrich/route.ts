import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';

import { ENV } from '@/lib/env/server';
import { get, set } from '@/lib/cache/memory';
import { fetchMarketHeadlinesLive, type ProviderDiagnostics, type ProviderMeta } from '@/lib/news/headlinesPipeline';
import { fetchStooqDailyCSV } from '@/lib/providers/market/stooq';
import { fetchWithTimeout, toErrorText } from '@/lib/providers/utils';
import type { NewsItem } from '@/lib/schemas/news';
import type { EnrichedNewsItem, NewsImpact, NewsImpactMove } from '@/lib/schemas/newsEnriched';

export const runtime = 'nodejs';

type Range = '1D' | '1W' | '1M' | '1Y' | '5Y';
type Region = 'global' | 'us' | 'europe' | 'asia';

const QuerySchema = z.object({
  range: z.enum(['1D', '1W', '1M', '1Y', '5Y']).optional().default('1W'),
  region: z.enum(['global', 'us', 'europe', 'asia']).optional().default('global'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  ticker: z.string().optional(),
});

const openai = ENV.OPENAI_API_KEY ? new OpenAI({ apiKey: ENV.OPENAI_API_KEY }) : null;

const rangeDays: Record<Range, number> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '1Y': 365,
  '5Y': 365 * 5,
};

const MAX_TICKERS_PER_STORY = 8;
const MAX_UNIQUE_TICKERS_FOR_REACTIONS = 40;
const MAX_OPENAI_TICKER_CALLS_PER_REQUEST = 6;

const COMPANY_MAP: Array<{ needle: string; ticker: string }> = [
  { needle: 'tesla', ticker: 'TSLA' },
  { needle: 'nvidia', ticker: 'NVDA' },
  { needle: 'microsoft', ticker: 'MSFT' },
  { needle: 'apple', ticker: 'AAPL' },
  { needle: 'amazon', ticker: 'AMZN' },
  { needle: 'meta', ticker: 'META' },
  { needle: 'facebook', ticker: 'META' },
  { needle: 'alphabet', ticker: 'GOOG' },
  { needle: 'google', ticker: 'GOOG' },
  { needle: 'berkshire', ticker: 'BRK.B' },
  { needle: 'jpmorgan', ticker: 'JPM' },
  { needle: 'goldman', ticker: 'GS' },
  { needle: 'exxon', ticker: 'XOM' },
  { needle: 'chevron', ticker: 'CVX' },
  { needle: 'unitedhealth', ticker: 'UNH' },
  { needle: 'walmart', ticker: 'WMT' },
  { needle: 'coca-cola', ticker: 'KO' },
  { needle: 'netflix', ticker: 'NFLX' },
  { needle: 'intel', ticker: 'INTC' },
  { needle: 'amd', ticker: 'AMD' },
  { needle: 'broadcom', ticker: 'AVGO' },
];

const BANNED_TICKERS = new Set([
  'US',
  'USA',
  'EU',
  'UK',
  'ETF',
  'ETFS',
  'AI',
  'IPO',
  'GDP',
  'CPI',
  'FED',
  'FOMC',
  'ECB',
  'BOJ',
  'SEC',
  'DOJ',
  'FTC',
  'OPEC',
  'IMF',
  'UN',
  'NATO',
  'UAE',
  'COVID',
]);

function uniqUpperTickers(input: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) continue;
    if (trimmed.length > 7) continue;
    if (BANNED_TICKERS.has(trimmed)) continue;
    if (!/^[A-Z0-9.\-]{1,7}$/.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function hashKey(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

function safeIso(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function latestPublishedAt(items: Array<{ publishedAt: string }>): string {
  let latest = 0;
  for (const item of items) {
    const ts = Date.parse(item.publishedAt);
    if (Number.isFinite(ts)) latest = Math.max(latest, ts);
  }
  return latest ? new Date(latest).toISOString() : new Date().toISOString();
}

function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, idx: number) => Promise<R>) {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = new Array(safeConcurrency).fill(0).map(async () => {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= items.length) break;
      results[idx] = await mapper(items[idx], idx);
    }
  });
  return Promise.all(workers).then(() => results);
}

function extractTickersDeterministic(text: string): string[] {
  const tickers: string[] = [];

  const patterns: RegExp[] = [
    /\$([A-Z]{1,5})\b/g,
    /\(([A-Z]{1,5})\)/g,
    /\b(?:NYSE|NASDAQ|AMEX):\s*([A-Z]{1,5})\b/g,
  ];

  for (const re of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = re.exec(text)) !== null) {
      const symbol = match[1];
      if (symbol) tickers.push(symbol);
    }
  }

  const lower = text.toLowerCase();
  for (const entry of COMPANY_MAP) {
    if (lower.includes(entry.needle)) tickers.push(entry.ticker);
  }

  return uniqUpperTickers(tickers);
}

async function extractTickersWithOpenAI(params: {
  title: string;
  summary: string;
}): Promise<string[]> {
  if (!openai) return [];
  const schema = z.object({ tickers: z.array(z.string()).max(MAX_TICKERS_PER_STORY) });
  try {
    const resp = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      temperature: 0,
      text: {
        format: {
          type: 'json_schema',
          name: 'impacted_tickers',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tickers: { type: 'array', items: { type: 'string' }, maxItems: MAX_TICKERS_PER_STORY },
            },
            required: ['tickers'],
          },
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content:
            'Given a headline and summary, return up to 8 directly impacted US-listed tickers. Output JSON only.',
        },
        { role: 'user', content: `Title: ${params.title}\nSummary: ${params.summary}\n\nReturn: {"tickers":[...]}` },
      ],
    });
    const parsed = schema.safeParse(JSON.parse(resp.output_text ?? '{}'));
    if (!parsed.success) return [];
    return uniqUpperTickers(parsed.data.tickers).slice(0, MAX_TICKERS_PER_STORY);
  } catch {
    return [];
  }
}

async function fetchGdeltAsNews(params: { query: string; limit: number }) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
    params.query
  )}&mode=artlist&maxrecords=${params.limit}&format=json&sort=datedesc`;

  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'CapitalBase/1.0' }, cache: 'no-store' }, 2500);
  if (!res.ok) return [] as NewsItem[];
  const json = await res.json().catch(() => null);
  const articles = Array.isArray((json as any)?.articles) ? (json as any).articles : [];
  return articles.slice(0, params.limit).map((article: any, idx: number) => {
    const title = typeof article?.title === 'string' ? article.title : 'Untitled';
    const urlStr = typeof article?.url === 'string' ? article.url : '';
    const source = typeof article?.domain === 'string' ? article.domain : typeof article?.source === 'string' ? article.source : 'GDELT';
    const publishedAt = article?.seendate ? safeIso(article.seendate) : new Date().toISOString();
    const summary = typeof article?.summary === 'string' ? article.summary : '';
    const id = urlStr ? `gdelt-${hashKey(urlStr)}` : `gdelt-${idx}-${publishedAt}`;
    return {
      id,
      title,
      url: urlStr,
      source,
      publishedAt,
      summary,
      topics: [],
      tickers: [],
    };
  });
}

type StooqPoint = { t: string; close: number };

async function getStooqDailyCached(params: { symbol: string; traceId: string }) {
  const cacheKey = `stooq:daily:${params.symbol.toUpperCase()}`;
  const cached = get<StooqPoint[]>(cacheKey);
  if (cached) return { points: cached, cacheHit: true, error: null as string | null };
  try {
    const points = await fetchStooqDailyCSV(params.symbol, params.traceId, 3000);
    set(cacheKey, points, 10 * 60 * 1000);
    return { points, cacheHit: false, error: null as string | null };
  } catch (error) {
    return { points: [] as StooqPoint[], cacheHit: false, error: toErrorText(error) };
  }
}

function toEtParts(date: Date): { ymd: string; weekday: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const month = lookup('month');
  const day = lookup('day');
  const year = lookup('year');
  const weekday = lookup('weekday');
  const hour = Number(lookup('hour'));
  const minute = Number(lookup('minute'));
  return { ymd: `${year}-${month}-${day}`, weekday, hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 };
}

function marketSessionEt(date: Date): 'in_hours' | 'before_open' | 'after_close' | 'closed' {
  const { weekday, hour, minute } = toEtParts(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayNum = map[weekday] ?? 1;
  if (dayNum === 0 || dayNum === 6) return 'closed';
  const mins = hour * 60 + minute;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  if (mins < open) return 'before_open';
  if (mins >= close) return 'after_close';
  return 'in_hours';
}

function dateKey(iso: string): string {
  return typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : '';
}

function findIndexByDate(points: StooqPoint[], ymd: string): number {
  // points are sorted ascending; we do a linear scan since arrays are small-ish for our usage
  let idx = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (dateKey(points[i]!.t) <= ymd) idx = i;
    else break;
  }
  return idx;
}

function findPrevIndex(points: StooqPoint[], ymd: string): number {
  let idx = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (dateKey(points[i]!.t) < ymd) idx = i;
    else break;
  }
  return idx;
}

function pickWindowFromSpy(spy: StooqPoint[], publishedAt: Date, window: '1D') {
  const { ymd } = toEtParts(publishedAt);
  const session = marketSessionEt(publishedAt);
  const baselineIdx =
    session === 'in_hours' || session === 'before_open'
      ? findPrevIndex(spy, ymd)
      : findIndexByDate(spy, ymd);
  const from = baselineIdx >= 0 ? spy[baselineIdx] : null;
  const to = baselineIdx >= 0 && baselineIdx + 1 < spy.length ? spy[baselineIdx + 1] : null;

  const label =
    session === 'in_hours' || session === 'before_open'
      ? 'Prev close → close after headline (daily proxy)'
      : session === 'after_close'
      ? 'Close → next close (daily proxy)'
      : 'Prev close → next close (daily proxy)';

  return { from, to, label, session, ymd, window };
}

function pctMove(fromClose: number, toClose: number): number | null {
  if (!Number.isFinite(fromClose) || !Number.isFinite(toClose) || !fromClose) return null;
  return ((toClose - fromClose) / fromClose) * 100;
}

function sourceWeight(source: string): number {
  const s = source.toLowerCase();
  if (s.includes('reuters')) return 1.35;
  if (s.includes('bloomberg')) return 1.35;
  if (s.includes('wsj') || s.includes('wall street journal')) return 1.25;
  if (s.includes('financial times') || s.includes('ft.com')) return 1.2;
  if (s.includes('cnbc')) return 1.15;
  if (s.includes('marketwatch')) return 1.1;
  return 1.0;
}

function computeRankScore(params: {
  publishedAt: string;
  source: string;
  tickersCount: number;
  maxAbsMove: number;
}): number {
  const ts = Date.parse(params.publishedAt);
  const ageHours = Number.isFinite(ts) ? Math.max(0, (Date.now() - ts) / (60 * 60 * 1000)) : 24;
  const recencyScore = Math.max(0, 72 - ageHours) / 72; // 0..1 over 72h
  const breadthScore = Math.min(params.tickersCount, 6) * 0.05; // 0..0.30
  const moveScore = Math.min(params.maxAbsMove, 8) / 8; // 0..1, cap at 8%
  const w = sourceWeight(params.source);
  return w * (1 + recencyScore) * (1 + breadthScore) * (1 + moveScore);
}

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();

  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    region: searchParams.get('region') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    ticker: searchParams.get('ticker') ?? undefined,
  });

  const { range, region, limit, ticker } = parsed.success
    ? parsed.data
    : ({ range: '1W', region: 'global', limit: 20, ticker: undefined } as const);

  const warnings: string[] = [];
  const cacheHits = { tickers: 0, reactions: 0, stooqSeries: 0 };
  const providerFallbacks: string[] = [];
  let openAiCalls = 0;

  const baseQuery = 'stocks OR equities OR S&P 500 OR Nasdaq OR rates OR inflation OR earnings';
  const tickerQuery = ticker ? `${ticker.toUpperCase()} OR ${ticker.toUpperCase()}` : '';
  const query = [tickerQuery, baseQuery].filter(Boolean).join(' OR ');

  let headlines = await fetchMarketHeadlinesLive({
    range,
    ticker: ticker?.trim().toUpperCase() || '',
    query,
    limit,
    traceId,
  });

  // If no provider is available (missing keys / outages), fall back to free GDELT.
  const anyOkPrimary = Object.values(headlines.providers).some((p) => p.ok);
  if (!anyOkPrimary && headlines.items.length === 0) {
    const gdeltStarted = Date.now();
    try {
      const gdeltItems = await fetchGdeltAsNews({ query, limit });
      const durationMs = Date.now() - gdeltStarted;
      const providers: ProviderDiagnostics = { ...headlines.providers };
      providers.gdelt = { ok: true, status: 200, reason: gdeltItems.length ? 'ok' : 'empty', durationMs } satisfies ProviderMeta;
      headlines = {
        items: gdeltItems,
        source: gdeltItems.length ? 'gdelt' : 'fallback',
        providers,
        counts: {
          rawTotal: gdeltItems.length,
          postFilterTotal: gdeltItems.length,
          perProviderRaw: { ...(headlines.counts?.perProviderRaw || {}), gdelt: gdeltItems.length },
        },
      };
      if (gdeltItems.length === 0) warnings.push('headlines_unavailable');
    } catch (error) {
      const durationMs = Date.now() - gdeltStarted;
      const providers: ProviderDiagnostics = { ...headlines.providers };
      providers.gdelt = { ok: false, status: undefined, reason: 'error', durationMs } satisfies ProviderMeta;
      headlines = { ...headlines, providers };
      warnings.push('headlines_unavailable');
    }
  }

  const providers = headlines.providers;
  for (const [name, meta] of Object.entries(providers)) {
    if (!meta.ok && meta.reason !== 'missing_key') providerFallbacks.push(`${name}:${meta.reason || 'error'}`);
  }

  const rawItems = Array.isArray(headlines.items) ? headlines.items : [];
  const itemsLimited = rawItems.slice(0, limit);
  if (itemsLimited.length === 0) {
    const anyOk = Object.values(providers).some((p) => p.ok);
    warnings.push(anyOk ? 'headlines_empty' : 'headlines_unavailable');
  }

  // Ticker extraction (provider → deterministic → OpenAI fallback).
  const tickersById = new Map<string, string[]>();
  await mapWithConcurrency(itemsLimited, 4, async (item) => {
    const cacheId = item.url?.trim() ? item.url.trim() : `${item.id}|${item.title}|${item.publishedAt}`;
    const key = `news:tickers:${hashKey(cacheId)}`;
    const cached = get<{ tickers: string[] }>(key);
    if (cached?.tickers?.length) {
      cacheHits.tickers += 1;
      tickersById.set(item.id, uniqUpperTickers(cached.tickers).slice(0, MAX_TICKERS_PER_STORY));
      return;
    }

    const providerTickers = Array.isArray(item.tickers) ? uniqUpperTickers(item.tickers) : [];
    const deterministic = providerTickers.length
      ? providerTickers
      : extractTickersDeterministic(`${item.title}\n${item.summary}`.slice(0, 2000));

    let tickers = deterministic.slice(0, MAX_TICKERS_PER_STORY);

    if (!tickers.length && openai && openAiCalls < MAX_OPENAI_TICKER_CALLS_PER_REQUEST) {
      openAiCalls += 1;
      const fromAi = await extractTickersWithOpenAI({
        title: item.title,
        summary: item.summary,
      });
      tickers = fromAi.slice(0, MAX_TICKERS_PER_STORY);
    }

    set(key, { tickers }, 24 * 60 * 60 * 1000);
    tickersById.set(item.id, tickers);
  });

  // Market reaction via Stooq daily (close-to-close proxy).
  const spyDaily = await getStooqDailyCached({ symbol: 'SPY', traceId });
  if (spyDaily.cacheHit) cacheHits.stooqSeries += 1;
  if (spyDaily.error) warnings.push('benchmark_unavailable');

  const uniqueTickers: string[] = [];
  const seenTickers = new Set<string>();
  for (const item of itemsLimited) {
    const tickers = tickersById.get(item.id) ?? [];
    for (const t of tickers) {
      if (seenTickers.has(t)) continue;
      seenTickers.add(t);
      uniqueTickers.push(t);
      if (uniqueTickers.length >= MAX_UNIQUE_TICKERS_FOR_REACTIONS) break;
    }
    if (uniqueTickers.length >= MAX_UNIQUE_TICKERS_FOR_REACTIONS) break;
  }
  if (seenTickers.size > uniqueTickers.length) warnings.push('ticker_limit_applied');

  const seriesBySymbol = new Map<string, StooqPoint[]>();
  await mapWithConcurrency(uniqueTickers, 6, async (symbol) => {
    const series = await getStooqDailyCached({ symbol, traceId });
    if (series.cacheHit) cacheHits.stooqSeries += 1;
    seriesBySymbol.set(symbol, series.points);
  });
  seriesBySymbol.set('SPY', spyDaily.points);

  const windowLabel: NewsImpact['window'] = '1D';
  const benchmarkSymbol: NewsImpact['benchmarkSymbol'] = 'SPY';

  const enriched: EnrichedNewsItem[] = itemsLimited.map((item) => {
    const publishedAt = safeIso(item.publishedAt);
    const tickers = tickersById.get(item.id) ?? [];

    const publishedDate = new Date(publishedAt);
    const window = pickWindowFromSpy(seriesBySymbol.get('SPY') ?? [], publishedDate, '1D');

    const fromTs = window.from?.t ?? null;
    const toTs = window.to?.t ?? null;
    const benchmarkPct =
      window.from && window.to ? pctMove(window.from.close, window.to.close) : null;

    const moves: NewsImpactMove[] = [];
    for (const symbol of tickers) {
      const reactionKey = fromTs ? `news:reaction:${symbol}:${fromTs}:${windowLabel}` : '';
      const cachedReaction = reactionKey ? get<NewsImpactMove>(reactionKey) : null;
      if (cachedReaction) {
        cacheHits.reactions += 1;
        moves.push(cachedReaction);
        continue;
      }

      const points = seriesBySymbol.get(symbol) ?? [];
      if (!fromTs || !toTs) {
        const move: NewsImpactMove = { symbol, pct: null, fromTs, toTs };
        moves.push(move);
        if (reactionKey) set(reactionKey, move, 10 * 60 * 1000);
        continue;
      }

      const fromDate = dateKey(fromTs);
      const toDate = dateKey(toTs);
      const fromPoint = points.find((p) => dateKey(p.t) === fromDate) ?? null;
      const toPoint = points.find((p) => dateKey(p.t) === toDate) ?? null;
      const pct = fromPoint && toPoint ? pctMove(fromPoint.close, toPoint.close) : null;
      const move: NewsImpactMove = { symbol, pct, fromTs, toTs };
      moves.push(move);
      set(reactionKey, move, 10 * 60 * 1000);
    }

    const maxAbsMove = moves.reduce((acc, m) => {
      const v = typeof m.pct === 'number' ? Math.abs(m.pct) : 0;
      return Math.max(acc, v);
    }, 0);

    const impact: NewsImpact = {
      baseline: {
        method: 'daily_close',
        label: window.label,
        fromTs,
        toTs,
      },
      window: windowLabel,
      benchmarkSymbol,
      benchmarkPct,
      moves,
    };

    return {
      ...item,
      publishedAt,
      tickers,
      impact,
      rankScore: computeRankScore({
        publishedAt,
        source: item.source,
        tickersCount: tickers.length,
        maxAbsMove,
      }),
    };
  });

  enriched.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));

  const anyOk = Object.values(providers).some((p) => p.ok);
  const source = enriched.length ? headlines.source : anyOk ? headlines.source : 'fallback';
  const updatedAt = enriched.length ? latestPublishedAt(enriched) : new Date().toISOString();

  if (process.env.NODE_ENV !== 'production') {
    console.log('[news:enrich]', {
      sourceUsed: source,
      itemsEnriched: enriched.length,
      cacheHits,
      providerFallbacks,
      openAiCalls,
      durationMs: Date.now() - startedAt,
      traceId,
    });
  }

  return NextResponse.json({
    ok: true,
    source,
    updatedAt,
    range,
    region,
    items: enriched,
    warnings: Array.from(new Set(warnings)),
    meta: {
      traceId,
      fetchedAt: new Date().toISOString(),
      providers,
      counts: headlines.counts,
      cacheHits,
      providerFallbacks,
      openAiCalls,
      latencyMs: Date.now() - startedAt,
    },
  });
}
