/**
 * GET /api/models/[modelId]
 * 
 * Fetches a single model by ID.
 * Returns 404 if model not found or user doesn't have access.
 */

import { NextRequest } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { generateTraceId, ok, badRequest, unauthorized, notFound, forbidden, serverError } from '@/lib/api/respond';
import { logRequestStart, logRequestError, logSupabaseError, logRequestSuccess } from '@/lib/api/logger';
import type { ModelRow } from '@/types/modelContracts';

export async function GET(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  const traceId = generateTraceId();
  const route = 'GET /api/models/[modelId]';
  const startTime = Date.now();

  try {
    const { modelId } = params;

    // Validate modelId
    if (!modelId || typeof modelId !== 'string' || modelId.trim().length === 0) {
      return badRequest('Invalid model ID', 'modelId must be a non-empty string', 'INVALID_MODEL_ID', traceId);
    }

    const supabase = supabaseRouteClient();

    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    logRequestStart({
      traceId,
      route,
      modelId,
      hasSession: !!session?.user,
      userId: session?.user?.id,
    });

    if (authError || !session?.user) {
      logRequestError({ traceId, route, modelId }, authError || new Error('No session'));
      return unauthorized('Authentication required', traceId);
    }

    const sessionUserId = session.user.id;

    console.log('[GET_MODEL][FETCH]', {
      traceId,
      modelId,
      sessionUserId,
    });

    // Fetch model using maybeSingle() so we can log row counts (RLS visibility issues)

    const { data: model, error: modelError } = await supabase
      .from<ModelRow>('models')
      .select('id, ticker, company_name, model_type, type, status, scenario, scenario_adjustment_notes, scenario_summary_notes, assumptions, normalized_assumptions, validation, units, results, preview, error, file_name, r2_key, user_id, created_at, updated_at')
      .eq('id', modelId)
      .eq('user_id', sessionUserId)
      .maybeSingle();

    const rowsReturned = model ? 1 : 0;
    console.log('[GET_MODEL][RESULT]', {
      traceId,
      modelId,
      sessionUserId,
      rowsReturned,
    });

    if (modelError) {
      logSupabaseError({ traceId, route, modelId }, modelError);
      return serverError('Database error', modelError, traceId);
    }

    if (!model) {
      const hint = 'likely RLS/user_id mismatch';
      const notFoundError = new Error('Model not visible to current user');
      logRequestError({ traceId, route, modelId }, notFoundError);
      console.warn('[GET_MODEL][NOT_FOUND]', {
        traceId,
        modelId,
        sessionUserId,
        rowsReturned,
        hint,
      });
      return notFound('Model not found', `No model found with ID: ${modelId}`, 'MODEL_NOT_FOUND', traceId);
    }

    // Ensure user owns the model
    if (model.user_id !== session.user.id) {
      logRequestError({ traceId, route, modelId }, new Error('Forbidden: User does not own model'));
      return forbidden('You do not have permission to access this model', traceId);
    }

    // Parse results/preview if they're JSON strings
    if (typeof model.results === 'string') {
      try {
        model.results = JSON.parse(model.results);
      } catch (e) {
        console.warn('[GET_MODEL] Failed to parse results:', e);
      }
    }
    // Return model (exclude user_id from response)
    const { user_id, ...modelResponse } = model;
    
    // Log keys returned for debugging
    console.log('[GET_MODEL] keys:', Object.keys(modelResponse));
    console.log('[GET_MODEL] has preview:', !!modelResponse.preview);
    console.log('[GET_MODEL] has results:', !!modelResponse.results);
    console.log('[GET_MODEL] has r2_key:', !!modelResponse.r2_key);
    
    logRequestSuccess({ traceId, route, modelId }, Date.now() - startTime);
    return ok(
      modelResponse,
      traceId
    );
  } catch (error) {
    logRequestError({ traceId, route }, error);
    return serverError('Internal server error', error, traceId);
  }
}
