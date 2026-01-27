import 'server-only';

import type OpenAI from 'openai';
import { z } from 'zod';

import { normalizeTitle } from '@/lib/macro/normalize';

export type EventRegion = 'us' | 'global';

export type EventCategory =
  | 'Geopolitics'
  | 'Macro'
  | 'Earnings'
  | 'Commodities'
  | 'Tech'
  | 'Disaster'
  | 'Other';

export type RawHeadline = {
  id: string;
  title: string;
  summary?: string;
  source: string;
  publishedAt: string;
  url?: string;
  tickers?: string[];
};

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'and',
  'in',
  'on',
  'for',
  'with',
  'as',
  'at',
  'from',
  'after',
  'before',
  'amid',
  'says',
  'say',
  'report',
  'reports',
  'update',
  'live',
  'breaking',
  'stocks',
  'stock',
  'market',
  'markets',
  'shares',
  'futures',
  'price',
  'prices',
  'today',
]);

const SECTOR_ETFS = ['XLE', 'XLF', 'XLK', 'XLI', 'XLU', 'XLV', 'XLY', 'XLP', 'XLB', 'XLRE'] as const;

const DirectionSchema = z.enum(['up', 'down', 'flat']);

const MarketImpactSchema = z.object({
  risk: DirectionSchema,
  vol: DirectionSchema,
  rates: DirectionSchema,
  usd: DirectionSchema,
  commodities: DirectionSchema,
});

const AiSectorSchema = z.object({
  sector: z.string().min(1),
  direction: DirectionSchema,
  confidence: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(180),
});

const AiTickerSchema = z.object({
  ticker: z.string().min(1),
  direction: DirectionSchema,
  confidence: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(180),
});

const AiScenarioSchema = z.object({
  name: z.string().min(1),
  probability: z.number().int().min(0).max(100),
  implication: z.string().min(1).max(240),
});

