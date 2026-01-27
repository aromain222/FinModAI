import { NextRequest } from 'next/server';
import { buildModelFromPrompt } from '@/lib/ai/modelBuilder';
import { ok, badRequest, serverError } from '@/lib/api/respond';
import { logger } from '@/lib/api/logger';

/**
 * POST /api/ai/build-model
 * Builds a minimum useful financial model to answer the user's question
 * 
 * Body: { "prompt": string, "context"?: { ticker?: string, timeframe?: string, baseline?: number } }
 * Returns: ModelAndVizArtifact (valid JSON matching ModelSpec schema)
 */
export async function POST(request: NextRequest) {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = await request.json();
    const prompt = body?.prompt;
    const context = body?.context;

    if (!prompt || typeof prompt !== 'string') {
      return badRequest({ error: 'prompt (string) is required in request body' }, { traceId });
    }

    const artifact = buildModelFromPrompt(prompt, context);

    const elapsed = Date.now() - startedAt;
    logger.info(
      {
        traceId,
        prompt: prompt.substring(0, 100),
        modelKind: artifact.model.kind,
        periods: artifact.model.index.periods.length,
        inputsCount: artifact.model.inputs.length,
        outputsCount: artifact.model.outputs.length,
        elapsed,
      },
      'build-model:success'
    );

    // Return ONLY valid JSON - no wrapper, just the artifact
    return ok({
      data: artifact,
      meta: {
        traceId,
        elapsed,
      },
    });
  } catch (error: any) {
    logger.error({ traceId, error: error.message }, 'build-model:error');
    
    // Return error in string-safe format
    const errorMessage = error.message || 'Failed to build model';
    return serverError({ error: errorMessage }, { traceId });
  }
}

