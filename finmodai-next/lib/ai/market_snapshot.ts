import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { callLLM, parseJSONResponse } from './llm';
import { buildMarketSnapshotPrompt, type MarketSnapshotInput } from './prompts/market_snapshot_prompt';
import { logger } from '@/lib/api/logger';

/**
 * Market Snapshot Output Schema (Zod validation)
 */
export const MarketSnapshotOutputSchema = z.object({
  title: z.string().min(1),
  tone: z.enum(['risk_on', 'neutral', 'risk_off']),
  summary: z.string().min(50).max(800), // 3-5 sentences, max ~300 words (~1800 chars, but we use 800 for safety)
  confidence: z.enum(['high', 'medium', 'low']),
  keyDrivers: z
    .array(
      z
        .object({
          label: z.string().min(1),
          detail: z.string().min(1),
        })
        .strict()
    )
    .max(3),
  risksAndGaps: z
    .array(
      z
        .object({
          label: z.string().min(1),
          detail: z.string().min(1),
        })
        .strict()
    )
    .max(3),
  watchNext: z
    .array(
      z
        .object({
          label: z.string().min(1),
          date: z.string().nullable(), // ISO date string or null
          why: z.string().min(1),
        })
        .strict()
    )
    .max(4),
});

export type MarketSnapshotOutput = z.infer<typeof MarketSnapshotOutputSchema>;

/**
 * Validates and normalizes Market Snapshot output
 */
function validateMarketSnapshotOutput(
  data: unknown,
  traceId: string,
  inputGaps: string[]
): MarketSnapshotOutput {
  try {
    const parsed = MarketSnapshotOutputSchema.parse(data);
    
    // Post-validation: enforce confidence rules based on data gaps
    // If gaps are large, force confidence to low
    const hasLargeGaps = inputGaps.length >= 2 ||
                        parsed.summary.toLowerCase().includes('unavailable') ||
                        parsed.summary.toLowerCase().includes('missing') ||
                        parsed.risksAndGaps.length >= 2;
    
    let adjustedConfidence = parsed.confidence;
    if (hasLargeGaps && parsed.confidence !== 'low') {
      logger.warn({ traceId, originalConfidence: parsed.confidence }, 'market_snapshot:confidence_adjusted_to_low');
      adjustedConfidence = 'low' as const;
    }
    
    // Ensure summary is within reasonable length (3-5 sentences)
    const sentences = parsed.summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length < 3 || sentences.length > 6) {
      logger.warn({ traceId, sentenceCount: sentences.length }, 'market_snapshot:summary_length_warning');
    }
    
    // Enforce max limits and sanitize
    return {
      ...parsed,
      confidence: adjustedConfidence,
      summary: parsed.summary.trim(),
      keyDrivers: parsed.keyDrivers.slice(0, 3).map(d => ({
        label: d.label.trim(),
        detail: d.detail.trim(),
      })),
      risksAndGaps: parsed.risksAndGaps.slice(0, 3).map(r => ({
        label: r.label.trim(),
        detail: r.detail.trim(),
      })),
      watchNext: parsed.watchNext.slice(0, 4).map(w => ({
        label: w.label.trim(),
        date: w.date ? w.date.trim() : null,
        why: w.why.trim(),
      })),
    };
  } catch (error: any) {
    logger.error(
      {
        traceId,
        error: error?.message || String(error),
        issues: error?.issues || [],
      },
      'market_snapshot:validation_error'
    );
    throw new Error(`Market Snapshot validation failed: ${error?.message || String(error)}`);
  }
}

/**
 * Generates Market Snapshot analysis using OpenAI
 * 
 * @param input - Market snapshot input data
 * @param traceId - Optional trace ID for logging
 * @returns Validated Market Snapshot output
 */
export async function generateMarketSnapshot(
  input: MarketSnapshotInput,
  traceId: string = randomUUID()
): Promise<MarketSnapshotOutput> {
  try {
    logger.info({ traceId, hasHeadlines: input.headlines.length > 0, hasGaps: input.dataGaps.length > 0 }, 'market_snapshot:generate:start');

    const { systemPrompt, userPrompt } = buildMarketSnapshotPrompt(input);

    const response = await callLLM({
      traceId,
      systemPrompt,
      userPrompt,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.3, // Lower temperature for more factual, consistent output
      maxTokens: 1500, // Enough for summary + structured data
      responseFormat: { type: 'json_object' }, // Force JSON output
    });

    // Parse JSON response
    const rawOutput = parseJSONResponse<unknown>(response.content, traceId);

    // Validate with Zod schema (pass dataGaps for confidence adjustment)
    const validated = validateMarketSnapshotOutput(rawOutput, traceId, input.dataGaps);

    logger.info(
      {
        traceId,
        hasSummary: !!validated.summary,
        driversCount: validated.keyDrivers.length,
        risksCount: validated.risksAndGaps.length,
        watchNextCount: validated.watchNext.length,
        confidence: validated.confidence,
        usage: response.usage,
      },
      'market_snapshot:generate:success'
    );

    return validated;
  } catch (error: any) {
    logger.error(
      {
        traceId,
        error: error?.message || String(error),
        code: error?.code,
      },
      'market_snapshot:generate:error'
    );

    // Return fallback structure if generation fails
    const hasLargeGaps = input.dataGaps.length >= 2 || input.headlines.length === 0;
    
    return {
      title: 'Market Snapshot',
      tone: 'neutral',
      summary: 'Market analysis unavailable due to insufficient data. Please check data sources and try again.',
      confidence: hasLargeGaps ? 'low' : 'medium',
      keyDrivers: [],
      risksAndGaps: input.dataGaps.length > 0
        ? input.dataGaps.slice(0, 3).map(gap => ({
            label: 'Data limitation',
            detail: gap,
          }))
        : [
            {
              label: 'Analysis unavailable',
              detail: 'Insufficient data to generate market snapshot',
            },
          ],
      watchNext: [],
    };
  }
}

