import 'server-only';

import type OpenAI from 'openai';
import { z } from 'zod';

import { get as getMemory, set as setMemory } from '@/lib/cache/memory';
import { classifySentiment } from '@/lib/macro/sentiment';
import { toErrorText } from '@/lib/providers/utils';
import { sourceQualityWeight } from '@/lib/market/topStories';
import { clusterCacheKey, type EventIntelRange, type EventIntelRegion, type NewsCluster } from '@/lib/events/cluster';

export type EventCategory = 'Geopolitics' | 'Macro' | 'Tech' | 'Energy' | 'Healthcare' | 'Disasters' | 'Policy';
export type ImpactDirection = 'bullish' | 'bearish' | 'mixed' | 'unclear';
export type ImpactTimeframe = 'hours' | 'days' | 'weeks' | 'months';

export type EventImpact = {
  direction: ImpactDirection;
  timeframe: ImpactTimeframe;
  confidence: number;
  reasoning: string;
  // New structured explanation fields
  whyItMatters?: string[]; // 2-3 bullet points
  likelyMarketChannels?: string[]; // rates, FX, commodities, equities
  watchlistAssets?: string[]; // 3-6 tickers/ETFs
  baseCase?: string; // one sentence
  riskCase?: string; // one sentence
};

export type EventEnrichment = {
  category: EventCategory;
  summary: string;
  themeTags: string[];
  affectedTickers: string[];
  affectedSectors: string[];
  impact: EventImpact;
};

const SPDR_SECTORS = [
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
] as const;

const SECTOR_ETF_BY_NAME: Record<(typeof SPDR_SECTORS)[number], string> = {
  Technology: 'XLK',
  Financials: 'XLF',
  Energy: 'XLE',
  'Health Care': 'XLV',
  'Consumer Discretionary': 'XLY',
  'Consumer Staples': 'XLP',
  Industrials: 'XLI',
  Materials: 'XLB',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
  'Communication Services': 'XLC',
};

const CATEGORY_LIST: EventCategory[] = ['Geopolitics', 'Macro', 'Tech', 'Energy', 'Healthcare', 'Disasters', 'Policy'];
const TIMEFRAMES: ImpactTimeframe[] = ['hours', 'days', 'weeks', 'months'];

const EnrichmentSchema = z.object({
  category: z.enum(CATEGORY_LIST),
  summary: z.string().min(1).max(520),
  themeTags: z.array(z.string()).max(5),
  affectedTickers: z.array(z.string()).max(8),
  affectedSectors: z.array(z.enum(SPDR_SECTORS)).max(4),
  impact: z.object({
    direction: z.enum(['bullish', 'bearish', 'mixed', 'unclear']),
    timeframe: z.enum(TIMEFRAMES),
    confidence: z.number().int().min(0).max(100),
    reasoning: z.string().min(1).max(280),
    whyItMatters: z.array(z.string()).min(2).max(3).optional(),
    likelyMarketChannels: z.array(z.enum(['rates', 'FX', 'commodities', 'equities'])).max(4).optional(),
    watchlistAssets: z.array(z.string()).min(3).max(6).optional(),
    baseCase: z.string().max(200).optional(),
    riskCase: z.string().max(200).optional(),
  }),
});

