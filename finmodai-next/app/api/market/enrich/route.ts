import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { getCache, setCache } from '@/lib/cache/memory';
import { getMarketIndices } from '@/lib/data/marketService';
import { getMacroSnapshot, getMacroEvents } from '@/lib/data/macroService';

export const runtime = 'nodejs';
const isDev = process.env.NODE_ENV !== 'production';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const formatOpenAiError = (error: any) => {
  const status = typeof error?.status === 'number' ? error.status : undefined;
  const code = typeof error?.code === 'string' ? error.code : typeof error?.error?.code === 'string' ? error.error.code : undefined;
  const message = error?.message || 'openai_error';
  return { status, code, message };
};

const EnrichSchema = z.object({
  macroSummary: z.string(),
  marketNarrative: z.string(),
  keyDrivers: z.array(z.string()),
  risks: z.array(z.string()),
  sentiment: z.enum(['Bullish', 'Neutral', 'Bearish']),
  timestamp: z.string(),
  brief: z.string().optional(),
});

type EnrichPayload = z.infer<typeof EnrichSchema>;

const fmtNumber = (value?: number, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null;

const fmtPercent = (value?: number, digits = 2) => {
  const v = fmtNumber(value, digits);
  return v ? `${v}%` : null;
};

const fmtInflation = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  // If the snapshot uses CPI index-level (e.g., ~300), label it explicitly.
  if (value > 50) return `CPI index ${value.toFixed(2)}`;
  return `Inflation ${value.toFixed(2)}%`;
};

type BriefEvent = {
  title: string;
  impactScore?: number | null;
  direction?: string | null;
  channel?: string | null;
  assetClass?: string | null;
  region?: string | null;
  timestamp?: string | null;
  why?: string | null;
  transmission?: string | null;
};