export const AiEventBriefSchema = z
  .object({
    mechanism: z.array(z.string().min(1).max(120)).min(3).max(6),
    marketImpact: MarketImpactSchema,
    sectors: z.array(AiSectorSchema).max(10),
    tickers: z.array(AiTickerSchema).max(8),
    scenarios: z.array(AiScenarioSchema).max(4),
  })
  .superRefine((value, ctx) => {
    if (value.scenarios.length) {
      const sum = value.scenarios.reduce((acc, s) => acc + (Number.isFinite(s.probability) ? s.probability : 0), 0);
      if (sum < 80 || sum > 120) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Scenario probabilities must sum ~100 (tolerance 80–120); got ${sum}.`,
          path: ['scenarios'],
        });
      }
    }
  });

export type AiEventBrief = z.infer<typeof AiEventBriefSchema>;

function tokenize(title: string): Set<string> {
  const tokens = normalizeTitle(title)
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => t.length >= 3);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function strongEntityOverlap(a: Set<string>, b: Set<string>): boolean {
  let inter = 0;
  for (const t of a) {
    if (t.length <= 3) continue;
    if (b.has(t)) inter += 1;
    if (inter >= 2) return true;
  }
  return false;
}

function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function bestSummary(headlines: RawHeadline[]): string {
  const best = headlines.find((h) => typeof h.summary === 'string' && h.summary.trim().length) ?? headlines[0];
  const raw = (best?.summary || best?.title || '').trim();
  if (!raw) return 'Summary unavailable.';
  const sentences = toSentences(raw);
  if (sentences.length >= 2) return `${sentences[0]} ${sentences[1]}`.slice(0, 260);
  return raw.slice(0, 260);
}

export function classifyCategory(text: string): EventCategory {
  const lower = text.toLowerCase();
  if (lower.includes('war') || lower.includes('sanction') || lower.includes('geopolit') || lower.includes('tariff') || lower.includes('election'))
    return 'Geopolitics';
  if (lower.includes('earthquake') || lower.includes('hurricane') || lower.includes('wildfire') || lower.includes('flood') || lower.includes('outage'))
    return 'Disaster';
  if (lower.includes('cpi') || lower.includes('inflation') || lower.includes('jobs') || lower.includes('unemployment') || lower.includes('fed') || lower.includes('rates') || lower.includes('yields') || lower.includes('gdp'))
    return 'Macro';
  if (lower.includes('earnings') || lower.includes('guidance') || lower.includes('revenue') || lower.includes('eps') || lower.includes('profit'))
    return 'Earnings';
  if (lower.includes('oil') || lower.includes('opec') || lower.includes('crude') || lower.includes('gas') || lower.includes('copper') || lower.includes('gold'))
    return 'Commodities';
  if (lower.includes('chip') || lower.includes('semiconductor') || lower.includes('ai') || lower.includes('software') || lower.includes('cyber'))
    return 'Tech';
  return 'Other';
}

export type HeadlineCluster = {
  id: string;
  tokens: Set<string>;
  headlines: RawHeadline[];
};

export function clusterHeadlines(params: { headlines: RawHeadline[]; threshold?: number }): HeadlineCluster[] {
  const threshold = typeof params.threshold === 'number' ? params.threshold : 0.35;
  const sorted = [...params.headlines].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const clusters: HeadlineCluster[] = [];

  for (const headline of sorted) {
    const title = headline.title || '';
    const tokens = tokenize(title);
    if (!tokens.size) continue;

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < clusters.length; i += 1) {
      const c = clusters[i]!;
      const score = jaccard(tokens, c.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
      if (score >= threshold || strongEntityOverlap(tokens, c.tokens)) {
        bestIdx = i;
        bestScore = Math.max(bestScore, score);
        break;
      }
    }

    if (bestIdx >= 0 && (bestScore >= threshold || strongEntityOverlap(tokens, clusters[bestIdx]!.tokens))) {
      const cluster = clusters[bestIdx]!;
      cluster.headlines.push(headline);
      for (const t of tokens) cluster.tokens.add(t);
    } else {
      clusters.push({
        id: headline.id,
        tokens,
        headlines: [headline],
      });
    }
  }

  return clusters
    .map((c) => ({ ...c, headlines: c.headlines.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)) }))
    .sort((a, b) => (a.headlines[0]?.publishedAt < b.headlines[0]?.publishedAt ? 1 : -1));
}

function safeJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function generateEventBrief(params: {
  openai: OpenAI;
  model: string;
  region: EventRegion;
  category: string;
  headlines: Array<{ title: string; summary?: string; publishedAt: string; source: string }>;
}): Promise<AiEventBrief | null> {
  const inputLines = params.headlines
    .slice(0, 10)
    .map((h) => `- [${h.publishedAt}] (${h.source}) ${h.title}${h.summary ? ` — ${h.summary}` : ''}`)
    .join('\n');

  const resp = await params.openai.responses.create({
    model: params.model,
    temperature: 0,
    text: {
      format: {
        type: 'json_schema',
        name: 'event_intelligence_brief',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            mechanism: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' } },
            marketImpact: {
              type: 'object',
              additionalProperties: false,
              properties: {
                risk: { type: 'string', enum: ['up', 'down', 'flat'] },
                vol: { type: 'string', enum: ['up', 'down', 'flat'] },
                rates: { type: 'string', enum: ['up', 'down', 'flat'] },
                usd: { type: 'string', enum: ['up', 'down', 'flat'] },
                commodities: { type: 'string', enum: ['up', 'down', 'flat'] },
              },
              required: ['risk', 'vol', 'rates', 'usd', 'commodities'],
            },
            sectors: {
              type: 'array',
              maxItems: 10,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sector: { type: 'string' },
                  direction: { type: 'string', enum: ['up', 'down', 'flat'] },
                  confidence: { type: 'integer', minimum: 0, maximum: 100 },
                  reason: { type: 'string' },
                },
                required: ['sector', 'direction', 'confidence', 'reason'],
              },
            },
            tickers: {
              type: 'array',
              maxItems: 8,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ticker: { type: 'string' },
                  direction: { type: 'string', enum: ['up', 'down', 'flat'] },
                  confidence: { type: 'integer', minimum: 0, maximum: 100 },
                  reason: { type: 'string' },
                },
                required: ['ticker', 'direction', 'confidence', 'reason'],
              },
            },
            scenarios: {
              type: 'array',
              maxItems: 4,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  probability: { type: 'integer', minimum: 0, maximum: 100 },
                  implication: { type: 'string' },
                },
                required: ['name', 'probability', 'implication'],
              },
            },
          },
          required: ['mechanism', 'marketImpact', 'sectors', 'tickers', 'scenarios'],
        },
        strict: true,
      },
    },
    input: [
      {
        role: 'system',
        content: [
          'You are an event-intelligence analyst.',
          'You do not give financial advice. Do not use "buy", "sell", or "should".',
          'Use cautious language like "may benefit" / "may be pressured" and avoid certainty.',
          'Ground everything in the provided headlines only. No hallucinated claims.',
          `If tickers are ambiguous, prefer sector ETFs from this list: ${SECTOR_ETFS.join(', ')}.`,
          'Tickers must be US-listed where possible (even in global mode).',
          'Reasons must be short and concrete (<=180 chars).',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Region: ${params.region}`,
          `Category: ${params.category}`,
          'Headlines:',
          inputLines || '- none',
          'Return JSON per schema.',
        ].join('\n'),
      },
    ],
  });

  const json = safeJson<unknown>(resp.output_text ?? '');
  const parsed = AiEventBriefSchema.safeParse(json);
  if (!parsed.success) return null;

  // Normalize tickers (uppercased) and trim fields.
  const normalized: AiEventBrief = {
    ...parsed.data,
    mechanism: parsed.data.mechanism.map((m) => m.trim()).filter(Boolean),
    sectors: parsed.data.sectors.map((s) => ({ ...s, sector: s.sector.trim(), reason: s.reason.trim().slice(0, 180) })),
    tickers: parsed.data.tickers.map((t) => ({
      ...t,
      ticker: t.ticker.trim().toUpperCase(),
      reason: t.reason.trim().slice(0, 180),
    })),
    scenarios: parsed.data.scenarios.map((s) => ({ ...s, name: s.name.trim(), implication: s.implication.trim().slice(0, 240) })),
  };

  return normalized;
}

export function summarizeEventFromCluster(cluster: HeadlineCluster): {
  title: string;
  summary: string;
  occurredAt: string;
  sources: string[];
  headlineCount: number;
} {
  const headlines = cluster.headlines;
  const title = headlines[0]?.title || 'Untitled event';
  const summary = bestSummary(headlines);
  const occurredAt = headlines[0]?.publishedAt || new Date().toISOString();
  const sources = Array.from(new Set(headlines.map((h) => h.source).filter(Boolean)));
  return {
    title,
    summary,
    occurredAt,
    sources,
    headlineCount: headlines.length,
  };
}