function uniqStrings(raw: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const s = (v || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function classifyCategory(text: string): EventCategory {
  const lower = text.toLowerCase();
  if (lower.includes('war') || lower.includes('sanction') || lower.includes('geopolit') || lower.includes('tariff') || lower.includes('election')) {
    return 'Geopolitics';
  }
  if (lower.includes('cpi') || lower.includes('inflation') || lower.includes('jobs') || lower.includes('unemployment') || lower.includes('fed') || lower.includes('rates') || lower.includes('yields') || lower.includes('gdp')) {
    return 'Macro';
  }
  if (lower.includes('oil') || lower.includes('opec') || lower.includes('crude') || lower.includes('gas') || lower.includes('energy') || lower.includes('lng')) {
    return 'Energy';
  }
  if (lower.includes('fda') || lower.includes('drug') || lower.includes('biotech') || lower.includes('pharma') || lower.includes('health')) {
    return 'Healthcare';
  }
  if (lower.includes('earthquake') || lower.includes('hurricane') || lower.includes('wildfire') || lower.includes('flood') || lower.includes('outage')) {
    return 'Disasters';
  }
  if (lower.includes('doj') || lower.includes('sec') || lower.includes('ftc') || lower.includes('regulation') || lower.includes('policy') || lower.includes('antitrust')) {
    return 'Policy';
  }
  if (lower.includes('chip') || lower.includes('semiconductor') || lower.includes('ai') || lower.includes('software') || lower.includes('cyber') || lower.includes('cloud')) {
    return 'Tech';
  }
  return 'Macro';
}

function inferSectors(text: string): Array<(typeof SPDR_SECTORS)[number]> {
  const lower = text.toLowerCase();
  const sectors: Array<(typeof SPDR_SECTORS)[number]> = [];
  const push = (s: (typeof SPDR_SECTORS)[number]) => {
    if (!sectors.includes(s)) sectors.push(s);
  };

  if (lower.includes('bank') || lower.includes('credit') || lower.includes('financial')) push('Financials');
  if (lower.includes('oil') || lower.includes('opec') || lower.includes('energy') || lower.includes('gas') || lower.includes('crude')) push('Energy');
  if (lower.includes('chip') || lower.includes('semiconductor') || lower.includes('software') || lower.includes('ai')) push('Technology');
  if (lower.includes('pharma') || lower.includes('drug') || lower.includes('biotech') || lower.includes('health')) push('Health Care');
  if (lower.includes('retail') || lower.includes('consumer') || lower.includes('spending')) push('Consumer Discretionary');
  if (lower.includes('grocery') || lower.includes('staples')) push('Consumer Staples');
  if (lower.includes('industrial') || lower.includes('defense') || lower.includes('aerospace')) push('Industrials');
  if (lower.includes('materials') || lower.includes('mining') || lower.includes('copper') || lower.includes('gold')) push('Materials');
  if (lower.includes('utilities') || lower.includes('power') || lower.includes('electric')) push('Utilities');
  if (lower.includes('reit') || lower.includes('real estate')) push('Real Estate');
  if (lower.includes('media') || lower.includes('streaming') || lower.includes('telecom')) push('Communication Services');

  return sectors.slice(0, 4);
}

function inferThemeTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  const push = (t: string) => {
    if (!tags.includes(t)) tags.push(t);
  };
  if (lower.includes('rates') || lower.includes('yield') || lower.includes('treasury')) push('Rates');
  if (lower.includes('inflation') || lower.includes('cpi')) push('Inflation');
  if (lower.includes('jobs') || lower.includes('unemployment') || lower.includes('payroll')) push('Labor');
  if (lower.includes('oil') || lower.includes('opec') || lower.includes('crude')) push('Commodities');
  if (lower.includes('war') || lower.includes('sanction') || lower.includes('geopolit')) push('Geopolitics');
  if (lower.includes('tariff') || lower.includes('trade')) push('Trade Policy');
  if (lower.includes('ai') || lower.includes('semiconductor') || lower.includes('chip')) push('AI / Semis');
  if (lower.includes('cyber') || lower.includes('outage')) push('Operational Risk');
  if (lower.includes('fda') || lower.includes('drug') || lower.includes('biotech')) push('Healthcare');
  return tags.slice(0, 5);
}

function inferTickersFromText(params: { cluster: NewsCluster; sectors: Array<(typeof SPDR_SECTORS)[number]> }): string[] {
  const text = params.cluster.items
    .map((h) => `${h.title} ${h.summary || ''}`)
    .join(' ')
    .slice(0, 6000);

  const direct = new Set<string>();
  // Prefer provider metadata tickers when present.
  for (const item of params.cluster.items) {
    const tickers = Array.isArray(item.tickers) ? item.tickers : [];
    for (const t of tickers) {
      const sym = String(t || '').trim().toUpperCase();
      if (sym && /^[A-Z0-9.\-]{1,7}$/.test(sym)) direct.add(sym);
    }
  }

  // Only accept explicit mentions ($TSLA) / (TSLA) to avoid hallucination in deterministic mode.
  const patterns: RegExp[] = [/\$([A-Z]{1,5})\b/g, /\(([A-Z]{1,5})\)/g, /\b(?:NYSE|NASDAQ|AMEX):\s*([A-Z]{1,5})\b/g];
  for (const re of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = re.exec(text)) !== null) {
      const sym = match[1];
      if (sym && /^[A-Z0-9.\-]{1,7}$/.test(sym)) direct.add(sym);
    }
  }

  const out = Array.from(direct).slice(0, 8);
  if (out.length) return out;

  // Fall back to sector ETFs only (safer) when no explicit tickers exist.
  const etfs = params.sectors.map((s) => SECTOR_ETF_BY_NAME[s]).filter(Boolean);
  return uniqStrings(etfs, 8).map((t) => t.toUpperCase());
}