const formatEventsForPrompt = (events: BriefEvent[]): string => {
  return events
    .map((e, idx) => {
      const lines = [
        `Event ${idx + 1}: ${e.title || 'Untitled'}`,
        `Impact score: ${e.impactScore ?? 'n/a'}`,
        `Direction: ${e.direction ?? 'n/a'}`,
        `Channel: ${e.channel ?? 'n/a'}`,
        `Asset class: ${e.assetClass ?? 'n/a'}`,
        `Region: ${e.region ?? 'n/a'}`,
        `Timestamp: ${e.timestamp ?? 'n/a'}`,
        `Why it matters: ${e.why ?? 'n/a'}`,
        `Transmission: ${e.transmission ?? 'n/a'}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n');
};

const computeChangePct = (points: Array<{ v?: number | null }>) => {
  let first: number | null = null;
  let last: number | null = null;
  for (const point of points) {
    const value = point?.v;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (first === null) first = value;
    last = value;
  }
  if (first === null || last === null || first === 0) return null;
  return ((last - first) / first) * 100;
};

const buildFallback = (params: {
  range: string;
  ticker?: string;
  snapshot?: { inflation?: number; unemployment?: number; fedFunds?: number; yield10y?: number; yield2y?: number };
  changePct?: number | null;
}): EnrichPayload => {
  const asOf = new Date().toISOString();
  const changeText =
    typeof params.changePct === 'number'
      ? `${params.changePct >= 0 ? '+' : ''}${params.changePct.toFixed(2)}%`
      : 'unavailable';

  const unemploymentPct = fmtPercent(params.snapshot?.unemployment);
  const fedFundsPct = fmtPercent(params.snapshot?.fedFunds);
  const yield10yPct = fmtPercent(params.snapshot?.yield10y);
  const yield2yPct = fmtPercent(params.snapshot?.yield2y);

  const macroParts = [
    fmtInflation(params.snapshot?.inflation),
    unemploymentPct ? `Unemployment ${unemploymentPct}` : null,
    fedFundsPct ? `Fed funds ${fedFundsPct}` : null,
  ].filter((part): part is string => Boolean(part));

  const macroSummary = macroParts.length ? `Macro snapshot: ${macroParts.join(', ')}.` : 'Macro snapshot unavailable.';

  const marketNarrative = `Market performance ${params.range}: ${
    params.ticker ? params.ticker : 'SPY'
  } change ${changeText}.`;

  const sentiment =
    typeof params.changePct === 'number'
      ? params.changePct > 1
        ? 'Bullish'
        : params.changePct < -1
        ? 'Bearish'
        : 'Neutral'
      : 'Neutral';

  return {
    macroSummary: macroSummary || 'Market commentary unavailable at this time.',
    marketNarrative: marketNarrative || 'Market commentary unavailable at this time.',
    keyDrivers: [
      yield10yPct ? `Rates: 10Y ${yield10yPct}` : null,
      yield2yPct ? `2Y ${yield2yPct}` : null,
    ].filter((v): v is string => Boolean(v)),
    risks: macroParts.length ? [] : ['Macro data coverage incomplete.'],
    sentiment,
    timestamp: asOf,
    brief: `Market Brief — Monitor-Only | ${asOf}\nNo qualifying events. Macro snapshot: ${macroSummary}. Market: ${marketNarrative}`,
  };
};

export async function POST(request: Request) {
  const traceId = crypto.randomUUID();
  const body = await request.json().catch(() => ({}));
  const region = typeof body?.region === 'string' ? body.region : 'GLOBAL';
  const range = typeof body?.range === 'string' ? body.range : '1W';
  const ticker = typeof body?.ticker === 'string' && body.ticker.trim() ? body.ticker.trim().toUpperCase() : undefined;
  const bodyEvents: BriefEvent[] = Array.isArray(body?.events)
    ? body.events
        .map((e: any) => ({
          title: typeof e?.title === 'string' ? e.title : '',
          impactScore: typeof e?.impactScore === 'number' ? e.impactScore : null,
          direction: typeof e?.direction === 'string' ? e.direction : null,
          channel: typeof e?.channel === 'string' ? e.channel : null,
          assetClass: typeof e?.assetClass === 'string' ? e.assetClass : null,
          region: typeof e?.region === 'string' ? e.region : null,
          timestamp: typeof e?.timestamp === 'string' ? e.timestamp : null,
          why: typeof e?.why === 'string' ? e.why : null,
          transmission: typeof e?.transmission === 'string' ? e.transmission : null,
        }))
        .filter((e: BriefEvent) => e.title && e.title.trim().length > 0)
    : [];

  const cacheKey = `market:enrich:${region}:${range}:${ticker ?? 'SPY'}`;
  const cached = getCache<{ payload: EnrichPayload; providerUsed: string }>(cacheKey);
  if (cached && !cached.stale) {
    return NextResponse.json({
      ok: true,
      data: cached.value.payload,
      meta: { asOf: cached.value.payload.timestamp, providerUsed: cached.value.providerUsed, stale: false, traceId },
    });
  }

  try {
    const symbol = ticker || 'SPY';
    const [indices, snapshot, macroEvents] = await Promise.all([
      getMarketIndices({ symbols: [symbol], range, traceId }),
      getMacroSnapshot({ traceId }),
      bodyEvents.length ? Promise.resolve({ data: bodyEvents }) : getMacroEvents({ traceId, limit: 12 }),
    ]);
    const series = indices.items[0];
    const changePct = series ? computeChangePct(series.points) : null;
    let aiError: { status?: number; code?: string; message: string } | undefined;
    const events: BriefEvent[] = (macroEvents as any)?.data
      ? (macroEvents as any).data.map((ev: any) => ({
          title: typeof ev?.title === 'string' ? ev.title : '',
          impactScore: typeof ev?.impact === 'number' ? ev.impact : ev?.impactScore ?? null,
          direction: typeof ev?.direction === 'string' ? ev.direction : null,
          channel: typeof ev?.category === 'string' ? ev.category : null,
          assetClass: typeof ev?.assetClass === 'string' ? ev.assetClass : null,
          region: typeof ev?.region === 'string' ? ev.region : ev?.country ?? null,
          timestamp: typeof ev?.date === 'string' ? ev.date : ev?.publishedAt ?? null,
          why: typeof ev?.description === 'string' ? ev.description : ev?.whyItMatters ?? null,
          transmission: typeof ev?.impactBullets?.[0] === 'string' ? ev.impactBullets.join('; ') : ev?.transmission ?? null,
        }))
      : bodyEvents;
    const formattedEvents = events.length ? formatEventsForPrompt(events) : '';
    if (events.length > 0 && (!formattedEvents || !formattedEvents.includes(events[0]?.title ?? ''))) {
      throw new Error('EVENTS_NOT_INJECTED');
    }
    if (isDev) {
      console.log('[marketBriefAI] eventsCount=', events.length);
      console.log('[marketBriefAI] promptChars=', formattedEvents.length);
    }

    if (!openai) {
      aiError = { code: 'missing_api_key', message: 'OpenAI API key not configured' };
      const fallback = buildFallback({ range, ticker: symbol, snapshot: snapshot.data, changePct });
      setCache(cacheKey, { payload: fallback, providerUsed: 'deterministic' }, 15 * 60 * 1000);
      return NextResponse.json({
        ok: true,
        data: fallback,
        meta: {
          asOf: fallback.timestamp,
          providerUsed: 'deterministic',
          stale: false,
          traceId,
          ...(isDev ? { aiError } : {}),
        },
        ...(isDev ? { warnings: ['ai_unavailable'] } : {}),
      });
    }

    const promptFacts = [
      `Region: ${region}`,
      `Range: ${range}`,
      `Ticker: ${symbol}`,
      `SPY/Index change: ${typeof changePct === 'number' ? changePct.toFixed(2) + '%' : 'unavailable'}`,
      `Inflation: ${fmtInflation(snapshot.data.inflation) ?? 'unavailable'}`,
      `Unemployment: ${fmtPercent(snapshot.data.unemployment) ?? 'unavailable'}`,
      `Fed Funds: ${fmtPercent(snapshot.data.fedFunds) ?? 'unavailable'}`,
      `10Y: ${fmtPercent(snapshot.data.yield10y) ?? 'unavailable'}`,
      `2Y: ${fmtPercent(snapshot.data.yield2y) ?? 'unavailable'}`,
    ].join('\n');
    const eventsBlock =
      events.length === 0
        ? '<<<EVENTS_START>>>\nNo events provided.\n<<<EVENTS_END>>>'
        : `<<<EVENTS_START>>>\n${formattedEvents}\n<<<EVENTS_END>>>`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await openai.responses.create(
        {
          model: 'gpt-5.2-mini',
          temperature: 0,
          text: {
            format: {
              type: 'json_schema',
              name: 'market_enrich',
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  macroSummary: { type: 'string' },
                  marketNarrative: { type: 'string' },
                  keyDrivers: { type: 'array', items: { type: 'string' } },
                  risks: { type: 'array', items: { type: 'string' } },
                  sentiment: { type: 'string', enum: ['Bullish', 'Neutral', 'Bearish'] },
                  timestamp: { type: 'string' },
                  brief: { type: 'string' },
                },
                required: ['macroSummary', 'marketNarrative', 'keyDrivers', 'risks', 'sentiment', 'timestamp', 'brief'],
              },
              strict: true,
            },
          },
          input: [
            {
              role: 'system',
              content:
                'You are a professional macro strategist writing Market Briefs for an institutional fintech terminal. ' +
                'Use ONLY the event data provided between delimiters. Do NOT invent facts. ' +
                'If the provided events do not indicate a clear regime shift, explicitly label the environment as monitor-only. ' +
                'If events are present between <<<EVENTS_START>>> and <<<EVENTS_END>>>, you MUST reference them. ' +
                'Tone: neutral, institutional, decisive. Style: terminal-ready.',
            },
            {
              role: 'user',
              content:
                `Generate a concise Market Brief.\nFacts:\n${promptFacts}\n\nEvents:\n${eventsBlock}\n\n` +
                'Output a JSON per schema with macroSummary, marketNarrative, keyDrivers, risks, sentiment, timestamp, ' +
                'and also a single string field "brief" containing the full brief (header, summary, key developments, why it matters, transmission, bottom line). ' +
                'The brief must reference the events block when events exist. If events are empty, mark as monitor-only.',
            },
          ],
        },
        { signal: controller.signal }
      );
      const text = resp.output_text?.trim() ?? '{}';
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        aiError = aiError ?? { code: 'parse_failed', message: 'OpenAI response was not valid JSON' };
        const fallback = buildFallback({ range, ticker: symbol, snapshot: snapshot.data, changePct });
        setCache(cacheKey, { payload: fallback, providerUsed: 'fallback' }, 15 * 60 * 1000);
        return NextResponse.json({
          ok: true,
          data: fallback,
          meta: {
            asOf: fallback.timestamp,
            providerUsed: 'fallback',
            stale: false,
            traceId,
            ...(isDev && aiError ? { aiError } : {}),
          },
          ...(isDev && aiError ? { warnings: [`ai_failed:${aiError.code ?? 'error'}`] } : {}),
        });
      }
      const parsed = EnrichSchema.safeParse(parsedJson);
      if (!parsed.success) {
        aiError = aiError ?? { code: 'schema_invalid', message: 'OpenAI response failed schema validation' };
        const fallback = buildFallback({ range, ticker: symbol, snapshot: snapshot.data, changePct });
        setCache(cacheKey, { payload: fallback, providerUsed: 'fallback' }, 15 * 60 * 1000);
        return NextResponse.json({
          ok: true,
          data: fallback,
          meta: {
            asOf: fallback.timestamp,
            providerUsed: 'fallback',
            stale: false,
            traceId,
            ...(isDev && aiError ? { aiError } : {}),
          },
          ...(isDev && aiError ? { warnings: [`ai_failed:${aiError.code ?? 'schema'}`] } : {}),
        });
      }
      const payload = { ...parsed.data, timestamp: new Date().toISOString() };
      setCache(cacheKey, { payload, providerUsed: 'openai' }, 15 * 60 * 1000);
      return NextResponse.json({
        ok: true,
        data: payload,
        meta: {
          asOf: payload.timestamp,
          providerUsed: 'openai',
          stale: false,
          traceId,
          ...(isDev && aiError ? { aiError } : {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error: any) {
    const aiError = formatOpenAiError(error);
    if (isDev) console.warn('[market:enrich] fallback path due to error', { traceId, ...aiError });
    const fallback = buildFallback({ range, ticker, snapshot: undefined, changePct: null });
    setCache(cacheKey, { payload: fallback, providerUsed: 'fallback' }, 10 * 60 * 1000);
    return NextResponse.json({
      ok: true,
      data: fallback,
      meta: {
        asOf: fallback.timestamp,
        providerUsed: 'fallback',
        stale: true,
        traceId,
        ...(isDev ? { aiError } : {}),
      },
      ...(isDev ? { warnings: [`ai_failed:${aiError.code ?? 'error'}`] } : {}),
    });
  }
}
