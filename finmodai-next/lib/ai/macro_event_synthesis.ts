/**
 * Macro Event AI Synthesis
 * Optional AI-powered synthesis with strict evidence-only constraints
 */

import 'server-only';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ENV, keysPresent } from '@/lib/env/server';
import { callLLM, parseJSONResponse } from './llm';
import { logger } from '@/lib/api/logger';
import { buildMacroEventSynthesisPrompt, type MacroEventSynthesisInput } from './prompts/macro_event_synthesis_prompt';

/**
 * Output schema for macro event synthesis
 */
export const MacroEventSynthesisOutputSchema = z.object({
  synthesis: z.string().min(20).max(400), // 2-3 sentences, max ~200 words
  certainty: z.enum(['high', 'medium', 'low']),
});

export type MacroEventSynthesisOutput = z.infer<typeof MacroEventSynthesisOutputSchema>;

/**
 * Validate synthesis output with hard constraints
 */
function validateSynthesisOutput(
  data: unknown,
  input: MacroEventSynthesisInput,
  traceId: string
): MacroEventSynthesisOutput {
  // Parse and validate schema
  const parsed = MacroEventSynthesisOutputSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn({ traceId, errors: parsed.error.errors }, 'macro_event_synthesis:validation:failed');
    throw new Error(`Invalid synthesis output: ${parsed.error.errors.map((e) => e.message).join(', ')}`);
  }

  const output = parsed.data;

  // HARD CONSTRAINT: If sources < 2, certainty MUST be low
  if (input.sourceHeadlines.length < 2 && output.certainty !== 'low') {
    logger.warn(
      { traceId, sourceCount: input.sourceHeadlines.length, certainty: output.certainty },
      'macro_event_synthesis:constraint:source_count'
    );
    output.certainty = 'low'; // Force to low
  }

  // HARD CONSTRAINT: If observed impact mostly "—", synthesis must mention limited data
  const missingMetricsCount = input.observedMetrics.filter((m) => m.value === '—').length;
  const totalMetrics = input.observedMetrics.length;
  const hasLimitedData = missingMetricsCount > totalMetrics * 0.5 || totalMetrics === 0;

  if (hasLimitedData) {
    const synthesisLower = output.synthesis.toLowerCase();
    const mentionsLimitedData =
      synthesisLower.includes('limited') ||
      synthesisLower.includes('missing') ||
      synthesisLower.includes('unavailable') ||
      synthesisLower.includes('data coverage') ||
      synthesisLower.includes('incomplete');

    if (!mentionsLimitedData) {
      logger.warn({ traceId, missingMetricsCount, totalMetrics }, 'macro_event_synthesis:constraint:limited_data');
      // Don't modify synthesis automatically, but log warning
      // The prompt should enforce this, but we verify here
    }

    // If mostly missing, certainty should be low or medium at best
    if (missingMetricsCount > totalMetrics * 0.7 && output.certainty === 'high') {
      output.certainty = 'medium';
    }
  }

  // HARD CONSTRAINT: Verify no hallucinated numbers
  // Extract all numbers from synthesis
  const numbersInSynthesis = output.synthesis.match(/\d+\.?\d*/g) || [];
  const validNumbers = new Set<string>();

  // Extract valid numbers from observed metrics
  input.observedMetrics.forEach((m) => {
    if (m.value !== '—') {
      const matches = m.value.match(/\d+\.?\d*/g);
      if (matches) {
        matches.forEach((num) => validNumbers.add(num));
      }
    }
  });

  // Check if any numbers in synthesis are not in valid set
  // Allow common words that might contain numbers (e.g., "2Y", "10Y" as part of labels)
  const suspiciousNumbers = numbersInSynthesis.filter((num) => {
    // Check if it's part of a known metric label pattern
    const isInLabel = input.observedMetrics.some((m) => m.label.includes(num));
    // Check if it's a valid metric value
    const isInValue = validNumbers.has(num);
    // Allow single digits for ordinal positions (e.g., "first", "second")
    const isSmallOrdinal = Number(num) <= 10 && Number(num) >= 1;
    return !isInLabel && !isInValue && !isSmallOrdinal;
  });

  if (suspiciousNumbers.length > 0) {
    logger.warn(
      { traceId, suspiciousNumbers, validNumbers: Array.from(validNumbers) },
      'macro_event_synthesis:constraint:suspicious_numbers'
    );
    // Don't fail, but log warning - prompt should prevent this
  }

  return output;
}

/**
 * Generate AI synthesis for a macro event
 * Returns null if OpenAI is not configured or synthesis fails
 * 
 * @param input Event data with headlines and observed metrics
 * @param traceId Optional trace ID for logging
 * @returns Synthesis output or null if unavailable
 */
export async function generateMacroEventSynthesis(
  input: MacroEventSynthesisInput,
  traceId: string = randomUUID()
): Promise<MacroEventSynthesisOutput | null> {
  // Check if OpenAI is configured
  if (!keysPresent.openai || !ENV.OPENAI_API_KEY) {
    logger.debug({ traceId }, 'macro_event_synthesis:skip:no_openai_key');
    return null;
  }

  try {
    logger.info(
      {
        traceId,
        category: input.category,
        headlineCount: input.sourceHeadlines.length,
        metricsCount: input.observedMetrics.length,
      },
      'macro_event_synthesis:generate:start'
    );

    const { systemPrompt, userPrompt } = buildMacroEventSynthesisPrompt(input);

    const response = await callLLM({
      traceId,
      systemPrompt,
      userPrompt,
      model: ENV.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2, // Lower temperature for more factual, constrained output
      maxTokens: 300, // Enough for 2-3 sentences
      responseFormat: { type: 'json_object' }, // Force JSON output
    });

    // Parse JSON response
    const rawOutput = parseJSONResponse<unknown>(response.content, traceId);

    // Validate with constraints
    const validated = validateSynthesisOutput(rawOutput, input, traceId);

    logger.info(
      {
        traceId,
        category: input.category,
        synthesisLength: validated.synthesis.length,
        certainty: validated.certainty,
        usage: response.usage,
      },
      'macro_event_synthesis:generate:success'
    );

    return validated;
  } catch (error: any) {
    logger.error(
      {
        traceId,
        category: input.category,
        error: error?.message || String(error),
        code: error?.code,
      },
      'macro_event_synthesis:generate:error'
    );

    // Return null on error (optional feature should fail gracefully)
    return null;
  }
}
