import { NextRequest } from 'next/server';
import { classifyPrompt, PromptClassificationSchema } from '@/lib/ai/promptClassifier';
import { ok, badRequest, serverError } from '@/lib/api/respond';
import { logger } from '@/lib/api/logger';

/**
 * POST /api/ai/classify-prompt
 * Classifies a user prompt to determine if a quantitative model is required
 * 
 * Body: { "prompt": string }
 * Returns: { "buildModel": boolean, "reason": string, "confidence": number }
 */
export async function POST(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = await request.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== 'string') {
      return badRequest({ error: 'prompt (string) is required in request body' }, { traceId });
    }

    const classification = classifyPrompt(prompt);

    // Validate output
    const validated = PromptClassificationSchema.safeParse(classification);
    if (!validated.success) {
      logger.error({ traceId, validationError: validated.error }, 'classify-prompt:validation_failed');
      return serverError({ error: 'Classification validation failed' }, { traceId });
    }

    const elapsed = Date.now() - startedAt;
    logger.info(
      {
        traceId,
        prompt: prompt.substring(0, 100), // Log first 100 chars
        buildModel: classification.buildModel,
        confidence: classification.confidence,
        elapsed,
      },
      'classify-prompt:success'
    );

    return ok({
      data: validated.data,
      meta: {
        traceId,
        elapsed,
      },
    });
  } catch (error: any) {
    logger.error({ traceId, error: error.message }, 'classify-prompt:error');
    return serverError({ error: 'Failed to classify prompt' }, { traceId });
  }
}

/**
 * GET /api/ai/classify-prompt?prompt=...
 * Alternative GET endpoint for prompt classification
 */
export async function GET(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const searchParams = request.nextUrl.searchParams;
    const prompt = searchParams.get('prompt');

    if (!prompt) {
      return badRequest({ error: 'prompt query parameter is required' }, { traceId });
    }

    const classification = classifyPrompt(prompt);

    // Validate output
    const validated = PromptClassificationSchema.safeParse(classification);
    if (!validated.success) {
      logger.error({ traceId, validationError: validated.error }, 'classify-prompt:validation_failed');
      return serverError({ error: 'Classification validation failed' }, { traceId });
    }

    const elapsed = Date.now() - startedAt;
    logger.info(
      {
        traceId,
        prompt: prompt.substring(0, 100),
        buildModel: classification.buildModel,
        confidence: classification.confidence,
        elapsed,
      },
      'classify-prompt:success'
    );

    return ok({
      data: validated.data,
      meta: {
        traceId,
        elapsed,
      },
    });
  } catch (error: any) {
    logger.error({ traceId, error: error.message }, 'classify-prompt:error');
    return serverError({ error: 'Failed to classify prompt' }, { traceId });
  }
}
