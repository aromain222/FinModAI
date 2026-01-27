import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';

import { ENV } from '@/lib/env/server';
import { getCache, setCache, get as getMemory, set as setMemory } from '@/lib/cache/memory';
import { fetchMarketHeadlinesLive } from '@/lib/news/headlinesPipeline';
import { toErrorText } from '@/lib/providers/utils';
import { selectTopStories } from '@/lib/market/topStories';
import { getReaction } from '@/lib/market/reaction';
import { NewsItemSchema, type NewsItem } from '@/lib/schemas/news';

export const runtime = 'nodejs';
const isDev = process.env.NODE_ENV !== 'production';

const QuerySchema = z.object({
  range: z.enum(['1D', '1W', '1M']).optional().default('1W'),
  ticker: z.string().optional().default('SPY'),
  mode: z.enum(['top', 'all']).optional().default('top'),
  limit: z.coerce.number().int().min(5).max(50).optional().default(20),
  force: z.coerce.number().int().optional().default(0),
});

const openai = ENV.OPENAI_API_KEY ? new OpenAI({ apiKey: ENV.OPENAI_API_KEY }) : null;

const MAX_AFFECTED = 6;
const MAX_OPENAI_CALLS = 5;
const TOP_LIMIT = 7;
const ENRICH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_GOOD_TTL_MS = 24 * 60 * 60 * 1000;

const SECTOR_TAGS = [
  'Technology',
  'Financials',
  'Energy',
  'Health Care',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Materials',
  'Utilities',
  'Real Estate',
  'Communication Services',
  'Macro',
] as const;

const SECTOR_ETFS = [
  'XLK',
  'XLF',
  'XLE',
  'XLV',
  'XLY',
  'XLP',
  'XLI',
  'XLB',
  'XLU',
  'XLRE',
  'XLC',
] as const;

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
]);

