/**
 * Headline Filter
 *
 * AI-powered curation layer that selects the top market-moving headlines
 * from a batch of raw news items. Used by the market brief pipeline,
 * events engine, and analyst chat to surface only what matters.
 */

import OpenAI from 'openai';
import { HEADLINE_FILTER_PROMPT } from '@/lib/analyst/prompts';
import { getOpenAIKey } from '@/lib/openaiKey';

export type HeadlineCategory =
  | 'CentralBank'
  | 'Macro'
  | 'Geopolitics'
  | 'Conflict'
  | 'Sanctions'
  | 'Energy'
  | 'SovereignDebt'
  | 'EarningsMegaCap';

export interface CuratedHeadline {
  headline: string;
  summary: string;
  category: HeadlineCategory;
  marketImpact: string;
}

export interface RawHeadlineInput {
  title: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
}

const VALID_CATEGORIES: Set<string> = new Set([
  'CentralBank',
  'Macro',
  'Geopolitics',
  'Conflict',
  'Sanctions',
  'Energy',
  'SovereignDebt',
  'EarningsMegaCap',
]);

function normalizeCategory(raw: unknown): HeadlineCategory {
  const value = String(raw || '').trim();
  if (VALID_CATEGORIES.has(value)) return value as HeadlineCategory;

  const lower = value.toLowerCase();
  if (lower.includes('central') || lower.includes('fed') || lower.includes('rate')) return 'CentralBank';
  if (lower.includes('macro') || lower.includes('gdp') || lower.includes('inflation')) return 'Macro';
  if (lower.includes('geo') || lower.includes('diplomacy')) return 'Geopolitics';
  if (lower.includes('conflict') || lower.includes('war') || lower.includes('military')) return 'Conflict';
  if (lower.includes('sanction') || lower.includes('trade') || lower.includes('tariff')) return 'Sanctions';
  if (lower.includes('energy') || lower.includes('oil') || lower.includes('opec')) return 'Energy';
  if (lower.includes('debt') || lower.includes('sovereign') || lower.includes('default')) return 'SovereignDebt';
  if (lower.includes('earning') || lower.includes('mega')) return 'EarningsMegaCap';
  return 'Macro';
}

function buildUserMessage(headlines: RawHeadlineInput[]): string {
  const formatted = headlines
    .slice(0, 50)
    .map((h, i) => {
      let line = `${i + 1}. ${h.title}`;
      if (h.source) line += ` [${h.source}]`;
      if (h.publishedAt) line += ` (${h.publishedAt})`;
      if (h.summary) line += `\n   ${h.summary}`;
      return line;
    })
    .join('\n');

  return `Filter the following ${headlines.length} headlines. Return the top 10 most market-relevant as a JSON array.\n\n${formatted}`;
}

/**
 * Curate the top 10 market-moving headlines from a batch using LLM.
 * Falls back to a deterministic keyword-based filter when AI is unavailable.
 */
export async function filterHeadlines(
  headlines: RawHeadlineInput[],
  options?: { openai?: OpenAI; maxResults?: number }
): Promise<CuratedHeadline[]> {
  const maxResults = options?.maxResults ?? 10;

  if (headlines.length === 0) return [];

  const openai = options?.openai ?? getOpenAIClient();
  if (!openai) return deterministicFallback(headlines, maxResults);

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: HEADLINE_FILTER_PROMPT },
        { role: 'user', content: buildUserMessage(headlines) },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from headline filter');

    const parsed = JSON.parse(content);
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.headlines)
        ? parsed.headlines
        : Array.isArray(parsed.results)
          ? parsed.results
          : [];

    return items
      .slice(0, maxResults)
      .map((item) => {
        const obj = item as Record<string, unknown>;
        return {
          headline: String(obj.headline || '').trim(),
          summary: String(obj.summary || '').trim(),
          category: normalizeCategory(obj.category),
          marketImpact: String(obj.marketImpact || obj.market_impact || '').trim(),
        };
      })
      .filter((h) => h.headline.length > 0 && h.summary.length > 0);
  } catch (error) {
    console.error('[headlineFilter] LLM filter failed, using fallback:', error);
    return deterministicFallback(headlines, maxResults);
  }
}

const MARKET_MOVING_PATTERNS: RegExp[] = [
  /\b(fed|fomc|ecb|boj|pboc|central bank|rate decision|rate cut|rate hike|hawkish|dovish)\b/i,
  /\b(cpi|inflation|gdp|payrolls|jobs report|unemployment|pmi|ism|retail sales)\b/i,
  /\b(invasion|airstrike|missile|sanctions|embargo|blockade|mobilization)\b/i,
  /\b(tariff|trade war|export controls|trade restriction|trade deal)\b/i,
  /\b(oil|opec|production cut|energy crisis|pipeline|natural gas)\b/i,
  /\b(default|sovereign debt|restructuring|capital controls|bank failure)\b/i,
  /\b(nvidia|apple|microsoft|amazon|alphabet|meta|tesla|earnings|guidance|revenue miss|beat)\b/i,
];

const EXCLUDE_PATTERNS: RegExp[] = [
  /\b(analyst says|analyst thinks|price target|upgrade|downgrade|reiterate)\b/i,
  /\b(product launch|new feature|app update|version \d)\b/i,
  /\b(market recap|wrap|roundup|what happened today|morning note)\b/i,
  /\b(how to|best way|tips for|guide to|tutorial)\b/i,
];

function deterministicFallback(
  headlines: RawHeadlineInput[],
  maxResults: number
): CuratedHeadline[] {
  type Scored = { headline: RawHeadlineInput; score: number };
  const scored: Scored[] = [];

  for (const h of headlines) {
    const text = `${h.title} ${h.summary || ''}`;
    if (EXCLUDE_PATTERNS.some((p) => p.test(text))) continue;

    let score = 0;
    for (const pattern of MARKET_MOVING_PATTERNS) {
      if (pattern.test(text)) score += 10;
    }
    if (score > 0) scored.push({ headline: h, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(({ headline: h }) => {
    const text = `${h.title} ${h.summary || ''}`.toLowerCase();
    let category: HeadlineCategory = 'Macro';
    if (/\b(fed|fomc|ecb|boj|rate decision)\b/.test(text)) category = 'CentralBank';
    else if (/\b(invasion|airstrike|missile|mobilization)\b/.test(text)) category = 'Conflict';
    else if (/\b(sanction|embargo|tariff|trade war|export control)\b/.test(text)) category = 'Sanctions';
    else if (/\b(oil|opec|energy|pipeline|natural gas)\b/.test(text)) category = 'Energy';
    else if (/\b(default|sovereign debt|restructuring)\b/.test(text)) category = 'SovereignDebt';
    else if (/\b(nvidia|apple|microsoft|earnings|guidance)\b/i.test(text)) category = 'EarningsMegaCap';
    else if (/\b(invasion|geopolit|diplomacy|border)\b/.test(text)) category = 'Geopolitics';

    return {
      headline: h.title,
      summary: h.summary || h.title,
      category,
      marketImpact: 'Deterministic classification — AI enrichment unavailable.',
    };
  });
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = getOpenAIKey('service');
  return apiKey ? new OpenAI({ apiKey }) : null;
}
