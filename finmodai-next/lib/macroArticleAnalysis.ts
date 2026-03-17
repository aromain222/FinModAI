/**
 * Macro Article Analysis
 * 
 * Generates article summaries and market impact analysis for Macro IQ
 * Tailored for macro/geopolitical context
 */

import OpenAI from 'openai';
import { EVENT_NARRATIVE_JSON_PROMPT } from '@/lib/analyst/prompts';

export interface MacroArticleAnalysis {
  what_happened_sentences: string[]; // 2-3 sentences
  market_impact_sentences: string[]; // 5-6 sentences
  second_order_effects: string[]; // 2-3 bullet points
  affected_channels: string[]; // equities, rates, FX, commodities, credit, volatility, capital flows
  sentiment_by_asset: {
    equities?: 'up' | 'down' | 'mixed';
    rates?: 'up' | 'down' | 'mixed';
    usd?: 'up' | 'down' | 'mixed';
    oil?: 'up' | 'down' | 'mixed';
    credit?: 'up' | 'down' | 'mixed';
    commodities?: 'up' | 'down' | 'mixed';
    fx?: 'up' | 'down' | 'mixed';
  };
  confidence: 'low' | 'medium' | 'high';
  key_numbers?: Array<{ label: string; value: string }>; // Optional
  reasoning_short: string; // 1 sentence internal or tooltip
}

export interface MacroNewsItem {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  summary?: string;
  content?: string;
  snippet?: string;
}

/**
 * Allowed impact channel tags
 */
const ALLOWED_CHANNELS = [
  'equities',
  'rates',
  'fx',
  'commodities',
  'credit',
  'volatility',
  'capital flows',
] as const;

function normalizeChannel(channel: string): string | null {
  if (!channel) return null;
  const normalized = channel.trim().toLowerCase();
  if (normalized === 'foreign exchange') return 'fx';
  if (normalized === 'capital_flows') return 'capital flows';
  return (ALLOWED_CHANNELS as readonly string[]).includes(normalized) ? normalized : null;
}

function fallbackAnalysis(article: MacroNewsItem, reason: string): MacroArticleAnalysis {
  const baseText = article.summary || article.snippet || article.title;
  return {
    what_happened_sentences: [
      baseText,
      'Details remain limited in the available text, so the full implications are not yet clear.',
    ],
    market_impact_sentences: [
      'Market impact likely limited unless further escalation occurs.',
      'Equities and credit could stay range-bound as investors wait for concrete policy follow-through.',
      'Rates and FX may remain anchored to broader macro data rather than this headline.',
      'Commodities would likely react only if the story affects supply, logistics, or sanctions.',
      'Volatility could tick higher if additional developments raise uncertainty in the near term.',
    ],
    second_order_effects: [
      'Positioning may turn more defensive if follow-up headlines increase policy risk.',
      'Policy makers could face pressure to clarify timelines, which may influence market expectations.',
    ],
    affected_channels: ['equities', 'rates', 'fx'],
    sentiment_by_asset: {},
    confidence: 'low',
    key_numbers: undefined,
    reasoning_short: reason,
  };
}

/**
 * Generate macro article analysis
 */
export async function generateMacroArticleAnalysis(
  article: MacroNewsItem,
  openai: OpenAI | null
): Promise<MacroArticleAnalysis> {
  // If no OpenAI, return minimal analysis
  if (!openai) {
    return fallbackAnalysis(article, 'AI analysis unavailable');
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      messages: [
        {
          role: 'system',
          content: `${EVENT_NARRATIVE_JSON_PROMPT}

ADDITIONAL OUTPUT REQUIREMENTS FOR THIS PIPELINE:

You must return JSON with EXACTLY these keys (no others):

what_happened_sentences: array of 2-3 sentences (8-24 words each). Summarize only the new information. Do not restate the headline.
market_impact_sentences: array of 5-6 sentences (12-28 words each). Name affected asset classes, regions, sectors. Explain transmission mechanism. Be directional.
second_order_effects: array of 2-3 bullet points. Focus on spillovers, sentiment shifts, positioning changes, policy reactions.
affected_channels: array, select only from: equities, rates, FX, commodities, credit, volatility, capital flows.
sentiment_by_asset: object with up/down/mixed for relevant assets (equities, rates, usd, oil, credit, commodities, fx).
confidence: low/medium/high.
key_numbers: array of {label, value} if numbers are present in the text (optional).
reasoning_short: one sentence explaining confidence level.

Style: institutional research note, not news summary. Every sentence must add incremental information.
If impact is limited, use: "Market impact likely limited unless further escalation occurs."
No markdown, JSON only.`,
        },
        {
          role: 'user',
          content: `Analyze this macro news article:

Title: ${article.title}
Source: ${article.source}
Published: ${article.publishedAt}
${article.summary ? `Summary: ${article.summary}` : ''}
${article.content ? `Content: ${article.content}` : ''}
${article.snippet ? `Snippet: ${article.snippet}` : ''}

Return JSON only, no markdown.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const analysis = JSON.parse(content) as Partial<MacroArticleAnalysis>;

    const whatHappened = Array.isArray(analysis.what_happened_sentences)
      ? analysis.what_happened_sentences.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
      : [];
    const marketImpact = Array.isArray(analysis.market_impact_sentences)
      ? analysis.market_impact_sentences.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const secondOrder = Array.isArray(analysis.second_order_effects)
      ? analysis.second_order_effects.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
      : [];
    const channels = Array.isArray(analysis.affected_channels)
      ? analysis.affected_channels
          .map((ch) => normalizeChannel(String(ch)))
          .filter((ch): ch is string => Boolean(ch))
          .slice(0, 4)
      : [];

    const validated: MacroArticleAnalysis = {
      what_happened_sentences: whatHappened,
      market_impact_sentences: marketImpact.slice(0, 6),
      second_order_effects: secondOrder,
      affected_channels: channels,
      sentiment_by_asset: analysis.sentiment_by_asset || {},
      confidence: ['low', 'medium', 'high'].includes(analysis.confidence || '')
        ? (analysis.confidence as 'low' | 'medium' | 'high')
        : 'low',
      key_numbers: Array.isArray(analysis.key_numbers) ? analysis.key_numbers : undefined,
      reasoning_short: analysis.reasoning_short || 'Analysis generated',
    };

    const hasValid =
      validated.what_happened_sentences.length >= 2 &&
      validated.what_happened_sentences.length <= 3 &&
      validated.market_impact_sentences.length >= 5 &&
      validated.market_impact_sentences.length <= 6 &&
      validated.second_order_effects.length >= 2 &&
      validated.second_order_effects.length <= 3 &&
      validated.affected_channels.length >= 1;

    if (!hasValid) {
      return fallbackAnalysis(article, 'Fallback applied: schema mismatch or insufficient content.');
    }

    if (!article.content && !article.summary && article.snippet) {
      validated.confidence = 'low';
      validated.reasoning_short = 'Snippet-only source; analysis may be incomplete.';
    }

    return validated;
  } catch (error) {
    console.error('[generateMacroArticleAnalysis] Error:', error);
    
    // Return fallback analysis
    return fallbackAnalysis(article, 'Analysis generation failed');
  }
}

/**
 * Cache key for article analysis
 */
export function getAnalysisCacheKey(article: MacroNewsItem): string {
  return `macro-analysis:${article.url}:${article.publishedAt}`;
}
