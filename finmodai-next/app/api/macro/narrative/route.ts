import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { ENV } from '@/lib/env/server';
import { getMacro } from '@/lib/providers/macro/fred';
import { fetchStooqDailyCSV, filterByRange } from '@/lib/providers/market/stooq';
import { fetchFinnhubSeries } from '@/lib/providers/market/finnhub';
import { fetchDatabentoMarket } from '@/lib/macro/providers/databento';
import { ProviderError } from '@/lib/providers/errors';
import { fetchMacroNewsLive } from '@/lib/news/headlinesPipeline';

export const runtime = 'nodejs';
const isDev = process.env.NODE_ENV !== 'production';

const RangeSchema = z.enum(['1D', '1W', '1M']);
type Range = z.infer<typeof RangeSchema>;

const RegionSchema = z.enum(['global', 'us', 'europe', 'asia']);
type Region = z.infer<typeof RegionSchema>;

const QuerySchema = z.object({
  range: RangeSchema.optional().default('1W'),
  region: RegionSchema.optional().default('global'),
});

type NarrativePayload = {
  macroSummary: string;
  marketNarrative: string;
  keyDrivers: string[];
  risks: string[];
  tone: 'Bullish' | 'Neutral' | 'Bearish';
};

const openai = ENV.OPENAI_API_KEY ? new OpenAI({ apiKey: ENV.OPENAI_API_KEY }) : null;

const formatOpenAiError = (error: any) => {
  const status = typeof error?.status === 'number' ? error.status : undefined;
  const code = typeof error?.code === 'string' ? error.code : typeof error?.error?.code === 'string' ? error.error.code : undefined;
  const message = error?.message || 'openai_error';
  return { status, code, message };
};

const formatMetric = (label: string, value: number | null, date: string | null, unit: string) => {
  if (value == null || !Number.isFinite(value)) return `${label} data unavailable.`;
  const normalizedUnit = unit && unit.trim() ? unit.trim() : '';
  const valueText =
    normalizedUnit.toLowerCase() === 'index'
      ? `index ${value.toFixed(2)}`
      : normalizedUnit
      ? `${value.toFixed(2)}${normalizedUnit}`
      : value.toFixed(2);
  return `${label} ${valueText}${date ? ` (${date})` : ''}.`;
};

const computeChangePct = (points: { t: string; close: number }[]) => {
  if (points.length < 2) return null;
  const first = points[0]?.close ?? 0;
  const last = points[points.length - 1]?.close ?? 0;
  if (!first) return null;
  return ((last - first) / first) * 100;
};

const sentimentFromChange = (changePct: number | null) => {
  if (typeof changePct !== 'number') return 'Neutral';
  if (changePct > 1) return 'Bullish';
  if (changePct < -1) return 'Bearish';
  return 'Neutral';
};

