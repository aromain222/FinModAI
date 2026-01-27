import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';

import { ENV } from '@/lib/env/server';
import { get as getMemory, set as setMemory } from '@/lib/cache/memory';
import { fetchMarketHeadlinesLive } from '@/lib/news/headlinesPipeline';
import { getMarketSeries } from '@/lib/market/provider';
import { toErrorText } from '@/lib/providers/utils';
import type { NewsItem } from '@/lib/schemas/news';
import { TopStoriesResponseSchema, type TopStory, type TopStoryImpact, type TopStoryWindow } from '@/lib/schemas/topStories';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  range: z.enum(['1D', '1W']).optional().default('1D'),
  limit: z.coerce.number().int().min(1).max(10).optional().default(7),
  ticker: z.string().optional(),
});

const openai = ENV.OPENAI_API_KEY ? new OpenAI({ apiKey: ENV.OPENAI_API_KEY }) : null;

const MAX_HEADLINES_FETCH = 30;
const MAX_AFFECTED = 6;
const MAX_OPENAI_CALLS_PER_REQUEST = 5;

const COMPANY_MAP: Array<{ needle: string; ticker: string; label: string }> = [
  { needle: 'tesla', ticker: 'TSLA', label: 'Tesla' },
  { needle: 'nvidia', ticker: 'NVDA', label: 'Nvidia' },
  { needle: 'microsoft', ticker: 'MSFT', label: 'Microsoft' },
  { needle: 'apple', ticker: 'AAPL', label: 'Apple' },
  { needle: 'amazon', ticker: 'AMZN', label: 'Amazon' },
  { needle: 'meta', ticker: 'META', label: 'Meta' },
  { needle: 'facebook', ticker: 'META', label: 'Meta' },
  { needle: 'alphabet', ticker: 'GOOG', label: 'Alphabet' },
  { needle: 'google', ticker: 'GOOG', label: 'Google' },
  { needle: 'jpmorgan', ticker: 'JPM', label: 'JPMorgan' },
  { needle: 'goldman', ticker: 'GS', label: 'Goldman Sachs' },
  { needle: 'exxon', ticker: 'XOM', label: 'Exxon' },
  { needle: 'chevron', ticker: 'CVX', label: 'Chevron' },
  { needle: 'unitedhealth', ticker: 'UNH', label: 'UnitedHealth' },
  { needle: 'netflix', ticker: 'NFLX', label: 'Netflix' },
  { needle: 'intel', ticker: 'INTC', label: 'Intel' },
  { needle: 'amd', ticker: 'AMD', label: 'AMD' },
  { needle: 'broadcom', ticker: 'AVGO', label: 'Broadcom' },
  { needle: 'boeing', ticker: 'BA', label: 'Boeing' },
  { needle: 'pfizer', ticker: 'PFE', label: 'Pfizer' },
];

