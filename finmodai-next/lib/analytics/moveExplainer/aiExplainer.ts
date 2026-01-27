/**
 * AI Move Explainer
 * Generates explanations for price moves with strict citation requirements
 */

import { ENV } from '@/lib/env/server';
import type { MoveEvent, Catalyst, MoveExplanation, BenchmarkComparison } from './types';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: ENV.OPENAI_API_KEY || '',
});

export type ExplainMoveInput = {
  ticker: string;
  move: MoveEvent;
  catalysts: Catalyst[];
  benchmarkComparison?: BenchmarkComparison;
};

/**
 * Generate AI explanation for a move
 * Strict rules: only cite evidence, note uncertainty
 */
export async function explainMove(input: ExplainMoveInput): Promise<MoveExplanation | null> {
  const { ticker, move, catalysts, benchmarkComparison } = input;
  
  // If no OpenAI key, return null (graceful degradation)
  if (!ENV.OPENAI_API_KEY) {
    return null;
  }
  
  // Build evidence summary
  const evidenceText = catalysts
    .flatMap(c => c.evidence)
    .map(e => {
      const date = e.publishedAt || e.date || 'unknown date';
      return `- ${e.title} (${e.source || 'unknown source'}, ${date})`;
    })
    .join('\n');
  
  if (!evidenceText || catalysts.every(c => c.confidence === 'low' && c.evidence.length === 0)) {
    // No evidence - return null to skip AI explanation
    return null;
  }
  
  // Build prompt
  const prompt = `You are a financial analyst explaining a stock price move. Be factual and only reference evidence provided.

Ticker: ${ticker}
Date: ${move.date}
Move: ${move.direction === 'up' ? '+' : ''}${move.returnPct.toFixed(2)}%
${benchmarkComparison ? `Benchmark (${benchmarkComparison.ticker}): ${benchmarkComparison.returnPct >= 0 ? '+' : ''}${benchmarkComparison.returnPct.toFixed(2)}%` : ''}

Evidence:
${evidenceText}

${catalysts.some(c => c.confidence === 'low') ? 'WARNING: Some catalyst confidence is LOW. Use "likely" and note uncertainty in explanation.' : ''}

Generate a JSON response with this exact structure:
{
  "headline": "One-line summary (max 80 chars)",
  "explanation": "3-6 sentences explaining the move based ONLY on evidence provided. If confidence is low, use 'likely' and note uncertainty.",
  "drivers": ["bullet point 1", "bullet point 2", "bullet point 3"],
  "certainty": "high" | "med" | "low",
  "citations": [
    {
      "title": "exact title from evidence",
      "url": "exact url from evidence",
      "source": "exact source from evidence",
      "publishedAt": "exact publishedAt from evidence"
    }
  ]
}

Rules:
- ONLY cite evidence items that were provided
- If evidence is weak, set certainty to "low" and explain uncertainty
- Headline must be factual and not exaggerated
- No markdown in any fields
- Citations must match evidence exactly`;

  try {
    const completion = await openai.chat.completions.create({
      model: ENV.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a financial analyst. You only cite facts from provided evidence. You never hallucinate or make up details.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more factual output
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });
    
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return null;
    }
    
    const parsed = JSON.parse(content) as {
      headline: string;
      explanation: string;
      drivers: string[];
      certainty: 'high' | 'med' | 'low';
      citations: Array<{
        title: string;
        url: string;
        source: string;
        publishedAt: string;
      }>;
    };
    
    // Validate citations match evidence
    const validCitations = parsed.citations.filter(cite => {
      return catalysts.some(cat =>
        cat.evidence.some(ev =>
          ev.title === cite.title &&
          ev.url === cite.url &&
          ev.source === cite.source &&
          (ev.publishedAt === cite.publishedAt || ev.date === cite.publishedAt)
        )
      );
    });
    
    return {
      headline: parsed.headline,
      explanation: parsed.explanation,
      drivers: parsed.drivers,
      certainty: parsed.certainty,
      citations: validCitations,
      benchmarkComparison,
    };
  } catch (error) {
    console.error('[AIExplainer] Failed to generate explanation:', error);
    return null;
  }
}