function hashKey(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

function uniqTickers(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const t = (entry || '').trim().toUpperCase();
    if (!t) continue;
    if (t.length > 7) continue;
    if (BANNED_TICKERS.has(t)) continue;
    if (!/^[A-Z0-9.\-]{1,7}$/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function inferDeterministicAffected(item: NewsItem): Array<{ ticker: string; reason: string }> {
  const out: Array<{ ticker: string; reason: string }> = [];
  const title = item.title || '';
  const summary = item.summary || '';
  const text = `${title}\n${summary}`.slice(0, 3000);

  const providerTickers = Array.isArray(item.tickers) ? item.tickers : [];
  for (const t of providerTickers) out.push({ ticker: String(t), reason: 'Tagged by source metadata.' });

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
  const companyMap: Array<{ needle: string; ticker: string; label: string }> = [
    { needle: 'tesla', ticker: 'TSLA', label: 'Tesla' },
    { needle: 'nvidia', ticker: 'NVDA', label: 'Nvidia' },
    { needle: 'microsoft', ticker: 'MSFT', label: 'Microsoft' },
    { needle: 'apple', ticker: 'AAPL', label: 'Apple' },
    { needle: 'amazon', ticker: 'AMZN', label: 'Amazon' },
    { needle: 'meta', ticker: 'META', label: 'Meta' },
    { needle: 'alphabet', ticker: 'GOOG', label: 'Alphabet' },
    { needle: 'google', ticker: 'GOOG', label: 'Google' },
    { needle: 'jpmorgan', ticker: 'JPM', label: 'JPMorgan' },
    { needle: 'exxon', ticker: 'XOM', label: 'Exxon' },
    { needle: 'chevron', ticker: 'CVX', label: 'Chevron' },
  ];
  for (const entry of companyMap) {
    if (lower.includes(entry.needle)) out.push({ ticker: entry.ticker, reason: `Company referenced: ${entry.label}.` });
  }

  const sectorEtfs: Array<{ needles: string[]; ticker: string; label: string }> = [
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
  ];
  for (const sector of sectorEtfs) {
    if (sector.needles.some((n) => lower.includes(n))) out.push({ ticker: sector.ticker, reason: `Sector/theme exposure: ${sector.label}.` });
  }

  const unique = uniqTickers(out.map((r) => r.ticker));
  const byTicker = new Map<string, string>();
  out.forEach((r) => {
    const t = r.ticker.trim().toUpperCase();
    if (t && !byTicker.has(t)) byTicker.set(t, r.reason);
  });

  return unique.slice(0, MAX_AFFECTED).map((ticker) => ({ ticker, reason: byTicker.get(ticker) || 'Affected via headline context.' }));
}

const formatOpenAiError = (error: any) => {
  const status = typeof error?.status === 'number' ? error.status : undefined;
  const code = typeof error?.code === 'string' ? error.code : typeof error?.error?.code === 'string' ? error.error.code : undefined;
  const message = error?.message || 'openai_error';
  return { status, code, message };
};

function inferSectorTags(item: NewsItem): string[] {
  const title = item.title || '';
  const summary = item.summary || '';
  const text = `${title} ${summary}`.toLowerCase();

  const tags: string[] = [];
  const push = (tag: (typeof SECTOR_TAGS)[number]) => {
    if (!tags.includes(tag)) tags.push(tag);
  };

  if (text.includes('fed') || text.includes('rates') || text.includes('treasury') || text.includes('inflation') || text.includes('cpi')) push('Macro');
  if (text.includes('bank') || text.includes('credit') || text.includes('financial')) push('Financials');
  if (text.includes('oil') || text.includes('opec') || text.includes('energy') || text.includes('gas')) push('Energy');
  if (text.includes('chip') || text.includes('semiconductor') || text.includes('software') || text.includes('ai')) push('Technology');
  if (text.includes('pharma') || text.includes('drug') || text.includes('biotech') || text.includes('health')) push('Health Care');
  if (text.includes('retail') || text.includes('consumer') || text.includes('spending')) push('Consumer Discretionary');
  if (text.includes('grocery') || text.includes('staples')) push('Consumer Staples');
  if (text.includes('industrial') || text.includes('defense') || text.includes('aerospace')) push('Industrials');
  if (text.includes('materials') || text.includes('mining') || text.includes('copper')) push('Materials');
  if (text.includes('utilities') || text.includes('power') || text.includes('electric')) push('Utilities');
  if (text.includes('reit') || text.includes('real estate')) push('Real Estate');
  if (text.includes('media') || text.includes('streaming') || text.includes('telecom')) push('Communication Services');

  return tags.slice(0, 3);
}

type Enrichment = {
  affectedTickers: string[];
  sectorTags: string[];
  impactDirection: 'up' | 'down' | 'unclear';
  whyItMatters: string;
  confidence: number;
};

type ReactionSummary = {
  benchmark: { symbol: 'SPY'; pctChange: number | null };
  tickers: Array<{ symbol: string; pctChange: number | null; deltaVsSpy: number | null }>;
};

type EnrichedTopStory = NewsItem & { enrichment?: Enrichment; reaction?: ReactionSummary };

async function enrichWithOpenAI(params: {
  title: string;
  summary: string;
  source: string;
  candidates: string[];
  candidateEtfs: string[];
}): Promise<{
  affectedTickers: string[];
  sectorTags: string[];
  impactDirection: 'up' | 'down' | 'unclear';
  whyItMatters: string;
  confidence: number;
} | null> {
  if (!openai) return null;

  const schema = z.object({
    affectedTickers: z.array(z.string()).max(MAX_AFFECTED),
    sectorTags: z.array(z.string()).max(3),
    impactDirection: z.enum(['up', 'down', 'unclear']),
    whyItMatters: z.string().min(1).max(220),
    confidence: z.number().int().min(0).max(100),
  });

  const resp = await openai.responses.create({
    model: ENV.OPENAI_MODEL,
    temperature: 0,
    text: {
      format: {
        type: 'json_schema',
        name: 'headline_enrichment',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            affectedTickers: { type: 'array', maxItems: MAX_AFFECTED, items: { type: 'string' } },
            sectorTags: { type: 'array', maxItems: 3, items: { type: 'string' } },
            impactDirection: { type: 'string', enum: ['up', 'down', 'unclear'] },
            whyItMatters: { type: 'string' },
            confidence: { type: 'integer', minimum: 0, maximum: 100 },
          },
          required: ['affectedTickers', 'sectorTags', 'impactDirection', 'whyItMatters', 'confidence'],
        },
        strict: true,
      },
    },
    input: [
      {
        role: 'system',
        content: [
          'You label affected public tickers for a market headline.',
          'Do not invent tickers: ONLY choose from the provided candidate list.',
          'If the story is broad macro/politics, prefer sector ETFs over random single names.',
          'Keep whyItMatters to 1–2 short sentences, grounded in the headline text.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Source: ${params.source || 'Unknown'}`,
          `Title: ${params.title}`,
          `Summary: ${params.summary}`,
          `Candidate tickers: ${params.candidates.join(', ') || 'none'}`,
          `Sector ETFs: ${params.candidateEtfs.join(', ') || 'none'}`,
          `Allowed sector tags: ${SECTOR_TAGS.join(', ')}`,
          'Return JSON per schema.',
        ].join('\n'),
      },
    ],
  });

  const parsedJson = JSON.parse(resp.output_text ?? '{}');
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) return null;

  const allow = new Set(params.candidates.map((t) => t.toUpperCase()));
  const allowEtf = new Set(params.candidateEtfs.map((t) => t.toUpperCase()));
  const affected = uniqTickers(parsed.data.affectedTickers).filter((t) => allow.has(t) || allowEtf.has(t)).slice(0, MAX_AFFECTED);
  const sectorTags = parsed.data.sectorTags.filter((t) => typeof t === 'string' && (SECTOR_TAGS as readonly string[]).includes(t)).slice(0, 3);

  return {
    affectedTickers: affected,
    sectorTags,
    impactDirection: parsed.data.impactDirection,
    whyItMatters: parsed.data.whyItMatters.trim().slice(0, 220),
    confidence: parsed.data.confidence,
  };
}

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();
  const searchParams = request.nextUrl.searchParams;

  const parsed = QuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    ticker: searchParams.get('ticker') ?? undefined,
    mode: searchParams.get('mode') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    force: searchParams.get('force') ?? undefined,
  });

  const range = parsed.success ? parsed.data.range : '1W';
  const mode = parsed.success ? parsed.data.mode : 'top';
  const ticker = parsed.success ? (parsed.data.ticker || 'SPY').trim().toUpperCase() : 'SPY';
  const limit = parsed.success ? parsed.data.limit : 20;
  const force = parsed.success ? Boolean(parsed.data.force) : false;

  const baseQuery = 'stocks OR equities OR S&P 500 OR Nasdaq OR earnings OR guidance';
  const tickerQuery = ticker ? `${ticker} OR ${ticker.toUpperCase()}` : '';
  const query = [tickerQuery, baseQuery].filter(Boolean).join(' OR ');

  const cacheKey = `news:market:enriched:${mode}:${range}:${ticker}:${limit}`;
  const lastGoodKey = `${cacheKey}:last_good`;
  const ttlMs = 5 * 60 * 1000;
  const cached = !force ? getCache<any>(cacheKey) : null;
  const hasTopStories = (value: any) => Array.isArray(value?.data?.topStories) && value.data.topStories.length > 0;

  if (cached && !cached.stale && hasTopStories(cached.value)) {
    return NextResponse.json({
      ...cached.value,
      meta: {
        ...(cached.value.meta ?? {}),
        traceId,
        fetchedAt: new Date().toISOString(),
        stale: false,
      },
    });
  }

  let openAiCalls = 0;
  let openAiCached = 0;
  const warnings: string[] = [];
  const aiErrors: Array<{ status?: number; code?: string; message: string }> = [];
  if (!openai && isDev) {
    aiErrors.push({ code: 'missing_api_key', message: 'OpenAI API key not configured' });
  }

  try {
    const headlines = await fetchMarketHeadlinesLive({ range: range as any, ticker, query, limit, traceId });
    const anyOk = Object.values(headlines.providers).some((p) => p.ok);
    const all = (headlines.items ?? []).map((it) => NewsItemSchema.parse(it));

    // Deterministically pick Top Stories from fetched headlines.
    const topCandidates = selectTopStories({ items: all, limit: TOP_LIMIT });
    const diagnostics =
      process.env.NODE_ENV !== 'production'
        ? {
            providersTried: Object.keys(headlines.providers || {}),
            itemsPerProvider: headlines.counts?.perProviderRaw ?? {},
            dedupedCount: headlines.counts?.postFilterTotal ?? all.length,
            timeWindowUsed: headlines.window,
            traceId,
          }
        : undefined;

    // mode=all: return raw headlines (no AI, no market reaction).
    if (mode === 'all') {
      if (!anyOk) warnings.push('providers_unavailable');
      if (anyOk && !all.length) warnings.push('empty');

      const updatedAt = (() => {
        const ts = all
          .map((story) => Date.parse(story.publishedAt))
          .filter((n) => Number.isFinite(n))
          .reduce((max, n) => Math.max(max, n), 0);
        return ts ? new Date(ts).toISOString() : new Date().toISOString();
      })();

      const payload = {
        ok: true,
        updatedAt,
        source: anyOk ? headlines.source : 'fallback',
        data: {
          topStories: topCandidates,
          all,
        },
        warnings,
        meta: {
          traceId,
          fetchedAt: new Date().toISOString(),
          providers: headlines.providers,
          counts: headlines.counts,
          cacheHits: { enrichment: openAiCached },
          openAiCalls,
          latencyMs: Date.now() - startedAt,
          ...(diagnostics ? { diagnostics } : {}),
          ...(anyOk ? {} : { reason: 'provider_error' }),
          ...(anyOk && !all.length ? { reason: 'empty' } : {}),
        },
      };

      if (hasTopStories(payload)) {
        setCache(cacheKey, payload, ttlMs);
        setCache(lastGoodKey, payload, LAST_GOOD_TTL_MS);
        return NextResponse.json(payload);
      }

      const lastGood = getCache<any>(lastGoodKey);
      if (lastGood && hasTopStories(lastGood.value)) {
        return NextResponse.json({
          ...lastGood.value,
          meta: {
            ...(lastGood.value.meta ?? {}),
            traceId,
            fetchedAt: new Date().toISOString(),
            stale: true,
            reason: 'last_good_fallback',
            ...(diagnostics ? { diagnostics } : {}),
          },
          warnings: Array.isArray(lastGood.value.warnings)
            ? Array.from(new Set([...lastGood.value.warnings, 'last_good_fallback']))
            : ['last_good_fallback'],
        });
      }

      return NextResponse.json(payload);
    }

    // mode=top: add deterministic/AI enrichment and 1D market reaction vs SPY (best-effort).
    const bench = await getReaction({ symbol: 'SPY', range: '1D', traceId }).catch(() => null);
    const benchPct = typeof bench?.pctChange === 'number' && Number.isFinite(bench.pctChange) ? bench.pctChange : null;

    const topStories: EnrichedTopStory[] = [];

    for (const item of topCandidates) {
      const deterministic = (() => {
        const affectedDet = inferDeterministicAffected(item);
        const affectedTickers = uniqTickers(affectedDet.map((r) => r.ticker)).slice(0, MAX_AFFECTED);
        const sectorTags = inferSectorTags(item);
        const whyItMatters =
          typeof item.summary === 'string' && item.summary.trim() ? item.summary.trim().slice(0, 220) : '';
        const confidence = affectedTickers.length ? 35 : sectorTags.length ? 20 : 10;
        return {
          affectedDet,
          enrichment: {
            affectedTickers,
            sectorTags,
            impactDirection: 'unclear' as const,
            whyItMatters,
            confidence,
          },
        };
      })();

      const cacheId = item.url?.trim() ? item.url.trim() : `${item.id}|${item.title}|${item.publishedAt}`;
      const aiCacheKey = `news:headline:enrich:${hashKey(cacheId)}`;
      const cachedEnrich = getMemory<Enrichment>(aiCacheKey);
      if (cachedEnrich) openAiCached += 1;

      let enrichment: Enrichment = cachedEnrich ?? deterministic.enrichment;

      if (!cachedEnrich && openai && openAiCalls < MAX_OPENAI_CALLS) {
        const candidates = uniqTickers(deterministic.enrichment.affectedTickers);
        const candidateEtfs = Array.from(SECTOR_ETFS);

        openAiCalls += 1;
        try {
          const ai = await enrichWithOpenAI({
            title: item.title,
            summary: item.summary,
            source: item.source,
            candidates: candidates.length ? candidates : [],
            candidateEtfs,
          });

          if (ai) {
            enrichment = {
              affectedTickers: uniqTickers(ai.affectedTickers).slice(0, MAX_AFFECTED),
              sectorTags: Array.isArray(ai.sectorTags) ? ai.sectorTags.slice(0, 3) : deterministic.enrichment.sectorTags,
              impactDirection: ai.impactDirection,
              whyItMatters: ai.whyItMatters,
              confidence: ai.confidence,
            };
          }
        } catch (error) {
          const aiError = formatOpenAiError(error);
          if (isDev) {
            aiErrors.push(aiError);
            console.warn('[market:headlines:enriched] ai_failed', { traceId, ...aiError, raw: toErrorText(error) });
          }
        }

        // Cache best-effort enrichment (AI or deterministic) for stability.
        setMemory(aiCacheKey, enrichment, ENRICH_TTL_MS);
      } else if (!cachedEnrich) {
        // Cache deterministic enrichment when AI is unavailable.
        setMemory(aiCacheKey, enrichment, ENRICH_TTL_MS);
      }

      const tickersForMove = uniqTickers(enrichment.affectedTickers).slice(0, 3);
      const tickerMoves = await Promise.all(
        tickersForMove.map(async (symbol) => {
          const reaction = await getReaction({ symbol, range: '1D', traceId }).catch(() => null);
          const pctChange =
            typeof reaction?.pctChange === 'number' && Number.isFinite(reaction.pctChange) ? reaction.pctChange : null;
          return {
            symbol,
            pctChange,
            deltaVsSpy: typeof pctChange === 'number' && typeof benchPct === 'number' ? pctChange - benchPct : null,
          };
        })
      );

      const hasReaction = Boolean(typeof benchPct === 'number' && tickerMoves.some((m) => typeof m.pctChange === 'number'));

      topStories.push({
        ...item,
        enrichment,
        ...(hasReaction
          ? {
              reaction: {
                benchmark: { symbol: 'SPY', pctChange: benchPct },
                tickers: tickerMoves,
              },
            }
          : {}),
      });
    }

    if (!anyOk) warnings.push('providers_unavailable');
    if (anyOk && !all.length) warnings.push('empty');

    const updatedAt = (() => {
      const ts = (mode === 'all' ? all : topStories)
        .map((story) => Date.parse(story.publishedAt))
        .filter((n) => Number.isFinite(n))
        .reduce((max, n) => Math.max(max, n), 0);
      return ts ? new Date(ts).toISOString() : new Date().toISOString();
    })();

    const payload = {
      ok: true,
      updatedAt,
      source: anyOk ? headlines.source : 'fallback',
      data: {
        topStories,
        ...(mode === 'all' ? { all } : {}),
      },
      warnings,
      meta: {
        traceId,
        fetchedAt: new Date().toISOString(),
        providers: headlines.providers,
        counts: headlines.counts,
        cacheHits: { enrichment: openAiCached },
        openAiCalls,
        latencyMs: Date.now() - startedAt,
        ...(diagnostics ? { diagnostics } : {}),
        ...(anyOk ? {} : { reason: 'provider_error' }),
        ...(anyOk && !all.length ? { reason: 'empty' } : {}),
        ...(isDev && aiErrors.length ? { aiErrors } : {}),
      },
    };

    if (hasTopStories(payload)) {
      setCache(cacheKey, payload, ttlMs);
      setCache(lastGoodKey, payload, LAST_GOOD_TTL_MS);
      return NextResponse.json(payload);
    }

    const lastGood = getCache<any>(lastGoodKey);
    if (lastGood && hasTopStories(lastGood.value)) {
      return NextResponse.json({
        ...lastGood.value,
        meta: {
          ...(lastGood.value.meta ?? {}),
          traceId,
          fetchedAt: new Date().toISOString(),
          stale: true,
          reason: 'last_good_fallback',
          ...(diagnostics ? { diagnostics } : {}),
          ...(isDev && aiErrors.length ? { aiErrors } : {}),
        },
        warnings: Array.isArray(lastGood.value.warnings)
          ? Array.from(new Set([...lastGood.value.warnings, 'last_good_fallback']))
          : ['last_good_fallback'],
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    const lastGood = getCache<any>(lastGoodKey);
    if (lastGood && hasTopStories(lastGood.value)) {
      const fallbackDiagnostics =
        process.env.NODE_ENV !== 'production'
          ? {
              ...(typeof lastGood.value?.meta?.diagnostics === 'object' && lastGood.value.meta.diagnostics
                ? lastGood.value.meta.diagnostics
                : {}),
              traceId,
            }
          : undefined;

      return NextResponse.json({
        ...lastGood.value,
        meta: {
          ...(lastGood.value.meta ?? {}),
          traceId,
          fetchedAt: new Date().toISOString(),
          stale: true,
          reason: 'provider_error_last_good',
          error: toErrorText(error),
          ...(fallbackDiagnostics ? { diagnostics: fallbackDiagnostics } : {}),
        },
        warnings: Array.isArray(lastGood.value.warnings)
          ? Array.from(new Set([...lastGood.value.warnings, 'provider_error', 'last_good_fallback']))
          : ['provider_error', 'last_good_fallback'],
      });
    }

    const payload = {
      ok: true,
      source: 'fallback',
      updatedAt: new Date().toISOString(),
      data: { topStories: [] as EnrichedTopStory[], ...(mode === 'all' ? { all: [] as NewsItem[] } : {}) },
      meta: {
        traceId,
        fetchedAt: new Date().toISOString(),
        reason: 'provider_error',
        error: toErrorText(error),
        ...(isDev && aiErrors.length ? { aiErrors } : {}),
      },
      warnings: ['provider_error'],
    };
    return NextResponse.json(payload);
  }
}
