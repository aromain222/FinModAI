/**
 * POST /api/models/[modelId]/generate
 * 
 * Generates model data for an existing model record.
 * The model must exist in the database before calling this endpoint.
 * 
 * This endpoint:
 * - Validates the model exists
 * - Generates the Excel workbook
 * - Updates the model record with file_name (storage key) and status
 * - Returns download URL and preview
 */

import { NextRequest } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { generateTraceId, ok, badRequest, unauthorized, notFound, forbidden, serverError } from '@/lib/api/respond';
import { logRequestStart, logRequestError, logSupabaseError, logRequestSuccess } from '@/lib/api/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  const traceId = generateTraceId();
  const route = 'POST /api/models/[modelId]/generate';
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

    // CRITICAL: Verify model exists and user owns it
    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, user_id, ticker, model_type')
      .eq('id', modelId)
      .maybeSingle();

    if (modelError) {
      logSupabaseError({ traceId, route, modelId }, modelError);
      return serverError('Database error', modelError, traceId);
    }

    if (!model) {
      logRequestError({ traceId, route, modelId }, new Error('Model not found'));
      return notFound('Model not found', `No model found with ID: ${modelId}. Call /api/models/create first.`, 'MODEL_NOT_FOUND', traceId);
    }

    if (model.user_id !== session.user.id) {
      logRequestError({ traceId, route, modelId }, new Error('Forbidden: User does not own model'));
      return forbidden('You do not have permission to generate this model', traceId);
    }

    // Model exists and user owns it - delegate to generateModel route
    const body = await request.json();
    
    // Forward the request to generateModel with modelId in body
    const generateResponse = await fetch(`${request.nextUrl.origin}/api/generateModel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('Cookie') || '',
        'X-Trace-Id': traceId,
      },
      body: JSON.stringify({
        ...body,
        modelId, // Pass the existing modelId
      }),
    });

    if (!generateResponse.ok) {
      const errorData = await generateResponse.json().catch(() => ({}));
      logRequestError({ traceId, route, modelId }, new Error(errorData.error || 'Generation failed'));
      return serverError(
        errorData.error || 'Generation failed',
        new Error(errorData.details || 'Unknown generation error'),
        errorData.traceId || traceId
      );
    }

    const generateData = await generateResponse.json();
    
    // Update model status to ready
    await supabase
      .from('models')
      .update({ status: 'ready' })
      .eq('id', modelId);

    logRequestSuccess({ traceId, route, modelId }, Date.now() - startTime);
    return ok({
      ...generateData,
      modelId, // Ensure modelId is in response
    }, traceId);
  } catch (error) {
    logRequestError({ traceId, route }, error);
    return serverError('Internal server error', error, traceId);
  }
}