const SECTOR_ETFS: Array<{ needles: string[]; ticker: string; label: string }> = [
  { needles: ['technology', 'software', 'chip', 'semiconductor', 'ai'], ticker: 'XLK', label: 'Technology sector' },
  { needles: ['financial', 'bank', 'banks', 'credit'], ticker: 'XLF', label: 'Financials sector' },
  { needles: ['energy', 'oil', 'opec', 'gas'], ticker: 'XLE', label: 'Energy sector' },
  { needles: ['health', 'pharma', 'biotech', 'drug'], ticker: 'XLV', label: 'Healthcare sector' },
  { needles: ['consumer', 'retail', 'spending'], ticker: 'XLY', label: 'Consumer discretionary sector' },
  { needles: ['staples', 'grocery'], ticker: 'XLP', label: 'Consumer staples sector' },
  { needles: ['industrial', 'aerospace', 'defense'], ticker: 'XLI', label: 'Industrials sector' },
  { needles: ['materials', 'mining', 'copper', 'gold'], ticker: 'XLB', label: 'Materials sector' },
  { needles: ['utilities', 'power', 'electric grid'], ticker: 'XLU', label: 'Utilities sector' },
  { needles: ['real estate', 'reit'], ticker: 'XLRE', label: 'Real estate sector' },
  { needles: ['communications', 'streaming', 'media'], ticker: 'XLC', label: 'Communication services sector' },
  { needles: ['semiconductor', 'chips'], ticker: 'SOXX', label: 'Semiconductors ETF' },
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

function uniqAffected(rows: Array<{ ticker: string; reason: string }>) {
  const out: Array<{ ticker: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = typeof row?.ticker === 'string' ? row.ticker : '';
    const ticker = raw.trim().toUpperCase();
    if (!ticker) continue;
    if (ticker.length > 7) continue;
    if (BANNED_TICKERS.has(ticker)) continue;
    if (!/^[A-Z0-9.\-]{1,7}$/.test(ticker)) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    out.push({ ticker, reason: typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : 'Likely exposed via headline context.' });
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

function sourceCredWeight(source: string): number {
  const s = (source || '').toLowerCase();
  if (s.includes('reuters')) return 1.35;
  if (s.includes('bloomberg')) return 1.35;
  if (s.includes('wsj') || s.includes('wall street journal')) return 1.25;
  if (s.includes('financial times') || s.includes('ft.com')) return 1.2;
  if (s.includes('cnbc')) return 1.15;
  if (s.includes('marketwatch')) return 1.1;
  return 1.0;
}

function computeRecencyScore(publishedAtISO: string): number {
  const ts = Date.parse(publishedAtISO);
  if (!Number.isFinite(ts)) return 0;
  const ageHours = Math.max(0, (Date.now() - ts) / (60 * 60 * 1000));
  // 0..1 over 72 hours
  return Math.max(0, 72 - ageHours) / 72;
}

function pctMove(fromClose: number, toClose: number): number | null {
  if (!Number.isFinite(fromClose) || !Number.isFinite(toClose) || !fromClose) return null;
  return ((toClose - fromClose) / fromClose) * 100;
}

type DailyPoint = { t: string; close: number };

function dateKey(iso: string): string {
  return typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : '';
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
  return {
    ymd: `${year}-${month}-${day}`,
    weekday,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
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

function findIndexByDate(points: DailyPoint[], ymd: string): number {
  let idx = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (dateKey(points[i]!.t) <= ymd) idx = i;
    else break;
  }
  return idx;
}

function findPrevIndex(points: DailyPoint[], ymd: string): number {
  let idx = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (dateKey(points[i]!.t) < ymd) idx = i;
    else break;
  }
  return idx;
}

function computeWindowMove(points: DailyPoint[], publishedAt: Date, window: TopStoryWindow) {
  const sorted = [...points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (sorted.length < 2) return { movePct: null as number | null, fromTs: null as string | null, toTs: null as string | null, bucket: '' };
  const { ymd } = toEtParts(publishedAt);
  const session = marketSessionEt(publishedAt);

  const baselineIdx =
    session === 'after_close'
      ? findIndexByDate(sorted, ymd)
      : session === 'in_hours' || session === 'before_open'
      ? findPrevIndex(sorted, ymd)
      : findPrevIndex(sorted, ymd);

  if (baselineIdx < 0) return { movePct: null as number | null, fromTs: null as string | null, toTs: null as string | null, bucket: '' };

  const step = window === '1W' ? 5 : 1;
  const toIdx = Math.min(sorted.length - 1, baselineIdx + step);
  const from = sorted[baselineIdx]!;
  const to = sorted[toIdx]!;
  return {
    movePct: pctMove(from.close, to.close),
    fromTs: from.t,
    toTs: to.t,
    bucket: `${dateKey(from.t)}:${window}`,
  };
}

function inferDeterministicAffected(item: NewsItem): Array<{ ticker: string; reason: string }> {
  const out: Array<{ ticker: string; reason: string }> = [];
  const title = item.title || '';
  const summary = item.summary || '';
  const text = `${title}\n${summary}`.slice(0, 3000);

  const providerTickers = Array.isArray(item.tickers) ? item.tickers : [];
  for (const t of providerTickers) {
    out.push({ ticker: String(t), reason: 'Tagged by source metadata.' });
  }

  const patterns: Array<{ re: RegExp; reason: string }> = [
    { re: /\$([A-Z]{1,5})\b/g, reason: 'Ticker referenced in headline text.' },
    { re: /\(([A-Z]{1,5})\)/g, reason: 'Ticker referenced in headline text.' },
    { re: /\b(?:NYSE|NASDAQ|AMEX):\s*([A-Z]{1,5})\b/g, reason: 'Ticker referenced in headline text.' },
  ];
  for (const { re, reason } of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = re.exec(text)) !== null) {
      const sym = match[1];
      if (sym) out.push({ ticker: sym, reason });
    }
  }

  const lower = text.toLowerCase();
  for (const entry of COMPANY_MAP) {
    if (lower.includes(entry.needle)) {
      out.push({ ticker: entry.ticker, reason: `Company referenced in headline: ${entry.label}.` });
    }
  }

  for (const sector of SECTOR_ETFS) {
    if (sector.needles.some((n) => lower.includes(n))) {
      out.push({ ticker: sector.ticker, reason: `Sector/theme referenced: ${sector.label}.` });
    }
  }

  return uniqAffected(out);
}

async function inferAffectedWithOpenAI(params: {
  title: string;
  summary: string;
  source: string;
  allowSectorEtf: boolean;
}): Promise<Array<{ ticker: string; reason: string }>> {
  if (!openai) return [];

  const schema = z.object({
    affected: z.array(z.object({ ticker: z.string(), reason: z.string() })).max(MAX_AFFECTED + 1),
  });

  try {
    const resp = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      temperature: 0,
      text: {
        format: {
          type: 'json_schema',
          name: 'top_story_affected',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              affected: {
                type: 'array',
                maxItems: MAX_AFFECTED + 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    ticker: { type: 'string' },
                    reason: { type: 'string' },
                  },
                  required: ['ticker', 'reason'],
                },
              },
            },
            required: ['affected'],
          },
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content:
            'Given a market news headline, infer directly affected US-listed tickers. Use only the headline text. Do not invent facts. Reasons must be grounded and be 1 sentence.',
        },
        {
          role: 'user',
          content: [
            `Source: ${params.source || 'Unknown'}`,
            `Title: ${params.title}`,
            `Summary: ${params.summary}`,
            `Return up to ${MAX_AFFECTED} tickers${params.allowSectorEtf ? ' plus at most 1 sector ETF' : ''}.`,
            'Return JSON: {"affected":[{"ticker":"TSLA","reason":"..."}]}',
          ].join('\n'),
        },
      ],
    });
    const parsed = schema.safeParse(JSON.parse(resp.output_text ?? '{}'));
    if (!parsed.success) return [];
    return uniqAffected(parsed.data.affected);
  } catch {
    return [];
  }
}