const buildDeterministic = (params: {
  inflation: { value: number | null; date: string | null; unit: string };
  unemployment: { value: number | null; date: string | null; unit: string };
  fedFunds: { value: number | null; date: string | null; unit: string };
  range: Range;
  changePct: number | null;
  headlines: string[];
}): NarrativePayload => {
  // Build analytical summary instead of just listing numbers
  const inflationAnalysis = params.inflation.value != null 
    ? `CPI ${params.inflation.unit.toLowerCase() === 'index' ? `index ${params.inflation.value.toFixed(2)}` : `${params.inflation.value.toFixed(2)}${params.inflation.unit}`}${params.inflation.date ? ` (${params.inflation.date})` : ''}`
    : 'CPI data unavailable';
  
  const unemploymentAnalysis = params.unemployment.value != null
    ? `Unemployment at ${params.unemployment.value.toFixed(2)}${params.unemployment.unit}${params.unemployment.date ? ` (${params.unemployment.date})` : ''}`
    : 'Unemployment data unavailable';
  
  const fedFundsAnalysis = params.fedFunds.value != null
    ? `Fed funds rate at ${params.fedFunds.value.toFixed(2)}${params.fedFunds.unit}${params.fedFunds.date ? ` (${params.fedFunds.date})` : ''}`
    : 'Fed funds data unavailable';

  // Build analytical macro summary
  const macroParts: string[] = [];
  if (params.inflation.value != null) {
    const inflVal = params.inflation.value;
    if (params.inflation.unit.toLowerCase() !== 'index') {
      if (inflVal > 3) macroParts.push(`Inflation elevated at ${inflVal.toFixed(2)}%, above Fed's 2% target, suggesting monetary policy may remain restrictive.`);
      else if (inflVal > 2) macroParts.push(`Inflation at ${inflVal.toFixed(2)}% is above target but moderating, with Fed monitoring progress toward 2% goal.`);
      else macroParts.push(`Inflation at ${inflVal.toFixed(2)}% is at or below target, supporting potential policy easing.`);
    } else {
      macroParts.push(inflationAnalysis);
    }
  }
  if (params.unemployment.value != null) {
    const unempVal = params.unemployment.value;
    if (unempVal < 4) macroParts.push(`Unemployment at ${unempVal.toFixed(2)}% indicates tight labor market with wage pressure risks.`);
    else if (unempVal < 5) macroParts.push(`Unemployment at ${unempVal.toFixed(2)}% remains low, supporting consumption and economic resilience.`);
    else macroParts.push(`Unemployment at ${unempVal.toFixed(2)}% suggests labor market softening, potentially easing inflation pressures.`);
  }
  if (params.fedFunds.value != null) {
    const fedVal = params.fedFunds.value;
    if (fedVal > 5) macroParts.push(`Fed funds at ${fedVal.toFixed(2)}% reflects restrictive monetary policy to combat inflation.`);
    else if (fedVal > 3) macroParts.push(`Fed funds at ${fedVal.toFixed(2)}% indicates moderate policy stance balancing growth and inflation.`);
    else macroParts.push(`Fed funds at ${fedVal.toFixed(2)}% suggests accommodative policy supporting economic activity.`);
  }
  
  const macroSummary = macroParts.length > 0 
    ? macroParts.join(' ')
    : `${inflationAnalysis}. ${unemploymentAnalysis}. ${fedFundsAnalysis}.`;

  const changeText =
    typeof params.changePct === 'number'
      ? `${params.changePct >= 0 ? '+' : ''}${params.changePct.toFixed(2)}%`
      : 'unavailable';
  const headlineText = params.headlines.length ? ` Recent headlines: ${params.headlines.slice(0, 3).join('; ')}.` : '';

  const marketNarrative = `SPY moved ${changeText} over ${params.range}, reflecting market positioning amid current macro conditions.${headlineText}${typeof params.changePct === 'number' ? (params.changePct > 0 ? ' Positive momentum suggests risk-on sentiment.' : params.changePct < 0 ? ' Negative performance indicates risk-off positioning.' : ' Flat performance suggests neutral sentiment.') : ''}`;

  const keyDrivers = [
    params.inflation.value != null
      ? params.inflation.unit.toLowerCase() === 'index'
        ? `CPI index ${params.inflation.value.toFixed(2)} driving policy expectations`
        : `Inflation at ${params.inflation.value.toFixed(2)}${params.inflation.unit} influencing Fed policy path`
      : null,
    params.unemployment.value != null 
      ? `Unemployment ${params.unemployment.value.toFixed(2)}${params.unemployment.unit} reflecting labor market strength`
      : null,
    params.fedFunds.value != null 
      ? `Fed funds at ${params.fedFunds.value.toFixed(2)}${params.fedFunds.unit} setting monetary policy stance`
      : null,
    typeof params.changePct === 'number' 
      ? `SPY ${changeText} over ${params.range} indicating market sentiment`
      : null,
  ].filter((item): item is string => Boolean(item));

  // Generate basic risks based on data
  const risks: string[] = [];
  if (params.inflation.value != null && params.inflation.value > 3 && params.inflation.unit.toLowerCase() !== 'index') {
    risks.push('Elevated inflation may require continued restrictive policy, pressuring growth');
  }
  if (params.unemployment.value != null && params.unemployment.value < 4) {
    risks.push('Tight labor market could sustain wage-driven inflation pressures');
  }
  if (params.fedFunds.value != null && params.fedFunds.value > 5) {
    risks.push('Restrictive monetary policy risks slowing economic growth');
  }
  if (typeof params.changePct === 'number' && params.changePct < -2) {
    risks.push('Market weakness may signal broader economic concerns');
  }

  return {
    macroSummary,
    marketNarrative,
    keyDrivers,
    risks: risks.length > 0 ? risks : ['Monitor key macro data for policy shifts'],
    tone: sentimentFromChange(params.changePct),
  };
};