function sentimentToDirection(sentiment: string): ImpactDirection {
  if (sentiment === 'bullish') return 'bullish';
  if (sentiment === 'bearish') return 'bearish';
  if (sentiment === 'neutral') return 'mixed';
  return 'unclear';
}

function defaultTimeframe(category: EventCategory): ImpactTimeframe {
  if (category === 'Macro' || category === 'Policy') return 'days';
  if (category === 'Geopolitics' || category === 'Disasters') return 'days';
  if (category === 'Energy') return 'days';
  if (category === 'Healthcare') return 'weeks';
  if (category === 'Tech') return 'days';
  return 'days';
}

function deterministicEnrichment(params: { cluster: NewsCluster; range: EventIntelRange; region: EventIntelRegion }): EventEnrichment {
  const rep = params.cluster.representative;
  const blob = params.cluster.items.map((h) => `${h.title} ${h.summary || ''}`).join(' ').slice(0, 8000);
  const sentiment = classifySentiment(blob);
  const category = classifyCategory(`${rep.title} ${rep.summary || ''} ${blob}`);
  const sectors = inferSectors(blob);
  const tickers = inferTickersFromText({ cluster: params.cluster, sectors });
  const themes = inferThemeTags(blob);

  const sentences = toSentences(rep.summary || rep.title || 'Summary unavailable.');
  const summary = sentences.slice(0, 3).join(' ').slice(0, 520) || rep.title || 'Summary unavailable.';

  const base = 15 + Math.min(20, params.cluster.items.length * 3) + Math.max(0, sourceQualityWeight(rep.source) - 1) * 15;
  const confidence = clamp(Math.round(base), 15, 35);

  const direction = sentimentToDirection(sentiment);
  const timeframe = defaultTimeframe(category);
  const reasoningBase =
    category === 'Macro'
      ? 'Macro headlines can reprice discount rates and risk appetite; effects often concentrate in rate-sensitive sectors.'
      : category === 'Geopolitics'
      ? 'Geopolitical risk can shift risk premia and commodity expectations, affecting cyclicals and defensives via sentiment.'
      : category === 'Energy'
      ? 'Energy supply/demand headlines can propagate into inflation expectations and input costs, pressuring or supporting exposed sectors.'
      : category === 'Healthcare'
      ? 'Healthcare policy and regulatory updates can drive repricing in biotech/pharma and spill into risk sentiment.'
      : category === 'Tech'
      ? 'Tech narrative shifts can move growth multiples and positioning, with second-order effects through capex and supply chains.'
      : category === 'Policy'
      ? 'Policy and regulatory actions can change expected profitability and risk premia for affected industries.'
      : 'Event impact is uncertain; watch for confirmation in cross-asset and sector moves.';

  // Generate whyItMatters bullets deterministically
  const whyItMatters = (() => {
    const bullets: string[] = [];
    if (category === 'Macro') {
      bullets.push('Central bank policy changes directly affect discount rates and risk-free rates, repricing all asset classes.');
      bullets.push('Macro indicators shape inflation expectations and growth outlook, driving sector rotation and positioning.');
    } else if (category === 'Geopolitics') {
      bullets.push('Geopolitical events can disrupt supply chains, shift commodity flows, and alter trade relationships.');
      bullets.push('Risk premia adjustments affect safe-haven flows (bonds, gold, USD) and risk assets (equities, commodities).');
    } else if (category === 'Energy') {
      bullets.push('Energy prices drive input costs across industries, affecting corporate margins and consumer spending.');
      bullets.push('Oil and gas supply/demand shifts propagate into inflation expectations and central bank policy responses.');
    } else if (category === 'Healthcare') {
      bullets.push('Regulatory approvals or rejections directly impact drug/biotech valuations and sector performance.');
      bullets.push('Healthcare policy changes can reshape industry profitability and access to markets.');
    } else if (category === 'Tech') {
      bullets.push('Tech narrative shifts drive growth multiple repricing and affect high-beta stocks disproportionately.');
      bullets.push('Technology disruptions ripple through supply chains, capex cycles, and productivity expectations.');
    } else if (category === 'Policy') {
      bullets.push('Regulatory actions change expected profitability and competitive dynamics for affected industries.');
      bullets.push('Policy shifts alter investor positioning and sector allocation strategies.');
    } else {
      bullets.push('This event type can reshape market expectations and risk assessments across asset classes.');
      bullets.push('Watch for confirmation in cross-asset moves and sector rotation patterns.');
    }
    return bullets.slice(0, 3);
  })();

  // Infer likely market channels from category
  const likelyMarketChannels = (() => {
    const channels: string[] = [];
    if (category === 'Macro') {
      channels.push('rates', 'FX', 'equities');
    } else if (category === 'Geopolitics') {
      channels.push('FX', 'commodities', 'equities');
    } else if (category === 'Energy') {
      channels.push('commodities', 'FX', 'equities');
    } else if (category === 'Healthcare' || category === 'Tech') {
      channels.push('equities', 'rates');
    } else if (category === 'Policy') {
      channels.push('equities', 'rates', 'FX');
    } else {
      channels.push('equities');
    }
    return channels;
  })();

  // Use affectedTickers as watchlistAssets (3-6 items)
  const watchlistAssets = uniqStrings(tickers, 6).slice(0, 6);

  // Generate baseCase and riskCase
  const baseCase = (() => {
    if (direction === 'bullish') {
      return `Market responds positively with ${category.toLowerCase()} sector outperformance and supportive cross-asset confirmation.`;
    } else if (direction === 'bearish') {
      return `Market reacts negatively with risk-off positioning and defensive sector rotation.`;
    } else {
      return `Market impact remains limited with sector-specific adjustments and moderate volatility.`;
    }
  })();

  const riskCase = (() => {
    if (direction === 'bullish') {
      return `Risk-off shock or policy reversal could negate positive impact, triggering defensive positioning.`;
    } else if (direction === 'bearish') {
      return `Escalation or spillover effects could amplify negative impact beyond initial estimates.`;
    } else {
      return `Unexpected developments could swing sentiment in either direction, increasing volatility.`;
    }
  })();

  return {
    category,
    summary,
    themeTags: uniqStrings(themes, 5),
    affectedTickers: uniqStrings(tickers, 8),
    affectedSectors: sectors.slice(0, 4),
    impact: {
      direction,
      timeframe,
      confidence,
      reasoning: reasoningBase.slice(0, 280),
      whyItMatters,
      likelyMarketChannels,
      watchlistAssets,
      baseCase,
      riskCase,
    },
  };
}