async function rewriteReasonsWithOpenAI(params: {
  title: string;
  summary: string;
  source: string;
  tickers: string[];
  existing: Array<{ ticker: string; reason: string }>;
}): Promise<{ affected: Array<{ ticker: string; reason: string }> } | null> {
  if (!openai) return null;
  const schema = z.object({
    affected: z.array(z.object({ ticker: z.string(), reason: z.string() })).max(MAX_AFFECTED),
  });
  try {
    const resp = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      temperature: 0,
      text: {
        format: {
          type: 'json_schema',
          name: 'top_story_reasons',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              affected: {
                type: 'array',
                maxItems: MAX_AFFECTED,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    ticker: { type: 'string' },
                    reason: { type: 'string' },
                  },
                  required: ['ticker', 'reason'],
                },
              },
            },
            required: ['affected'],
          },
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content:
            'Rewrite reasons for why each ticker is affected by the headline. Use only the provided headline text. Do not add tickers. Each reason must be 1 sentence and non-hallucinatory.',
        },
        {
          role: 'user',
          content: [
            `Source: ${params.source || 'Unknown'}`,
            `Title: ${params.title}`,
            `Summary: ${params.summary}`,
            `Tickers: ${params.tickers.join(', ') || 'none'}`,
            `Existing reasons: ${JSON.stringify(params.existing)}`,
            'Return JSON: {"affected":[{"ticker":"AAPL","reason":"..."}]}',
          ].join('\n'),
        },
      ],
    });
    const parsed = schema.safeParse(JSON.parse(resp.output_text ?? '{}'));
    if (!parsed.success) return null;
    const normalized = uniqAffected(parsed.data.affected).filter((row) => params.tickers.includes(row.ticker));
    if (!normalized.length) return null;
    return { affected: normalized };
  } catch {
    return null;
  }
}