export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startTime = Date.now();
  
  if (process.env.NODE_ENV !== 'production' || process.env.MACRO_DEBUG_KEYS === '1') {
    console.log('[MACRO_KEYS]', {
      FRED: !!process.env.FRED_API_KEY,
      DATABENTO: !!process.env.DATABENTO_API_KEY,
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
  });

  const { range, region } = parsed.success ? parsed.data : { range: '1W' as Range, region: 'global' as Region };
  const warnings: string[] = [];

  // Use Promise.allSettled to ensure partial results even if some providers fail
  const [macroResult, marketResult, newsResult] = await Promise.allSettled([
    getMacro({ range, region, traceId }),
    (async () => {
      const providers: Record<string, { ok: boolean; status?: number; reason?: string }> = {};
      const record = (name: string, ok: boolean, status?: number, reason?: string) => {
        providers[name] = { ok, status, reason };
      };

      try {
        const databentoPoints = await fetchDatabentoMarket({ symbol: 'SPY', range });
        record('databento', true, 200, databentoPoints.length ? 'ok' : 'empty');
        if (databentoPoints.length) return { sourceUsed: 'databento', points: databentoPoints, providers };
      } catch (error) {
        if (error instanceof ProviderError) record('databento', false, error.status, error.code.toLowerCase());
        else record('databento', false, undefined, 'error');
      }

      try {
        const stooqPoints = filterByRange(await fetchStooqDailyCSV('SPY', traceId), range);
        record('stooq', true, 200, stooqPoints.length ? 'ok' : 'empty');
        if (stooqPoints.length) return { sourceUsed: 'stooq', points: stooqPoints, providers };
      } catch (error) {
        if (error instanceof ProviderError) record('stooq', false, error.status, error.code.toLowerCase());
        else record('stooq', false, undefined, 'error');
      }

      try {
        const finnhub = await fetchFinnhubSeries({ symbol: 'SPY', range, traceId });
        const points = finnhub.data.points.map((point) => ({ t: point.t, close: point.v }));
        record('finnhub', true, 200, points.length ? 'ok' : 'empty');
        if (points.length) return { sourceUsed: 'finnhub', points, providers };
      } catch (error) {
        if (error instanceof ProviderError) record('finnhub', false, error.status, error.code.toLowerCase());
        else record('finnhub', false, undefined, 'error');
      }

      return { sourceUsed: 'none', points: [] as { t: string; close: number }[], providers };
    })(),
    fetchMacroNewsLive({
      range,
      limit: 20, // Increased limit to ensure we get items from any provider
      traceId,
      query: 'Federal Reserve OR inflation OR CPI OR unemployment OR central bank OR interest rates OR GDP OR recession OR yields',
    }),
  ]);

  // Extract results from Promise.allSettled
  const macro = macroResult.status === 'fulfilled' ? macroResult.value : {
    data: { cpi: { value: null, date: null, unit: '%' }, unemployment: { value: null, date: null, unit: '%' }, fedFunds: { value: null, date: null, unit: '%' } },
  };
  const market = marketResult.status === 'fulfilled' ? marketResult.value : { sourceUsed: 'none', points: [] as { t: string; close: number }[], providers: {} };
  const news = newsResult.status === 'fulfilled' ? newsResult.value : { items: [] as any[], source: 'none', providers: {}, counts: { rawTotal: 0, postFilterTotal: 0, perProviderRaw: {} } };

  const inflation = macro.data.cpi;
  const unemployment = macro.data.unemployment;
  const fedFunds = macro.data.fedFunds;

  if (inflation.value == null) warnings.push('inflation_unavailable');
  if (unemployment.value == null) warnings.push('unemployment_unavailable');
  if (fedFunds.value == null) warnings.push('fed_funds_unavailable');

  // Ensure we get news items from ANY provider - if empty, check if any provider succeeded
  const newsItems = news.items ?? [];
  let newsSourceUsed = newsItems.length > 0 ? news.source : 'none';
  
  // If no items but providers succeeded, use first successful provider
  if (newsItems.length === 0 && news.providers) {
    const successfulProvider = Object.entries(news.providers).find(([_, meta]) => meta?.ok === true);
    if (successfulProvider) {
      newsSourceUsed = successfulProvider[0];
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[macro:narrative] Range: ${range}, Elapsed: ${Date.now() - startTime}ms, News source: ${newsSourceUsed}, Items: ${newsItems.length}, Providers: ${Object.keys(news.providers || {}).join(', ') || 'none'}`);
  }

  // Always ensure at least some headlines, even if we need to use fallback text
  const headlineTitles = newsItems
    .map((item) => item.title)
    .filter((title): title is string => typeof title === 'string' && title.trim().length > 0)
    .slice(0, 5);

  const marketPoints = market.points ?? [];
  const changePct = computeChangePct(marketPoints);
  if (!marketPoints.length) warnings.push('market_unavailable');

  // If no headlines available, ensure narrative still returns meaningful content
  const effectiveHeadlines = headlineTitles.length > 0 
    ? headlineTitles 
    : []; // Keep empty - buildDeterministic will handle it

  // If no headlines, add a warning so narrative can explain
  if (headlineTitles.length === 0 && newsItems.length === 0) {
    warnings.push('headlines_unavailable');
  }

  // Build deterministic narrative - will handle empty headlines gracefully
  const deterministic = buildDeterministic({
    inflation: { value: inflation.value, date: inflation.date, unit: inflation.unit || '%' },
    unemployment: { value: unemployment.value, date: unemployment.date, unit: unemployment.unit || '%' },
    fedFunds: { value: fedFunds.value, date: fedFunds.date, unit: fedFunds.unit || '%' },
    range,
    changePct,
    headlines: effectiveHeadlines,
  });

  // If headlines are truly unavailable, update narrative to reflect this
  if (headlineTitles.length === 0 && newsItems.length === 0) {
    deterministic.macroSummary = `Insufficient headlines available; using macro-only context. ${deterministic.macroSummary}`;
    if (!deterministic.risks.some(r => r.toLowerCase().includes('headline'))) {
      deterministic.risks.push('Headlines unavailable - limited visibility into recent market-moving news');
    }
  }

  const elapsedMs = Date.now() - startTime;

  // Count successful providers
  const newsProviderCounts: Record<string, number> = {};
  if (news.providers) {
    Object.entries(news.providers).forEach(([name, meta]) => {
      if (meta?.ok) {
        newsProviderCounts[name] = (newsProviderCounts[name] || 0) + 1;
      }
    });
  }

  const baseResponse = {
    source: 'deterministic',
    updatedAt: new Date().toISOString(),
    data: deterministic,
    warnings: Array.from(new Set(warnings)),
    meta: {
      traceId,
      elapsedMs,
      fetchedAt: new Date().toISOString(),
      providers: {
        news: news.providers || {},
        market: market.providers || {},
      },
      sourceUsed: {
        news: newsSourceUsed,
        market: market.sourceUsed || 'none',
      },
      newsSourceUsed,
      marketSourceUsed: market.sourceUsed || 'none',
      counts: {
        news: news.counts || { rawTotal: 0, postFilterTotal: 0, perProviderRaw: {} },
        marketPoints: marketPoints.length,
      },
      providerCounts: {
        news: newsProviderCounts,
        market: Object.keys(market.providers || {}).length,
      },
      errorsCount: warnings.filter(w => w.includes('unavailable') || w.includes('failed')).length,
      aiAttempted: Boolean(openai),
      aiUsed: false,
    },
  };

  if (!openai) {
    const aiError = { code: 'missing_api_key', message: 'OpenAI API key not configured' };
    return NextResponse.json({
      ...baseResponse,
      warnings: isDev ? [...baseResponse.warnings, 'ai_unavailable'] : baseResponse.warnings,
      meta: {
        ...baseResponse.meta,
        ...(isDev ? { aiError } : {}),
      },
    });
  }

  const prompt = [
    `Region: ${region}`,
    `Range: ${range}`,
    `CPI: ${
      inflation.value != null
        ? inflation.unit.toLowerCase() === 'index'
          ? `index ${inflation.value.toFixed(2)}`
          : `${inflation.value.toFixed(2)}${inflation.unit}`
        : 'unavailable'
    }`,
    `Unemployment: ${unemployment.value != null ? `${unemployment.value.toFixed(2)}${unemployment.unit}` : 'unavailable'}`,
    `Fed funds: ${fedFunds.value != null ? `${fedFunds.value.toFixed(2)}${fedFunds.unit}` : 'unavailable'}`,
    `SPY change: ${typeof changePct === 'number' ? changePct.toFixed(2) + '%' : 'unavailable'}`,
    `Headlines: ${headlineTitles.length ? headlineTitles.join(' | ') : 'unavailable'}`,
  ].join('\n');

  const schema = z.object({
    macroSummary: z.string(),
    marketNarrative: z.string(),
    keyDrivers: z.array(z.string()),
    risks: z.array(z.string()),
    tone: z.enum(['Bullish', 'Neutral', 'Bearish']),
  });

  try {
    const resp = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      temperature: 0,
      text: {
        format: {
          type: 'json_schema',
          name: 'macro_narrative',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              macroSummary: { type: 'string' },
              marketNarrative: { type: 'string' },
              keyDrivers: { type: 'array', items: { type: 'string' } },
              risks: { type: 'array', items: { type: 'string' } },
              tone: { type: 'string', enum: ['Bullish', 'Neutral', 'Bearish'] },
            },
            required: ['macroSummary', 'marketNarrative', 'keyDrivers', 'risks', 'tone'],
          },
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content: `You are a senior macro strategist providing institutional-quality analysis. Use ONLY the provided facts. If a value is unavailable, say so briefly. Avoid hype or investment advice.

Your task is to provide analytical insight, not just data reporting. Explain:
- What the numbers mean in context (e.g., is inflation accelerating/decelerating relative to Fed targets? Is unemployment at concerning levels?)
- Implications for monetary policy, economic growth, and markets
- How metrics interact (e.g., Fed Funds vs inflation, unemployment trends)
- Market positioning and sentiment based on the data
- Key risks and opportunities for investors

Be analytical, not descriptive. Provide insight into WHY these numbers matter and what they imply.`,
        },
        { 
          role: 'user', 
          content: `Generate an analytical macro summary and market narrative. Provide insight into what these numbers mean, their implications, and how they interact.

Facts:
${prompt}

Provide:
- macroSummary: 2-4 sentence analytical summary explaining what these numbers mean and their implications
- marketNarrative: 3-5 sentence analysis of market positioning and sentiment based on the data and headlines
- keyDrivers: 3-5 analytical bullets explaining what's driving macro conditions (not just listing numbers)
- risks: 3-5 specific risks based on the data and current environment
- tone: Overall market tone (Bullish/Neutral/Bearish) based on the data`
        },
      ],
    });
    const parsed = schema.safeParse(JSON.parse(resp.output_text ?? '{}'));
    if (!parsed.success) {
      return NextResponse.json(baseResponse);
    }
    return NextResponse.json({
      source: 'openai',
      updatedAt: new Date().toISOString(),
      data: parsed.data,
      warnings: baseResponse.warnings,
      meta: {
        ...baseResponse.meta,
        aiUsed: true,
      },
    });
  } catch (error) {
    const aiError = formatOpenAiError(error);
    if (isDev) {
      console.warn(`[macro:narrative] AI generation failed after ${Date.now() - startTime}ms:`, { traceId, ...aiError });
    }
    return NextResponse.json({
      ...baseResponse,
      warnings: isDev ? [...baseResponse.warnings, `ai_failed:${aiError.code ?? 'error'}`] : baseResponse.warnings,
      meta: {
        ...baseResponse.meta,
        ...(isDev ? { aiError } : {}),
      },
    });
  }
}