function normalizeTickerList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const t = (entry || '').trim().toUpperCase();
    if (!t) continue;
    if (t.length > 7) continue;
    if (!/^[A-Z0-9.\-]{1,7}$/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeSummary(text: string): string {
  const sentences = toSentences(text || '').slice(0, 3);
  const joined = sentences.join(' ').trim();
  return (joined || (text || '')).trim().slice(0, 520);
}

export async function enrichCluster(params: {
  cluster: NewsCluster;
  range: EventIntelRange;
  region: EventIntelRegion;
  openai: OpenAI | null;
  model: string;
  traceId: string;
}): Promise<{ enrichment: EventEnrichment; aiUsed: boolean; warning?: string }> {
  const key = clusterCacheKey({ cluster: params.cluster, range: params.range, region: params.region });
  const cached = getMemory<EventEnrichment>(key);
  if (cached) return { enrichment: cached, aiUsed: false };

  const fallback = deterministicEnrichment({ cluster: params.cluster, range: params.range, region: params.region });
  if (!params.openai) {
    setMemory(key, fallback, 12 * 60 * 60 * 1000);
    return { enrichment: fallback, aiUsed: false, warning: 'ai_unavailable' };
  }

  const rep = params.cluster.representative;
  const related = params.cluster.items.slice(0, 6).map((h) => `${h.title}${h.summary ? ` — ${h.summary}` : ''}`);
  const prompt = [
    `Region: ${params.region}`,
    `Range: ${params.range}`,
    `Representative: ${rep.title}${rep.summary ? ` — ${rep.summary}` : ''}`,
    `Related: ${related.slice(1, 6).join(' | ') || 'none'}`,
    `Allowed categories: ${CATEGORY_LIST.join(', ')}`,
    `Allowed sectors: ${SPDR_SECTORS.join(', ')}`,
    `Allowed sector ETFs: ${Object.values(SECTOR_ETF_BY_NAME).join(', ')}`,
  ].join('\n');

  try {
    const resp = await params.openai.responses.create({
      model: params.model,
      temperature: 0,
      text: {
        format: {
          type: 'json_schema',
          name: 'event_intelligence_enrichment',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              category: { type: 'string', enum: CATEGORY_LIST },
              summary: { type: 'string' },
              themeTags: { type: 'array', maxItems: 5, items: { type: 'string' } },
              affectedTickers: { type: 'array', maxItems: 8, items: { type: 'string' } },
              affectedSectors: { type: 'array', maxItems: 4, items: { type: 'string', enum: SPDR_SECTORS as unknown as string[] } },
              impact: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  direction: { type: 'string', enum: ['bullish', 'bearish', 'mixed', 'unclear'] },
                  timeframe: { type: 'string', enum: TIMEFRAMES },
                  confidence: { type: 'integer', minimum: 0, maximum: 100 },
                  reasoning: { type: 'string' },
                  whyItMatters: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } },
                  likelyMarketChannels: { type: 'array', maxItems: 4, items: { type: 'string', enum: ['rates', 'FX', 'commodities', 'equities'] } },
                  watchlistAssets: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' } },
                  baseCase: { type: 'string', maxLength: 200 },
                  riskCase: { type: 'string', maxLength: 200 },
                },
                required: ['direction', 'timeframe', 'confidence', 'reasoning'],
              },
            },
            required: ['category', 'summary', 'themeTags', 'affectedTickers', 'affectedSectors', 'impact'],
          },
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content: [
            'You analyze real-world events and their potential market impacts.',
            'Do NOT give buy/sell instructions.',
            'Use cautious language: potential beneficiaries/headwinds, bullish/bearish/mixed/unclear.',
            'Do not invent facts; if unsure, reduce confidence and keep tickers/sectors broad.',
            'Prefer sector ETFs when the story is macro/geopolitics.',
            'For whyItMatters: Provide 2-3 concise bullet points explaining why this event matters to markets.',
            'For likelyMarketChannels: Select from rates, FX, commodities, equities based on how this event transmits to markets.',
            'For watchlistAssets: Provide 3-6 tickers/ETFs that are most likely to move from this event.',
            'For baseCase and riskCase: One sentence each describing the most likely outcome and key risk scenario.',
            'Return strict JSON only.',
          ].join('\n'),
        },
        { role: 'user', content: `Return JSON per schema.\n\n${prompt}` },
      ],
    });

    const parsedJson = JSON.parse(resp.output_text ?? '{}');
    const parsed = EnrichmentSchema.safeParse(parsedJson);
    if (!parsed.success) {
      setMemory(key, fallback, 12 * 60 * 60 * 1000);
      return { enrichment: fallback, aiUsed: false, warning: 'ai_parse_failed' };
    }

    const normalized: EventEnrichment = {
      category: parsed.data.category,
      summary: normalizeSummary(parsed.data.summary),
      themeTags: uniqStrings(parsed.data.themeTags.map((t) => String(t)), 5),
      affectedTickers: normalizeTickerList(parsed.data.affectedTickers.map((t) => String(t))),
      affectedSectors: parsed.data.affectedSectors.slice(0, 4),
      impact: {
        direction: parsed.data.impact.direction,
        timeframe: parsed.data.impact.timeframe,
        confidence: clamp(parsed.data.impact.confidence, 0, 100),
        reasoning: String(parsed.data.impact.reasoning || '').trim().slice(0, 280) || fallback.impact.reasoning,
        whyItMatters: Array.isArray(parsed.data.impact.whyItMatters) 
          ? uniqStrings(parsed.data.impact.whyItMatters.map((b) => String(b)), 3)
          : fallback.impact.whyItMatters,
        likelyMarketChannels: Array.isArray(parsed.data.impact.likelyMarketChannels)
          ? uniqStrings(parsed.data.impact.likelyMarketChannels.map((c) => String(c)), 4)
          : fallback.impact.likelyMarketChannels,
        watchlistAssets: Array.isArray(parsed.data.impact.watchlistAssets)
          ? normalizeTickerList(parsed.data.impact.watchlistAssets.map((t) => String(t))).slice(0, 6)
          : fallback.impact.watchlistAssets,
        baseCase: String(parsed.data.impact.baseCase || '').trim().slice(0, 200) || fallback.impact.baseCase,
        riskCase: String(parsed.data.impact.riskCase || '').trim().slice(0, 200) || fallback.impact.riskCase,
      },
    };

    // If the model returned no tickers, keep deterministic ETF-only tickers (for demo utility) at low count.
    if (!normalized.affectedTickers.length && fallback.affectedTickers.length) {
      normalized.affectedTickers = fallback.affectedTickers.slice(0, 4);
    }
    // Prefer short, stable tags if AI returns overly generic ones.
    if (!normalized.themeTags.length && fallback.themeTags.length) {
      normalized.themeTags = fallback.themeTags.slice(0, 5);
    }

    setMemory(key, normalized, 12 * 60 * 60 * 1000);
    return { enrichment: normalized, aiUsed: true };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[events:enrich] ai_failed', { traceId: params.traceId, error: toErrorText(error) });
    }
    setMemory(key, fallback, 12 * 60 * 60 * 1000);
    return { enrichment: fallback, aiUsed: false, warning: 'ai_failed' };
  }
}