function classifyImpactFromMoves(params: { maxAbs: number; benchmarkAbs: number }): TopStoryImpact {
  if (params.maxAbs >= 2 && params.maxAbs - params.benchmarkAbs >= 1) return 'high';
  if (params.maxAbs >= 1) return 'med';
  return 'low';
}

function computeStoryScore(params: {
  publishedAt: string;
  source: string;
  impact: TopStoryImpact;
  maxAbsMove: number;
  benchmarkAbsMove: number;
  breadth: number;
}): number {
  const recency = computeRecencyScore(params.publishedAt);
  const cred = sourceCredWeight(params.source);
  const excess = Math.max(0, params.maxAbsMove - params.benchmarkAbsMove);
  const moveScore = Math.min(params.maxAbsMove, 8) / 8;
  const excessScore = Math.min(excess, 6) / 6;
  const breadthScore = Math.min(params.breadth, MAX_AFFECTED) / MAX_AFFECTED;
  const impactBoost = params.impact === 'high' ? 0.25 : params.impact === 'med' ? 0.1 : 0;
  return cred * (1 + recency) * (1 + moveScore + 0.35 * excessScore + 0.15 * breadthScore + impactBoost);
}

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();

  const searchParams = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    ticker: searchParams.get('ticker') ?? undefined,
  });
  const { range, limit, ticker } = parsed.success ? parsed.data : { range: '1D' as const, limit: 7, ticker: '' };

  const warnings: string[] = [];

  const normalizedTicker = typeof ticker === 'string' && ticker.trim() ? ticker.trim().toUpperCase() : '';
  const tickerQuery = normalizedTicker ? `${normalizedTicker} OR ${normalizedTicker}` : '';
  const query = [tickerQuery, 'stocks OR equities OR S&P 500 OR Nasdaq OR earnings OR rates OR inflation']
    .filter(Boolean)
    .join(' OR ');
  const headlines = await fetchMarketHeadlinesLive({
    range: range === '1D' ? '1D' : '1W',
    ticker: normalizedTicker,
    query,
    limit: MAX_HEADLINES_FETCH,
    traceId,
  });

  const anyOk = Object.values(headlines.providers).some((p) => p.ok);
  if (!anyOk) warnings.push('headlines_unavailable');
  if (headlines.items.length === 0) warnings.push(anyOk ? 'headlines_empty' : 'headlines_unavailable');

  let openAiCalls = 0;
  const cacheHits = { tickers: 0, reasons: 0, moves: 0, series: 0 };

  const rawItems = (Array.isArray(headlines.items) ? headlines.items : []).slice(0, MAX_HEADLINES_FETCH);

  // Step 1: infer affected tickers (+ initial reasons)
  const affectedById = new Map<string, Array<{ ticker: string; reason: string }>>();
  for (const item of rawItems) {
    const cacheId = item.url?.trim() ? item.url.trim() : `${item.id}|${item.title}|${item.publishedAt}`;
    const tickKey = `topstories:affected:${hashKey(cacheId)}`;
    const cached = getMemory<{ affected: Array<{ ticker: string; reason: string }> }>(tickKey);
    if (cached?.affected?.length) {
      cacheHits.tickers += 1;
      affectedById.set(item.id, uniqAffected(cached.affected).slice(0, MAX_AFFECTED));
      continue;
    }

    let affected = inferDeterministicAffected(item).slice(0, MAX_AFFECTED);
    if (!affected.length && openai && openAiCalls < MAX_OPENAI_CALLS_PER_REQUEST) {
      openAiCalls += 1;
      const fromAi = await inferAffectedWithOpenAI({
        title: item.title,
        summary: item.summary,
        source: item.source,
        allowSectorEtf: true,
      });
      affected = fromAi.slice(0, MAX_AFFECTED);
    }

    setMemory(tickKey, { affected }, 24 * 60 * 60 * 1000);
    affectedById.set(item.id, affected);
  }

  // Step 2: fetch market series for SPY and unique tickers (1M window for daily proxy around publish date).
  const allTickers = new Set<string>(['SPY']);
  for (const rows of affectedById.values()) {
    rows.forEach((r) => allTickers.add(r.ticker));
  }

  const seriesByTicker = new Map<string, { points: DailyPoint[]; source: string }>();

  for (const ticker of Array.from(allTickers)) {
    const seriesKey = `topstories:series:${ticker}:1M`;
    const cached = getMemory<{ points: DailyPoint[]; source: string }>(seriesKey);
    if (cached?.points?.length) {
      cacheHits.series += 1;
      seriesByTicker.set(ticker, cached);
      continue;
    }

    try {
      const series = await getMarketSeries({ ticker, range: '1M', traceId });
      const points = Array.isArray(series.points) ? series.points.map((p) => ({ t: p.t, close: p.close })) : [];
      const value = { points, source: series.source };
      setMemory(seriesKey, value, 5 * 60 * 1000);
      seriesByTicker.set(ticker, value);
    } catch (error) {
      seriesByTicker.set(ticker, { points: [], source: 'fallback' });
    }
  }

  // Step 3: compute moves and build story rows.
  const storyRows: Array<TopStory & { _debug: { score: number; maxAbs: number; benchAbs: number; breadth: number } }> = [];
  for (const item of rawItems) {
    const publishedAt = safeIso(item.publishedAt);
    const publishedDate = new Date(publishedAt);
    const affectedSeed = affectedById.get(item.id) ?? [];
    const affectedTickers = affectedSeed.slice(0, MAX_AFFECTED).map((a) => a.ticker);

    const spySeries = seriesByTicker.get('SPY') ?? { points: [], source: 'fallback' };
    const benchWindow = computeWindowMove(spySeries.points, publishedDate, range);
    const benchBucketKey = benchWindow.bucket || `${dateKey(publishedAt)}:${range}`;
    const benchMoveKey = `topstories:move:SPY:${benchBucketKey}`;
    const cachedBench = getMemory<{ movePct: number | null; provider: string }>(benchMoveKey);
    let benchMovePct: number | null = null;
    let benchProvider = spySeries.source;
    if (cachedBench) {
      cacheHits.moves += 1;
      benchMovePct = cachedBench.movePct;
      benchProvider = cachedBench.provider;
    } else {
      benchMovePct = benchWindow.movePct;
      benchProvider = spySeries.source;
      setMemory(benchMoveKey, { movePct: benchMovePct, provider: benchProvider }, 10 * 60 * 1000);
    }

    const affected = affectedSeed.slice(0, MAX_AFFECTED).map((row) => {
      const series = seriesByTicker.get(row.ticker) ?? { points: [], source: 'fallback' };
      const moveWindow = computeWindowMove(series.points, publishedDate, range);
      const bucketKey = moveWindow.bucket || `${dateKey(publishedAt)}:${range}`;
      const moveKey = `topstories:move:${row.ticker}:${bucketKey}`;
      const cachedMove = getMemory<{ movePct: number | null; provider: string }>(moveKey);
      let movePct: number | null = null;
      let provider = series.source;
      if (cachedMove) {
        cacheHits.moves += 1;
        movePct = cachedMove.movePct;
        provider = cachedMove.provider;
      } else {
        movePct = moveWindow.movePct;
        provider = series.source;
        setMemory(moveKey, { movePct, provider }, 10 * 60 * 1000);
      }
      return {
        ticker: row.ticker,
        reason: row.reason,
        movePct,
        window: range,
        provider,
      };
    });

    const maxAbs = affected.reduce((acc, a) => (typeof a.movePct === 'number' ? Math.max(acc, Math.abs(a.movePct)) : acc), 0);
    const benchAbs = typeof benchMovePct === 'number' ? Math.abs(benchMovePct) : 0;
    const impact = classifyImpactFromMoves({ maxAbs, benchmarkAbs: benchAbs });
    const breadth = affectedTickers.length;
    const score = computeStoryScore({
      publishedAt,
      source: item.source,
      impact,
      maxAbsMove: maxAbs,
      benchmarkAbsMove: benchAbs,
      breadth,
    });

    const storyWarnings: string[] = [];
    if (breadth === 0) storyWarnings.push('no_affected_tickers');
    if (typeof benchMovePct !== 'number') storyWarnings.push('benchmark_unavailable');
    const anyMove = affected.some((a) => typeof a.movePct === 'number');
    if (!anyMove && breadth > 0) storyWarnings.push('moves_unavailable');
    const anyFallbackPrice = affected.some((a) => a.provider === 'fallback');
    if (anyFallbackPrice) storyWarnings.push('price_fallback');

    storyRows.push({
      id: item.id || `news-${hashKey(item.url || item.title || publishedAt)}`,
      title: item.title || 'Untitled',
      url: item.url || '',
      source: item.source || 'Unknown',
      publishedAt,
      summary: item.summary || '',
      impact,
      affected,
      benchmark: { ticker: 'SPY', movePct: benchMovePct, window: range, provider: benchProvider },
      meta: { sourceUsed: headlines.source, warnings: storyWarnings, debugScore: Number.isFinite(score) ? score : 0 },
      _debug: { score: Number.isFinite(score) ? score : 0, maxAbs, benchAbs, breadth },
    });
  }

  // Step 4: rewrite reasons (LLM) for best-ranked candidates (best-effort).
  storyRows.sort((a, b) => (b._debug.score ?? 0) - (a._debug.score ?? 0));
  const toRewrite = openai ? storyRows.slice(0, Math.min(limit, MAX_OPENAI_CALLS_PER_REQUEST)) : [];

  for (const story of toRewrite) {
    if (!story.url && !story.id) continue;
    if (!story.affected.length) continue;
    if (openAiCalls >= MAX_OPENAI_CALLS_PER_REQUEST) break;

    const cacheId = story.url?.trim() ? story.url.trim() : `${story.id}|${story.title}|${story.publishedAt}`;
    const reasonsKey = `topstories:reasons:${hashKey(cacheId)}:${hashKey(story.affected.map((a) => a.ticker).join(','))}`;
    const cached = getMemory<{ affected: Array<{ ticker: string; reason: string }> }>(reasonsKey);
    if (cached?.affected?.length) {
      cacheHits.reasons += 1;
      const byTicker = new Map(cached.affected.map((r) => [r.ticker, r.reason]));
      story.affected = story.affected.map((a) => ({ ...a, reason: byTicker.get(a.ticker) || a.reason }));
      continue;
    }

    openAiCalls += 1;
    const rewritten = await rewriteReasonsWithOpenAI({
      title: story.title,
      summary: story.summary,
      source: story.source,
      tickers: story.affected.map((a) => a.ticker),
      existing: story.affected.map((a) => ({ ticker: a.ticker, reason: a.reason })),
    });
    if (!rewritten?.affected?.length) continue;

    const byTicker = new Map(rewritten.affected.map((r) => [r.ticker, r.reason]));
    story.affected = story.affected.map((a) => ({ ...a, reason: byTicker.get(a.ticker) || a.reason }));
    setMemory(reasonsKey, { affected: rewritten.affected }, 24 * 60 * 60 * 1000);
  }

  // Final: take top N and strip debug.
  const items = storyRows.slice(0, limit).map((story) => {
    const { _debug, ...rest } = story as any;
    return rest as TopStory;
  });

  const updatedAt = items.length ? items[0]!.publishedAt : new Date().toISOString();
  const response = {
    ok: true,
    source: headlines.source,
    updatedAt,
    range,
    items,
    warnings: Array.from(new Set(warnings)),
    meta: {
      traceId,
      fetchedAt: new Date().toISOString(),
      providers: headlines.providers,
      counts: headlines.counts,
      cacheHits,
      openAiCalls,
      latencyMs: Date.now() - startedAt,
    },
  };

  const safe = TopStoriesResponseSchema.safeParse(response);
  if (!safe.success) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[market:top-stories] response schema mismatch', { traceId, error: safe.error.message });
    }
    return NextResponse.json(response);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[market:top-stories]', {
      sourceUsed: headlines.source,
      range,
      limit,
      items: items.length,
      cacheHits,
      openAiCalls,
      providersTried: Object.keys(headlines.providers),
      providerFailures: Object.entries(headlines.providers)
        .filter(([, p]) => !p.ok)
        .map(([name, p]) => `${name}${p.status ? `:${p.status}` : ''}${p.reason ? `:${p.reason}` : ''}`),
      durationMs: Date.now() - startedAt,
      traceId,
    });
  }

  return NextResponse.json(response);
}
